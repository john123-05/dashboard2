// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-machine-revenue/index.ts (erzeugt mit scripts/build-paste.py)

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


/**
 * operator-machine-revenue
 *
 * Umsatz je Automat für die Umsatz-Seite - aus machine_sale_payments über die
 * SQL-Funktion park_machine_revenue(). Pro Automat: Käufe + Betrag für heute /
 * 7 Tage / Monat / gesamt, plus Karte/Bar-Aufteilung. Automaten ohne Käufe
 * kommen mit Nullen, damit "Automat neu" auch vor dem ersten Verkauf in der
 * Liste steht.
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const url = new URL(req.url);
  const parkId = text(url.searchParams.get('park_id'));
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId, ['revenue', 'purchases', 'overview', 'marketing', 'speed']);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const [{ data: rev, error: revError }, { data: splitRows }, { data: configs }] = await Promise.all([
    supabaseService.rpc('park_machine_revenue', { p_park_id: auth.parkId }),
    // Karte/Bar und Kartenmarken je Zeitraum (gleiche Zeitgrenzen wie oben).
    supabaseService.rpc('park_machine_payment_split', { p_park_id: auth.parkId }),
    supabaseService
      .from('liftpic_machine_configs')
      .select('machine_id, machine_label, is_active, settings')
      .eq('park_id', auth.parkId),
  ]);
  if (revError) return json({ error: revError.message }, 400);

  const revByMachine = new Map<string, Record<string, unknown>>();
  for (const r of (rev ?? []) as Array<Record<string, unknown>>) {
    revByMachine.set(text(r.machine_id), r);
  }

  type Split = { karte: number; bar: number; unbekannt: number; marken: Record<string, number> };
  const splitByMachine = new Map<string, Record<string, Split>>();
  for (const r of (splitRows ?? []) as Array<Record<string, unknown>>) {
    const mid = text(r.machine_id);
    const periode = text(r.periode);
    const perioden = splitByMachine.get(mid) ?? {};
    const s = perioden[periode] ?? { karte: 0, bar: 0, unbekannt: 0, marken: {} };
    const n = num(r.anzahl);
    const method = text(r.method);
    if (method === 'karte') {
      s.karte += n;
      const marke = text(r.card_scheme) || 'ohne Angabe';
      s.marken[marke] = (s.marken[marke] ?? 0) + n;
    } else if (method === 'bar') s.bar += n;
    else s.unbekannt += n;
    perioden[periode] = s;
    splitByMachine.set(mid, perioden);
  }
  const leer: Split = { karte: 0, bar: 0, unbekannt: 0, marken: {} };

  // Reihenfolge nach machine_id -> "pcneu" (alt) vor "pcneu2" (neu).
  const machines = ((configs ?? []) as Array<Record<string, unknown>>)
    .map((c) => ({
      machine_id: text(c.machine_id),
      machine_label: text(c.machine_label) || text(c.machine_id),
      is_active: c.is_active === true,
      // Karte-only-Automat (kein Münzeinwurf): die Seite zeigt "Nur Karte"
      // statt eines Bar/Karte-Anteils.
      card_only: ((c.settings ?? {}) as Record<string, unknown>).card_only === true,
    }))
    // Nur aktive Automaten zaehlen mit - ein abgeschalteter/deaktivierter
    // Test-PC (z.B. css-alpine-pc1) soll nicht dauerhaft als zweiter Automat
    // auftauchen, nur weil er frueher mal Verkaeufe hatte.
    .filter((m) => m.machine_id && m.is_active)
    .sort((a, b) => a.machine_id.localeCompare(b.machine_id))
    .map((m) => {
      const r = revByMachine.get(m.machine_id) ?? {};
      return {
        machine_id: m.machine_id,
        machine_label: m.machine_label,
        is_active: m.is_active,
        card_only: m.card_only,
        heute: { anzahl: num(r.heute_anzahl), cent: num(r.heute_cent) },
        woche: { anzahl: num(r.woche_anzahl), cent: num(r.woche_cent) },
        monat: { anzahl: num(r.monat_anzahl), cent: num(r.monat_cent) },
        gesamt: { anzahl: num(r.gesamt_anzahl), cent: num(r.gesamt_cent) },
        karte_anzahl: num(r.karte_anzahl),
        bar_anzahl: num(r.bar_anzahl),
        unbekannt_anzahl: num(r.unbekannt_anzahl),
        // je Zeitraum: Karte/Bar/unbekannt und Kartenmarken
        split: {
          heute: splitByMachine.get(m.machine_id)?.heute ?? leer,
          woche: splitByMachine.get(m.machine_id)?.woche ?? leer,
          monat: splitByMachine.get(m.machine_id)?.monat ?? leer,
          gesamt: splitByMachine.get(m.machine_id)?.gesamt ?? leer,
        },
      };
    });

  return json({ ok: true, data: { machines } });
});
