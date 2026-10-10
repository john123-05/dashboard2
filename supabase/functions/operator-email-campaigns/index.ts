import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark, fetchOperatorEmail } from '../_shared/operatorAuth.ts';
import {
  BLOCK_SIZE, automationsAllowed, monthStart, postToMake, quotaFor, renderMail, resolveAudience, usageThisMonth,
  type Segment,
} from '../_shared/emailCommon.ts';

/**
 * operator-email-campaigns (docs/PRODUKT_PLAN.md, F1/F2)
 *
 *   GET  ?park_id=            -> { campaigns, settings, usage: { sent, quota, plan } }
 *   GET  ?park_id=&id=        -> { campaign }
 *   POST { park_id, action: 'save', campaign }          Entwurf anlegen/ändern
 *   POST { park_id, action: 'delete', id }
 *   POST { park_id, action: 'save_settings', settings: { sender_name, reply_to, footer_address } }
 *   POST { park_id, action: 'preview_audience', language, segment }   nur die Anzahl
 *   POST { park_id, action: 'test', id }                Test-Mail an den angemeldeten Betreiber
 *   POST { park_id, action: 'send', id, scheduled_at? } Empfänger in die Warteschlange legen
 *
 * Versendet wird von `park-email-dispatch` (jede Minute) über das Make-Szenario.
 */

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;

function text(value: unknown, max = 300): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanHtml(value: unknown): string {
  const html = typeof value === 'string' ? value.slice(0, 300_000) : '';
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
}

function cleanSegment(value: unknown): Segment {
  const input = (value && typeof value === 'object' ? value : {}) as Row;
  const out: Segment = {};
  if (Array.isArray(input.countries)) {
    out.countries = input.countries.map((c) => text(c, 2).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 60);
  }
  const since = text(input.since, 30);
  if (since && !Number.isNaN(Date.parse(since))) out.since = new Date(since).toISOString();
  return out;
}

const isMissingTable = (error: { code?: string } | null) => error?.code === '42P01' || error?.code === 'PGRST205';

async function loadSettings(parkId: string) {
  const { data } = await supabaseService.from('park_email_settings').select('sender_name, reply_to, footer_address').eq('park_id', parkId).maybeSingle();
  return data ?? null;
}

async function parkName(parkId: string): Promise<string> {
  const { data } = await supabaseService.from('parks').select('name').eq('id', parkId).maybeSingle();
  return String(data?.name ?? 'Liftpictures');
}

async function list(parkId: string) {
  const { data, error } = await supabaseService.from('park_email_campaigns')
    .select('id, name, subject, status, scheduled_at, sent_at, recipients, opened, language, updated_at')
    .eq('park_id', parkId).eq('is_template', false).order('created_at', { ascending: false }).limit(200);
  if (isMissingTable(error)) return { migration_pending: true, campaigns: [], settings: null, usage: { sent: 0, quota: 0, plan: 'marketing_starter' } };
  if (error) throw new Error(error.message);
  const { plan, quota } = await quotaFor(parkId);
  const { data: automations } = await supabaseService.from('park_email_automations')
    .select('type, enabled, campaign_id, delay_hours').eq('park_id', parkId);
  return {
    campaigns: data ?? [],
    settings: await loadSettings(parkId),
    usage: { sent: await usageThisMonth(parkId), quota, plan },
    automations: automations ?? [],
    automations_allowed: await automationsAllowed(parkId),
  };
}

