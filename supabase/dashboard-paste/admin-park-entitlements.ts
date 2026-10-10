// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/admin-park-entitlements/index.ts (erzeugt mit scripts/build-paste.py)

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

/**
 * Nur Inhaber (org_owner/platform_admin) – z. B. für Abrechnung. Token von Mitarbeitern oder Staff-Admins
 * (ohne Mitgliedschaft im Betreiber-Projekt) werden abgewiesen.
 */
export async function requireOwnerForPark(req: Request, parkId: string): Promise<OperatorAuthResult> {
  const auth = await requireOperatorForParkBase(req, parkId);
  if (!auth.ok) return auth;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { ok: false, status: 401, message: "Missing bearer token" };
  try {
    const response = await fetch(
      `${OPERATOR_SUPABASE_URL}/rest/v1/organization_memberships?select=role&user_id=eq.${encodeURIComponent(auth.userId)}`,
      { headers: { apikey: OPERATOR_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    const rows = response.ok ? await response.json().catch(() => []) : [];
    const role = Array.isArray(rows) && rows[0] ? String(rows[0].role) : "";
    if (role === "org_owner" || role === "platform_admin") return auth;
  } catch {
    // fällt unten auf "verweigert"
  }
  return { ok: false, status: 403, message: "Nur der Betreiber darf das Abo verwalten." };
}


const PLANS = ['basis', 'marketing_starter', 'marketing_pro'];
const STATUS = ['active', 'trial', 'paused', 'cancelled'];
const FEATURES = [
  'crm_contacts', 'crm_survey', 'crm_social', 'crm_pixel', 'email_marketing',
  'email_automations', 'social_campaigns', 'review_routing', 'team_permissions', 'reports_pro', 'online_shop', 'speed',
];
const COLUMNS = 'park_id, plan, features, status, trial_until, source, stripe_subscription_id, updated_at';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Shared-Projekt, nur admin_users (wie admin-park-equipment).
 * GET ?park_id=… -> gespeicherte Einstellung oder null.
 * POST {park_id, plan, features, status, trial_until} -> vollständige manuelle Einstellung.
 * Stripe-Felder sind für den späteren Billing-Webhook reserviert.
 */
export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const auth = await requireAdminFromRequest(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const raw = req.method === 'POST' ? await req.json().catch(() => null) : null;
    if (req.method === 'POST' && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
      return json({ error: 'Invalid payload' }, 400);
    }
    const parkId = req.method === 'GET' ? new URL(req.url).searchParams.get('park_id') : raw.park_id;
    if (typeof parkId !== 'string' || !UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);

    if (req.method === 'GET') {
      const { data, error } = await supabaseService.from('park_entitlements')
        .select(COLUMNS).eq('park_id', parkId).maybeSingle();
      return error ? json({ error: 'Entitlements unavailable' }, 503) : json({ data });
    }

    if (!PLANS.includes(raw.plan) || !STATUS.includes(raw.status) ||
        !Array.isArray(raw.features) || raw.features.some((f: unknown) => typeof f !== 'string' || !FEATURES.includes(f)) ||
        (raw.trial_until != null && !validDate(raw.trial_until)) ||
        (raw.status === 'trial' && !validDate(raw.trial_until)) ||
        (raw.source !== undefined && raw.source !== 'manual') || raw.stripe_subscription_id !== undefined || (raw.force !== undefined && typeof raw.force !== 'boolean')) {
      return json({ error: 'Invalid entitlement settings' }, 400);
    }

    const { data: park, error: parkError } = await supabaseService.from('parks')
      .select('id').eq('id', parkId).maybeSingle();
    if (parkError) return json({ error: 'Park lookup failed' }, 503);
    if (!park) return json({ error: 'Park not found' }, 404);

    // Über Stripe verwaltete Abos nicht still überschreiben (außer ausdrücklich mit force).
    const { data: existing } = await supabaseService.from('park_entitlements').select('source').eq('park_id', parkId).maybeSingle();
    if (existing?.source === 'stripe' && raw.force !== true) {
      return json({ error: 'Dieser Park wird über Stripe verwaltet. Änderung nur mit force möglich.' }, 409);
    }

    const { data, error } = await supabaseService.from('park_entitlements').upsert({
      park_id: parkId,
      plan: raw.plan,
      features: [...new Set(raw.features)],
      status: raw.status,
      trial_until: raw.trial_until ?? null,
      source: 'manual',
      // Bestehende Stripe-ID bleibt erhalten, damit späterer Abgleich möglich ist.
      updated_at: new Date().toISOString(),
    }, { onConflict: 'park_id' }).select(COLUMNS).single();
    return error ? json({ error: 'Entitlements could not be saved' }, 503) : json({ ok: true, data });
  } catch {
    return json({ error: 'Entitlements unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
