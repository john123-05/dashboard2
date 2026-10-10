import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { BLOCK_SIZE, monthStart, postToMake, renderMail } from '../_shared/emailCommon.ts';

/**
 * park-email-dispatch (docs/PRODUKT_PLAN.md, F1) – jede Minute per pg_cron, verify_jwt = false.
 * Schutz: Kopfzeile `x-dispatch-secret` muss dem Secret EMAIL_LINK_SECRET entsprechen.
 * Nimmt bis zu 3 Blöcke à 100 wartende Mails, baut das HTML je Empfänger, ruft den Make-Webhook
 * (Make antwortet sofort "Accepted" und sendet im Hintergrund) und zählt das Monatskontingent.
 */

const MAX_BLOCKS = 3;
type Row = Record<string, unknown>;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const secret = Deno.env.get('EMAIL_LINK_SECRET') ?? '';
  const webhook = Deno.env.get('MAKE_PARK_EMAIL_WEBHOOK_URL') ?? '';
  const fromEmail = Deno.env.get('PARK_EMAIL_FROM_ADDRESS') ?? '';
  if (!secret || req.headers.get('x-dispatch-secret') !== secret) return json({ error: 'forbidden' }, 403);
  if (!webhook || !fromEmail) return json({ error: 'not configured' }, 503);
  const functionsBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;

  const nowIso = new Date().toISOString();
  const { data: queued } = await supabaseService.from('park_email_sends')
    .select('id, campaign_id, park_id, claim_id, email')
    .eq('status', 'queued').lte('send_after', nowIso).order('send_after').limit(BLOCK_SIZE * MAX_BLOCKS);
  const rows = (queued ?? []) as Row[];
  if (rows.length === 0) return json({ ok: true, handed_over: 0 });

  // Nach Kampagne gruppieren, je Block höchstens 100.
  const byCampaign = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.campaign_id);
    byCampaign.set(key, [...(byCampaign.get(key) ?? []), row]);
  }

  let handedOver = 0;
  for (const [campaignId, sends] of byCampaign) {
    const { data: campaign } = await supabaseService.from('park_email_campaigns').select('*').eq('id', campaignId).maybeSingle();
    if (!campaign) continue;
    const parkId = String(campaign.park_id);
    const [{ data: settings }, { data: park }] = await Promise.all([
      supabaseService.from('park_email_settings').select('sender_name, reply_to, footer_address').eq('park_id', parkId).maybeSingle(),
      supabaseService.from('parks').select('name').eq('id', parkId).maybeSingle(),
    ]);
    if (!settings) {
      await supabaseService.from('park_email_sends').update({ status: 'failed', error: 'Absender-Einstellungen fehlen' }).in('id', sends.map((s) => s.id));
      continue;
    }
    const claimIds = sends.map((s) => String(s.claim_id));
    const { data: claims } = await supabaseService.from('photo_claims').select('id, full_name').in('id', claimIds);
    const nameOf = new Map((claims ?? []).map((c: Row) => [String(c.id), String(c.full_name ?? '')]));

    for (let i = 0; i < sends.length; i += BLOCK_SIZE) {
      const block = sends.slice(i, i + BLOCK_SIZE);
      const recipients = [];
      for (const send of block) {
        recipients.push({
          to: String(send.email),
          subject: String(campaign.subject),
          html: await renderMail({
            html: String(campaign.html), preheader: String(campaign.preheader), parkName: String(park?.name ?? ''),
            footerAddress: settings.footer_address, senderName: settings.sender_name,
            name: nameOf.get(String(send.claim_id)) ?? '', claimId: String(send.claim_id), sendId: String(send.id), functionsBase, secret,
          }),
        });
      }
      const result = await postToMake(webhook, { recipients, fromName: settings.sender_name, fromEmail, replyTo: settings.reply_to });
      const ids = block.map((s) => s.id);
      if (result.ok) {
        await supabaseService.from('park_email_sends').update({ status: 'handed_over', handed_over_at: new Date().toISOString() }).in('id', ids);
        handedOver += block.length;
        const month = monthStart();
        const { data: usage } = await supabaseService.from('park_email_usage').select('sent').eq('park_id', parkId).eq('month', month).maybeSingle();
        await supabaseService.from('park_email_usage').upsert({ park_id: parkId, month, sent: Number(usage?.sent ?? 0) + block.length }, { onConflict: 'park_id,month' });
      } else {
        // Nicht verloren: bleibt in der Warteschlange und wird beim nächsten Lauf erneut versucht.
        await supabaseService.from('park_email_sends').update({ error: result.error ?? 'Make-Fehler' }).in('id', ids);
      }
    }

    // Alle Mails der Kampagne erledigt? Dann abschließen.
    const { count } = await supabaseService.from('park_email_sends').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'queued');
    if (count === 0) {
      await supabaseService.from('park_email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', campaignId);
    } else if (campaign.status === 'scheduled') {
      await supabaseService.from('park_email_campaigns').update({ status: 'sending' }).eq('id', campaignId);
    }
  }
  return json({ ok: true, handed_over: handedOver });
}

if (import.meta.main) Deno.serve(handler);