async function saveCampaign(parkId: string, raw: unknown) {
  const c = (raw ?? {}) as Row;
  const name = text(c.name, 120);
  if (!name) return { error: 'Bitte einen Namen eingeben.' };
  const row = {
    park_id: parkId,
    name,
    subject: text(c.subject, 200),
    preheader: text(c.preheader, 200),
    language: text(c.language, 5) || null,
    body_json: Array.isArray(c.body_json) ? c.body_json.slice(0, 80) : [],
    html: cleanHtml(c.html),
    segment: cleanSegment(c.segment),
    updated_at: new Date().toISOString(),
  };
  const id = text(c.id, 40);
  if (id) {
    if (!UUID.test(id)) return { error: 'Ungültige Mail.' };
    const { data: current } = await supabaseService.from('park_email_campaigns').select('status').eq('id', id).eq('park_id', parkId).maybeSingle();
    if (!current) return { error: 'Mail nicht gefunden.' };
    if (current.status !== 'draft') return { error: 'Diese Mail wurde schon versendet oder ist geplant.' };
    const { error } = await supabaseService.from('park_email_campaigns').update(row).eq('id', id).eq('park_id', parkId);
    return error ? { error: error.message } : { ok: true, id };
  }
  const templateFor = text(c.template_for, 20);
  const { data, error } = await supabaseService.from('park_email_campaigns')
    .insert({ ...row, is_template: templateFor === 'welcome' || templateFor === 'season_start' }).select('id').single();
  if (error) return { error: error.message };
  if (templateFor === 'welcome' || templateFor === 'season_start') {
    await supabaseService.from('park_email_automations').upsert(
      { park_id: parkId, type: templateFor, campaign_id: data.id, updated_at: new Date().toISOString() },
      { onConflict: 'park_id,type' },
    );
  }
  return { ok: true, id: data.id as string };
}

