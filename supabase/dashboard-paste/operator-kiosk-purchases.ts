// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-kiosk-purchases/index.ts (erzeugt mit scripts/build-paste.py)

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
 * operator-kiosk-purchases
 *
 * Einzelkäufe am Automaten für die Käufe-Seite - aus machine_sale_payments,
 * NICHT aus der photos-Tabelle. Der Unterschied: machine_sale_payments ist
 * dauerhaft (zurück bis 2025), photos-Zeilen werden nach ~30 Tagen gelöscht.
 * So kann die Käufe-Seite Monate zurückblättern, mit Zahlungsart + Kartenmarke
 * direkt in der Zeile.
 *
 * photos + photo_claims werden nur noch dazugejoint, um "wer hat's abgeholt /
 * E-Mail" zu zeigen - das gibt es naturgemäß nur für die jüngeren Käufe.
 * Zuordnung über die hinteren 4 Stellen der Bildnummer, weil
 * photos.source_file_code gekürzt gespeichert wird ("56820" -> "6820").
 */

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function chunkedIn<T>(
  values: string[],
  size: number,
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(...(await run(values.slice(i, i + size))));
  }
  return out;
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

  const now = new Date();
  const toParam = text(url.searchParams.get('to'));
  const fromParam = text(url.searchParams.get('from'));
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(now.getTime() - 30 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return json({ error: 'from/to ungültig' }, 400);
  }
  const LIMIT = Math.min(Number(url.searchParams.get('limit')) || 5000, 10_000);

  const { data: park } = await supabaseService
    .from('parks')
    .select('price_per_photo_cents')
    .eq('id', auth.parkId)
    .maybeSingle();
  const priceCents = (park?.price_per_photo_cents as number | null) ?? null;

  // machine_id -> Anzeigename ("Automat alt" / "Automat neu"), damit die
  // Käufe-Seite pro Automat filtern und beschriften kann.
  const labelByMachine = new Map<string, string>();
  // Karte-only-Automaten (settings.card_only): dort liefert die Kiosk-Software
  // keinen Betrag je Kauf, es gilt der Fotopreis (siehe park_machine_revenue).
  const cardOnly = new Set<string>();
  const { data: configs } = await supabaseService
    .from('liftpic_machine_configs')
    .select('machine_id, machine_label, settings')
    .eq('park_id', auth.parkId);
  for (const c of configs ?? []) {
    const mid = text((c as Record<string, unknown>).machine_id);
    if (mid) labelByMachine.set(mid, text((c as Record<string, unknown>).machine_label) || mid);
    const settings = ((c as Record<string, unknown>).settings ?? {}) as Record<string, unknown>;
    if (mid && settings.card_only === true) cardOnly.add(mid);
  }

  const { data: rows, error } = await supabaseService
    .from('machine_sale_payments')
    .select('machine_id, sold_at, sold_local, bild_nr, print_count, method, method_source, amount_cents, card_scheme, receipt_no, auth_code')
    .eq('park_id', auth.parkId)
    .gte('sold_at', from.toISOString())
    .lte('sold_at', to.toISOString())
    .order('sold_at', { ascending: false })
    .limit(LIMIT + 1);
  if (error) return json({ error: error.message }, 400);

  const truncated = (rows?.length ?? 0) > LIMIT;
  const sales = (rows ?? []).slice(0, LIMIT) as Array<Record<string, unknown>>;

  // Bildnummern + ihre 4-stellige Kurzform sammeln.
  const codes = new Set<string>();
  for (const s of sales) {
    const b = text(s.bild_nr);
    if (/^\d+$/.test(b)) {
      codes.add(b);
      codes.add(String(Number(b) % 10000));
    }
  }

  type Info = { email: string | null; name: string | null; capturedAt: string | null };
  const infoByCode = new Map<string, Info>();

  if (codes.size > 0) {
    const photos = await chunkedIn(
      [...codes],
      250,
      async (chunk) => {
        const { data } = await supabaseService
          .from('photos')
          .select('id, source_file_code, captured_at, created_at')
          .eq('park_id', auth.parkId)
          .eq('is_test', false)
          .in('source_file_code', chunk);
        return (data ?? []) as Array<Record<string, unknown>>;
      },
    );

    const photoIds = photos.map((p) => text(p.id)).filter(Boolean);
    const claimByPhoto = new Map<string, { email: string | null; full_name: string | null }>();
    if (photoIds.length > 0) {
      const claims = await chunkedIn(photoIds, 250, async (chunk) => {
        const { data } = await supabaseService
          .from('photo_claims')
          .select('photo_id, email, full_name, status')
          .eq('status', 'claimed')
          .in('photo_id', chunk);
        return (data ?? []) as Array<Record<string, unknown>>;
      });
      for (const c of claims) {
        claimByPhoto.set(text(c.photo_id), {
          email: text(c.email) || null,
          full_name: text(c.full_name) || null,
        });
      }
    }

    for (const p of photos) {
      const code = text(p.source_file_code);
      if (!code) continue;
      const claim = claimByPhoto.get(text(p.id));
      infoByCode.set(code, {
        email: claim?.email ?? null,
        name: claim?.full_name ?? null,
        capturedAt: text(p.captured_at) || text(p.created_at) || null,
      });
    }
  }

  const purchases = sales.map((s) => {
    const b = text(s.bild_nr);
    const info =
      infoByCode.get(b) ??
      (/^\d+$/.test(b) ? infoByCode.get(String(Number(b) % 10000)) : undefined) ??
      null;
    const mid = text(s.machine_id);
    return {
      machine_id: mid || null,
      machine_label: labelByMachine.get(mid) ?? mid ?? null,
      sold_at: s.sold_at,
      sold_local: s.sold_local,
      bild_nr: s.bild_nr,
      print_count: s.print_count,
      method: s.method,
      method_source: s.method_source,
      card_scheme: s.card_scheme ?? null,
      receipt_no: s.receipt_no ?? null,
      auth_code: s.auth_code ?? null,
      amount_cents: typeof s.amount_cents === 'number' ? s.amount_cents : priceCents,
      // true: kein Betrag vom Terminal, es wird der Fotopreis gezählt.
      amount_estimated: typeof s.amount_cents !== 'number',
      card_only: cardOnly.has(mid),
      claimed_email: info?.email ?? null,
      claimed_name: info?.name ?? null,
      photo_captured_at: info?.capturedAt ?? null,
    };
  });

  // Alle Automaten des Parks, für das Filter-Dropdown (auch die ohne Käufe im
  // Zeitraum). Reihenfolge: nach machine_id, damit "alt" vor "neu" steht.
  const machines = [...labelByMachine.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([machine_id, machine_label]) => ({
      machine_id,
      machine_label,
      card_only: cardOnly.has(machine_id),
    }));

  return json({
    ok: true,
    data: {
      purchases,
      machines,
      priceCents,
      truncated,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  });
});
