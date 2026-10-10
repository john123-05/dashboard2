// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/park-email-dispatch/index.ts (erzeugt mit scripts/build-paste.py)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';


// For functions deployed directly onto the shared LiftPictures production
// project (kvpcwlcfgmsmarjtwpsx) — admin_users lives right here, so no
// cross-project lookup is needed (contrast with ../staffAuth.ts, which is
// for functions deployed on dashboard2's own project that need to verify
// staff membership against that other project instead).
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  const { data: adminRow, error: adminError } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false, status: 500, message: adminError.message };
  }

  if (!adminRow) {
    return { ok: false, status: 403, message: 'Not an admin user' };
  }

  return { ok: true, userId: userData.user.id };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export const LEAD_TEMPERATURES = ['heiss', 'warm', 'kalt'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export function isValidTemperature(value: unknown): value is LeadTemperature {
  return typeof value === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(value);
}


const OPERATOR_SUPABASE_URL = Deno.env.get("OPERATOR_SUPABASE_URL") ??
  "https://xcrxltiiovpoladpaewd.supabase.co";
const OPERATOR_SUPABASE_ANON_KEY = Deno.env.get("OPERATOR_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ";

export type OperatorAuthResult =
  | { ok: true; userId: string; parkId: string; organizationId: string | null }
  | { ok: false; status: number; message: string };

type OperatorUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

function normalizeParkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getAllowedParkIds(user: OperatorUser | null): string[] {
  const metadata = user?.app_metadata ?? {};
  return normalizeParkIds(metadata.allowed_park_ids ?? metadata.park_ids);
}

async function fetchOperatorUser(token: string): Promise<OperatorUser | null> {
  const response = await fetch(`${OPERATOR_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: OPERATOR_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id
    ? { id: String(user.id), app_metadata: user.app_metadata ?? null }
    : null;
}

async function fetchAccessiblePark(
  token: string,
  parkId: string,
): Promise<{ id: string; organization_id: string | null } | null> {
  const response = await fetch(
    `${OPERATOR_SUPABASE_URL}/rest/v1/parks?select=id,organization_id&id=eq.${
      encodeURIComponent(parkId)
    }`,
    {
      headers: {
        apikey: OPERATOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id
    ? {
      id: String(row.id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
    }
    : null;
}

async function requireOperatorForParkBase(
  req: Request,
  parkId: string,
): Promise<OperatorAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  const user = await fetchOperatorUser(token);
  if (!user) {
    // Kein Betreiber-Token: im Staff-CRM kommt das Token des gemeinsamen Projekts.
    // Staff (admin_users) darf jeden Park sehen.
    const staff = await requireAdminFromRequest(req);
    if (staff.ok) {
      const { data: park } = await supabaseService
        .from("parks")
        .select("id, organization_id")
        .eq("id", parkId)
        .maybeSingle();
      if (!park) return { ok: false, status: 404, message: "Park not found" };
      return {
        ok: true,
        userId: staff.userId,
        parkId: String(park.id),
        organizationId: park.organization_id ? String(park.organization_id) : null,
      };
    }
    return { ok: false, status: 401, message: "Invalid operator auth token" };
  }

  const allowedParkIds = getAllowedParkIds(user);
  if (allowedParkIds.length > 0 && !allowedParkIds.includes(parkId)) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  const park = await fetchAccessiblePark(token, parkId);
  if (!park) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  return {
    ok: true,
    userId: user.id,
    parkId: park.id,
    organizationId: park.organization_id,
  };
}

/**
 * Prüft zusätzlich die Seitenrechte eines Mitarbeiters (docs/PRODUKT_PLAN.md, H3).
 * `pages`: Seiten-Schlüssel (wie src/lib/permissions.ts), von denen eine reichen muss.
 * Nur Mitarbeiter mit eigener Seitenauswahl (`allowed_pages` gesetzt) oder deaktiviertem Zugang
 * werden abgewiesen; Inhaber, Staff-Admins und Mitarbeiter ohne Auswahl bleiben wie bisher.
 * Schlägt die Abfrage fehl, wird NICHT gesperrt (kein Aussperren durch einen Ausfall).
 */
export async function requireOperatorForPark(
  req: Request,
  parkId: string,
  pages?: string[],
): Promise<OperatorAuthResult> {
  const auth = await requireOperatorForParkBase(req, parkId);
  if (!auth.ok || !pages || pages.length === 0) return auth;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return auth;
  try {
    const response = await fetch(
      `${OPERATOR_SUPABASE_URL}/rest/v1/organization_memberships?select=role,allowed_pages,disabled_at&user_id=eq.${
        encodeURIComponent(auth.userId)
      }`,
      { headers: { apikey: OPERATOR_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return auth; // Staff-Admin (anderes Projekt) oder Ausfall
    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return auth;
    if (row.disabled_at) return { ok: false, status: 403, message: "Access disabled" };
    if (row.role === "staff" && Array.isArray(row.allowed_pages)) {
      const allowed = row.allowed_pages as string[];
      if (!pages.some((page) => allowed.includes(page))) {
        return { ok: false, status: 403, message: "No permission for this page" };
      }
    }
  } catch {
    // bewusst offen: ein Ausfall darf niemanden aussperren
  }
  return auth;
}

/** E-Mail-Adresse des angemeldeten Betreibers (für Test-Mails); null bei Staff-Token oder Ausfall. */
export async function fetchOperatorEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const response = await fetch(`${OPERATOR_SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: OPERATOR_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return typeof user?.email === "string" ? user.email : null;
  } catch {
    return null;
  }
}


// Gemeinsame Teile des Park-E-Mail-Versands (docs/PRODUKT_PLAN.md, F1).
// Versand über Make: ein Aufruf je Block von bis zu 100 Empfängern (Muster: Liftpictures-CRM).

export const BLOCK_SIZE = 100;

/** Mails pro Monat je Plan (Vorschlag, mit dem Make-Tarif abgleichen) – gespiegelt in src/lib/plans.ts. */
export const EMAIL_QUOTA: Record<string, number> = { basis: 0, marketing_starter: 2000, marketing_pro: 10000 };

export type Segment = { countries?: string[]; since?: string };
export type Audience = { claimId: string; email: string; name: string };

export function monthStart(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Plan und Monatskontingent. Ohne Zeile gilt die Übergangsregel (Starter), nie ein Aussperren. */
export async function quotaFor(parkId: string): Promise<{ plan: string; quota: number }> {
  const { data } = await supabaseService.from('park_entitlements')
    .select('plan, status, trial_until, email_extra_quota').eq('park_id', parkId).maybeSingle();
  let plan = 'marketing_starter';
  if (data) {
    const active = data.status === 'active' || (data.status === 'trial' && (!data.trial_until || Date.parse(data.trial_until) + 86_400_000 > Date.now()));
    plan = active ? String(data.plan) : 'basis';
  }
  return { plan, quota: (EMAIL_QUOTA[plan] ?? 0) + (EMAIL_QUOTA[plan] ? Number(data?.email_extra_quota ?? 0) : 0) };
}

export async function usageThisMonth(parkId: string): Promise<number> {
  const { data } = await supabaseService.from('park_email_usage').select('sent').eq('park_id', parkId).eq('month', monthStart()).maybeSingle();
  return Number(data?.sent ?? 0);
}

/**
 * Empfänger: nur Gäste mit Einwilligung (`marketing_opt_in`), je Adresse einmal (neuester Eintrag),
 * ohne Adressen auf der gemeinsamen Abmeldeliste `crm_marketing_opt_outs`.
 */
export async function resolveAudience(parkId: string, language: string | null, segment: Segment): Promise<Audience[]> {
  let query = supabaseService.from('photo_claims')
    .select('id, email, full_name, locale, country_code, created_at')
    .eq('park_id', parkId).eq('marketing_opt_in', true).eq('status', 'claimed').not('email', 'is', null)
    .order('created_at', { ascending: false }).limit(20000);
  if (language) query = query.eq('locale', language);
  if (segment.since) query = query.gte('created_at', segment.since);
  if (Array.isArray(segment.countries) && segment.countries.length > 0) {
    query = query.in('country_code', segment.countries.map((c) => c.toUpperCase()));
  }
  const { data } = await query;
  const seen = new Map<string, Audience>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email.includes('@') || seen.has(email)) continue;
    seen.set(email, { claimId: String(row.id), email, name: String(row.full_name ?? '') });
  }
  const emails = [...seen.keys()];
  for (let i = 0; i < emails.length; i += 500) {
    const { data: out } = await supabaseService.from('crm_marketing_opt_outs').select('email').in('email', emails.slice(i, i + 500));
    for (const row of (out ?? []) as Array<{ email: string }>) seen.delete(String(row.email).toLowerCase());
  }
  return [...seen.values()];
}

/** Fertige Mail je Empfänger: Platzhalter ersetzen, Öffnungspixel und Pflicht-Fuß anhängen. */
export async function renderMail(opts: {
  html: string;
  preheader: string;
  parkName: string;
  footerAddress: string;
  senderName: string;
  name: string;
  claimId: string;
  sendId: string;
  functionsBase: string;
  secret: string;
}): Promise<string> {
  const firstName = escapeHtml(opts.name.trim().split(/\s+/)[0] || '');
  const sig = await hmacHex(opts.secret, opts.claimId);
  const unsubscribeUrl = `${opts.functionsBase}/park-email-unsubscribe?c=${opts.claimId}&t=${sig}`;
  const pixelUrl = `${opts.functionsBase}/park-email-open?s=${opts.sendId}`;
  let html = opts.html
    .replaceAll('{{name}}', firstName)
    .replaceAll('{{park}}', escapeHtml(opts.parkName))
    .replaceAll('{{unsubscribe_url}}', unsubscribeUrl)
    .replaceAll('{{open_pixel}}', '');
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>`
    : '';
  const footer = `
<table role="presentation" width="100%" style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;">
  <tr><td style="text-align:center;">
    ${escapeHtml(opts.senderName)}<br/>${escapeHtml(opts.footerAddress).replace(/\n/g, '<br/>')}<br/>
    <a href="${unsubscribeUrl}" style="color:#888888;">Abmelden</a>
  </td></tr>
</table>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`;
  return pre + html + footer;
}

export async function postToMake(webhookUrl: string, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Make ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Make nicht erreichbar' };
  }
}


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
