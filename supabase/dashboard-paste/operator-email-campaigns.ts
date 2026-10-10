// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-email-campaigns/index.ts (erzeugt mit scripts/build-paste.py)

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
    .eq('park_id', parkId).order('created_at', { ascending: false }).limit(200);
  if (isMissingTable(error)) return { migration_pending: true, campaigns: [], settings: null, usage: { sent: 0, quota: 0, plan: 'marketing_starter' } };
  if (error) throw new Error(error.message);
  const { plan, quota } = await quotaFor(parkId);
  return { campaigns: data ?? [], settings: await loadSettings(parkId), usage: { sent: await usageThisMonth(parkId), quota, plan } };
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
  const { data, error } = await supabaseService.from('park_email_campaigns').insert(row).select('id').single();
  return error ? { error: error.message } : { ok: true, id: data.id as string };
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

      if (campaign.status !== 'draft') return json({ error: 'Diese Mail wurde schon versendet oder ist geplant.' }, 409);
      const audience = await resolveAudience(auth.parkId, campaign.language, (campaign.segment ?? {}) as Segment);
      if (audience.length === 0) return json({ error: 'Keine passenden Empfänger mit Einwilligung gefunden.' }, 400);
      const { quota, plan } = await quotaFor(auth.parkId);
      const used = await usageThisMonth(auth.parkId);
      if (quota === 0) return json({ error: 'E-Mail-Marketing gehört zu Marketing Starter oder Pro.', plan }, 403);
      if (used + audience.length > quota) {
        return json({ error: `Das Monatskontingent reicht nicht (${used} von ${quota} schon genutzt, ${audience.length} Empfänger).`, quota, used }, 403);
      }
      const scheduled = text(body.scheduled_at, 40);
      const sendAfter = scheduled && !Number.isNaN(Date.parse(scheduled)) && Date.parse(scheduled) > Date.now()
        ? new Date(scheduled).toISOString() : new Date().toISOString();
      const { data: claimed } = await supabaseService.from('park_email_campaigns')
        .update({ status: sendAfter > new Date().toISOString() ? 'scheduled' : 'sending', scheduled_at: sendAfter, recipients: audience.length, updated_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'draft').select('id').maybeSingle();
      if (!claimed) return json({ error: 'Diese Mail ist kein Entwurf mehr.' }, 409);
      for (let i = 0; i < audience.length; i += 500) {
        const rows = audience.slice(i, i + 500).map((a) => ({ campaign_id: id, park_id: auth.parkId, claim_id: a.claimId, email: a.email, send_after: sendAfter }));
        const { error } = await supabaseService.from('park_email_sends').insert(rows);
        if (error) {
          await supabaseService.from('park_email_sends').delete().eq('campaign_id', id);
          await supabaseService.from('park_email_campaigns').update({ status: 'draft' }).eq('id', id);
          return json({ error: error.message }, 500);
        }
      }
      return json({ ok: true, data: { recipients: audience.length, send_after: sendAfter, block_size: BLOCK_SIZE, month: monthStart() } });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'E-Mail-Marketing nicht verfügbar' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);