/** Empfänger in die Warteschlange legen (gemeinsam für „Senden“ und „Saisonstart“). */
async function queueCampaign(parkId: string, id: string, scheduled: string): Promise<{ error?: string; status?: number; data?: Row }> {
  const { data: campaign } = await supabaseService.from('park_email_campaigns').select('*').eq('id', id).eq('park_id', parkId).maybeSingle();
  if (!campaign) return { error: 'Mail nicht gefunden.', status: 404 };
  if (campaign.status !== 'draft') return { error: 'Diese Mail wurde schon versendet oder ist geplant.', status: 409 };
  const audience = await resolveAudience(parkId, campaign.language, (campaign.segment ?? {}) as Segment);
  if (audience.length === 0) return { error: 'Keine passenden Empfänger mit Einwilligung gefunden.', status: 400 };
  const { quota, plan } = await quotaFor(parkId);
  const used = await usageThisMonth(parkId);
  if (quota === 0) return { error: 'E-Mail-Marketing gehört zu Marketing Starter oder Pro.', status: 403, data: { plan } };
  if (used + audience.length > quota) {
    return { error: `Das Monatskontingent reicht nicht (${used} von ${quota} schon genutzt, ${audience.length} Empfänger).`, status: 403, data: { quota, used } };
  }
  const nowIso = new Date().toISOString();
  const sendAfter = scheduled && !Number.isNaN(Date.parse(scheduled)) && Date.parse(scheduled) > Date.now() ? new Date(scheduled).toISOString() : nowIso;
  const { data: claimed } = await supabaseService.from('park_email_campaigns')
    .update({ status: sendAfter > nowIso ? 'scheduled' : 'sending', scheduled_at: sendAfter, recipients: audience.length, updated_at: nowIso })
    .eq('id', id).eq('status', 'draft').select('id').maybeSingle();
  if (!claimed) return { error: 'Diese Mail ist kein Entwurf mehr.', status: 409 };
  for (let i = 0; i < audience.length; i += 500) {
    const rows = audience.slice(i, i + 500).map((a) => ({ campaign_id: id, park_id: parkId, claim_id: a.claimId, email: a.email, send_after: sendAfter }));
    const { error } = await supabaseService.from('park_email_sends').insert(rows);
    if (error) {
      await supabaseService.from('park_email_sends').delete().eq('campaign_id', id);
      await supabaseService.from('park_email_campaigns').update({ status: 'draft' }).eq('id', id);
      return { error: error.message, status: 500 };
    }
  }
  return { data: { recipients: audience.length, send_after: sendAfter, block_size: BLOCK_SIZE, month: monthStart() } };
}

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const parkId = text(url.searchParams.get('park_id'), 40);
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const auth = await requireOperatorForPark(req, parkId, ['marketing']);
      if (!auth.ok) return json({ error: auth.message }, auth.status);
      const id = text(url.searchParams.get('id'), 40);
      if (id) {
        if (!UUID.test(id)) return json({ error: 'Invalid id' }, 400);
        const { data } = await supabaseService.from('park_email_campaigns').select('*').eq('id', id).eq('park_id', auth.parkId).maybeSingle();
        return data ? json({ ok: true, data: { campaign: data } }) : json({ error: 'Mail nicht gefunden.' }, 404);
      }
      return json({ ok: true, data: await list(auth.parkId) });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => null) as Row | null;
    const parkId = text(body?.park_id, 40);
    if (!body || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOperatorForPark(req, parkId, ['marketing']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const action = text(body.action, 30);

    if (action === 'save') {
      const result = await saveCampaign(auth.parkId, body.campaign);
      return 'error' in result ? json({ error: result.error }, 400) : json({ ok: true, data: { id: result.id } });
    }

    if (action === 'delete') {
      const id = text(body.id, 40);
      if (!UUID.test(id)) return json({ error: 'Invalid id' }, 400);
      const { error } = await supabaseService.from('park_email_campaigns').delete().eq('id', id).eq('park_id', auth.parkId).eq('status', 'draft');
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    if (action === 'save_settings') {
      const s = (body.settings ?? {}) as Row;
      const sender = text(s.sender_name, 120);
      const replyTo = text(s.reply_to, 200).toLowerCase();
      const footer = text(s.footer_address, 500);
      if (!sender || !footer) return json({ error: 'Absendername und Adresse sind Pflicht.' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(replyTo)) return json({ error: 'Bitte eine gültige Antwort-Adresse eingeben.' }, 400);
      const { error } = await supabaseService.from('park_email_settings').upsert(
        { park_id: auth.parkId, sender_name: sender, reply_to: replyTo, footer_address: footer, updated_at: new Date().toISOString() },
        { onConflict: 'park_id' },
      );
      return error ? json({ error: error.message }, 400) : json({ ok: true, data: { settings: await loadSettings(auth.parkId) } });
    }

    if (action === 'preview_audience') {
      const audience = await resolveAudience(auth.parkId, text(body.language, 5) || null, cleanSegment(body.segment));
      return json({ ok: true, data: { count: audience.length } });
    }

    const webhook = Deno.env.get('MAKE_PARK_EMAIL_WEBHOOK_URL') ?? '';
    const secret = Deno.env.get('EMAIL_LINK_SECRET') ?? '';
    const fromEmail = Deno.env.get('PARK_EMAIL_FROM_ADDRESS') ?? '';
    const functionsBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

    if (action === 'test' || action === 'send') {
      if (!webhook || !secret || !fromEmail) return json({ error: 'Der E-Mail-Versand ist noch nicht eingerichtet (Make-Adresse und Schlüssel fehlen).' }, 503);
      const id = text(body.id, 40);
      if (!UUID.test(id)) return json({ error: 'Invalid id' }, 400);
      const { data: campaign } = await supabaseService.from('park_email_campaigns').select('*').eq('id', id).eq('park_id', auth.parkId).maybeSingle();
      if (!campaign) return json({ error: 'Mail nicht gefunden.' }, 404);
      const settings = await loadSettings(auth.parkId);
      if (!settings) return json({ error: 'Bitte zuerst Absender, Antwort-Adresse und Adresse in den Einstellungen eintragen.' }, 400);
      if (!String(campaign.subject).trim() || !String(campaign.html).trim()) return json({ error: 'Betreff und Inhalt sind Pflicht.' }, 400);
      const name = await parkName(auth.parkId);

      if (action === 'test') {
        const to = await fetchOperatorEmail(req);
        if (!to) return json({ error: 'Test-Mail ist nur mit deinem Betreiber-Login möglich.' }, 400);
        const html = await renderMail({
          html: String(campaign.html), preheader: String(campaign.preheader), parkName: name, footerAddress: settings.footer_address,
          senderName: settings.sender_name, name: 'Alex', claimId: crypto.randomUUID(), sendId: crypto.randomUUID(), functionsBase, secret,
        });
        const sent = await postToMake(webhook, {
          recipients: [{ to, subject: `[Test] ${campaign.subject}`, html }], fromName: settings.sender_name, fromEmail, replyTo: settings.reply_to,
        });
        return sent.ok ? json({ ok: true, data: { to } }) : json({ error: sent.error ?? 'Versand fehlgeschlagen' }, 502);
      }

      const queued = await queueCampaign(auth.parkId, id, text(body.scheduled_at, 40));
      return queued.error ? json({ error: queued.error, ...(queued.data ?? {}) }, queued.status ?? 400) : json({ ok: true, data: queued.data });
    }

    if (action === 'save_automation') {
      const type = text(body.type, 20);
      if (type !== 'welcome') return json({ error: 'Unbekannte Automation.' }, 400);
      if (!(await automationsAllowed(auth.parkId))) return json({ error: 'Automationen gehören zu Marketing Pro.' }, 403);
      const enabled = body.enabled === true;
      const delay = Math.min(720, Math.max(0, Math.round(Number(body.delay_hours) || 0)));
      const { data: current } = await supabaseService.from('park_email_automations').select('campaign_id').eq('park_id', auth.parkId).eq('type', type).maybeSingle();
      if (enabled) {
        if (!current?.campaign_id) return json({ error: 'Bitte zuerst die Mail für diese Automation schreiben.' }, 400);
        const { data: template } = await supabaseService.from('park_email_campaigns').select('subject, html').eq('id', current.campaign_id).maybeSingle();
        if (!template || !String(template.subject).trim() || !String(template.html).trim()) return json({ error: 'Die Mail braucht Betreff und Inhalt.' }, 400);
        if (!(await loadSettings(auth.parkId))) return json({ error: 'Bitte zuerst die Absender-Einstellungen ausfüllen.' }, 400);
      }
      const { error } = await supabaseService.from('park_email_automations').upsert(
        { park_id: auth.parkId, type, enabled, delay_hours: delay, updated_at: new Date().toISOString() },
        { onConflict: 'park_id,type' },
      );
      return error ? json({ error: error.message }, 400) : json({ ok: true, data: await list(auth.parkId) });
    }

    if (action === 'send_template') {
      // Saisonstart: Kopie der Vorlage als neue Mail an alle Gäste mit Einwilligung.
      if (!(await automationsAllowed(auth.parkId))) return json({ error: 'Automationen gehören zu Marketing Pro.' }, 403);
      if (!webhook || !secret || !fromEmail) return json({ error: 'Der E-Mail-Versand ist noch nicht eingerichtet.' }, 503);
      if (!(await loadSettings(auth.parkId))) return json({ error: 'Bitte zuerst die Absender-Einstellungen ausfüllen.' }, 400);
      const { data: auto } = await supabaseService.from('park_email_automations').select('campaign_id').eq('park_id', auth.parkId).eq('type', 'season_start').maybeSingle();
      if (!auto?.campaign_id) return json({ error: 'Bitte zuerst die Saisonstart-Mail schreiben.' }, 400);
      const { data: template } = await supabaseService.from('park_email_campaigns').select('*').eq('id', auto.campaign_id).maybeSingle();
      if (!template || !String(template.subject).trim() || !String(template.html).trim()) return json({ error: 'Die Mail braucht Betreff und Inhalt.' }, 400);
      const stamp = new Date().toLocaleDateString('de-DE');
      const { data: copy, error: copyError } = await supabaseService.from('park_email_campaigns').insert({
        park_id: auth.parkId, name: `${template.name} (${stamp})`, subject: template.subject, preheader: template.preheader, language: template.language,
        body_json: template.body_json, html: template.html, segment: template.segment, is_template: false,
      }).select('id').single();
      if (copyError || !copy) return json({ error: copyError?.message ?? 'Kopie fehlgeschlagen' }, 500);
      const queued = await queueCampaign(auth.parkId, copy.id as string, '');
      if (queued.error) {
        await supabaseService.from('park_email_campaigns').delete().eq('id', copy.id);
        return json({ error: queued.error, ...(queued.data ?? {}) }, queued.status ?? 400);
      }
      return json({ ok: true, data: queued.data });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'E-Mail-Marketing nicht verfügbar' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);

