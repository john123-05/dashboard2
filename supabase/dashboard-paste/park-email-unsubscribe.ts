// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/park-email-unsubscribe/index.ts (erzeugt mit scripts/build-paste.py)

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
 * park-email-unsubscribe (öffentlich, verify_jwt = false) – Ziel des „Abmelden“-Links im Fuß jeder Mail:
 * `…?c=<claim_id>&t=<HMAC-SHA256(claim_id)>`. Ein Klick genügt (UWG). Setzt die Einwilligung für alle
 * Einträge dieser Adresse im Park zurück und trägt die Adresse in die gemeinsame Abmeldeliste ein.
 * Die Supabase-Plattform liefert auf der Standard-Domain nur Klartext, deshalb eine Klartext-Bestätigung.
 */

function page(ok: boolean): Response {
  const body = ok
    ? 'Du hast dich erfolgreich abgemeldet.\n\nDu erhältst ab sofort keine E-Mails mehr von diesem Park.'
    : 'Dieser Abmelde-Link ist nicht gültig oder bereits benutzt worden.\n\nWenn du weiter E-Mails bekommst, antworte bitte auf die Mail.';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const claimId = url.searchParams.get('c') ?? '';
  const sig = url.searchParams.get('t') ?? '';
  const secret = Deno.env.get('EMAIL_LINK_SECRET') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(claimId) || !sig || !secret) return page(false);
  try {
    if ((await hmacHex(secret, claimId)) !== sig) return page(false);
    const { data: claim } = await supabaseService.from('photo_claims').select('park_id, email').eq('id', claimId).maybeSingle();
    if (!claim?.email) return page(false);
    const email = String(claim.email).trim().toLowerCase();
    await supabaseService.from('photo_claims').update({ marketing_opt_in: false }).eq('park_id', claim.park_id).ilike('email', email);
    await supabaseService.from('crm_marketing_opt_outs').upsert({ email, opted_out_at: new Date().toISOString() }, { onConflict: 'email' });
    return page(true);
  } catch {
    return page(false);
  }
});
