// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/external-leads/index.ts (erzeugt mit scripts/build-paste.py)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";


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

{

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

function requireEnv() {
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "External Supabase credentials not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
  return null;
}

async function fetchExternal(path: string) {
  const res = await fetch(`${APP_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: APP_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const details = await res.text();
    return { ok: false, status: res.status, details };
  }

  const data = await res.json();
  return { ok: true, data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Eingeloggter Betreiber mit Freigabe für genau diesen Park? Sonst die Fehlerantwort. */
async function denyUnlessOperator(req: Request, parkId: string | null): Promise<Response | null> {
  if (!parkId || !UUID.test(parkId)) return jsonResponse({ error: "park_id (UUID) erforderlich" }, 400);
  const auth = await requireOperatorForPark(req, parkId, ['marketing', 'overview']);
  return auth.ok ? null : jsonResponse({ error: auth.message }, auth.status);
}

/**
 * DELETE { park_id, ids: [claim-id, …] } - löscht Foto-Freischaltungen (photo_claims)
 * dieses Parks. Der Freischalt-Link der betroffenen Gäste funktioniert danach nicht mehr.
 */
async function deleteClaims(req: Request) {
  const body = await req.json().catch(() => null) as { park_id?: unknown; ids?: unknown } | null;
  const parkId = typeof body?.park_id === "string" ? body.park_id : "";
  const ids = Array.isArray(body?.ids) ? body!.ids.map(String) : [];
  if (!UUID.test(parkId) || ids.length === 0 || ids.length > 500 || !ids.every((id) => UUID.test(id))) {
    return jsonResponse({ error: "park_id und ids (UUIDs, höchstens 500) erforderlich" }, 400);
  }
  const denied = await denyUnlessOperator(req, parkId);
  if (denied) return denied;

  const res = await fetch(
    `${APP_SUPABASE_URL}/rest/v1/photo_claims?park_id=eq.${parkId}&id=in.(${ids.join(",")})`,
    {
      method: "DELETE",
      headers: {
        apikey: APP_SUPABASE_SERVICE_KEY as string,
        Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}`,
        Prefer: "return=representation",
      },
    },
  );
  if (!res.ok) {
    return jsonResponse({ error: "Löschen fehlgeschlagen", details: await res.text() }, 502);
  }
  const deleted = await res.json().catch(() => []) as Array<{ id: string }>;
  return jsonResponse({ deletedIds: deleted.map((r) => r.id) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  if (req.method === "DELETE") return await deleteClaims(req);

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    // Liefert Namen, E-Mails und Telefonnummern - nie ohne Login und nie parkübergreifend.
    const denied = await denyUnlessOperator(req, parkId);
    if (denied) return denied;
    const parkFilter = `&park_id=eq.${parkId}`;

    const [usersRes, purchasesRes, parksRes, photoClaimsRes] = await Promise.all([
      fetchExternal(`users?select=id,email,vorname,nachname,created_at,park_id&order=created_at.desc${parkFilter}`),
      fetchExternal(`purchases?select=user_id,amount_cents,total_amount_cents,status,paid_at,park_id${parkFilter}`),
      fetchExternal(`parks?select=id,name`),
      // Imst (and any future shop-less park) doesn't create a `users` row at all —
      // claiming a photo there only ever writes to `photo_claims` (service-role
      // only table, by design). Without this, those leads never show up here.
      fetchExternal(`photo_claims?select=id,full_name,email,phone,social_entry_id,park_id,marketing_opt_in,claimed_at,created_at,locale,country_code&order=created_at.desc${parkFilter}`),
    ]);

    if (!usersRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch users", details: usersRes.details }),
        { status: usersRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!purchasesRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch purchases", details: purchasesRes.details }),
        { status: purchasesRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parksRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch parks", details: parksRes.details }),
        { status: parksRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Best-effort: if photo_claims is unreachable for some reason, still show the
    // users-based leads rather than failing the whole page.
    if (!photoClaimsRes.ok) {
      console.warn("Failed to fetch photo_claims leads:", photoClaimsRes.details);
    }

    const purchasesByUser = new Map<string, { count: number; total: number }>();
    (purchasesRes.data as Record<string, unknown>[]).forEach((p) => {
      const userId = p.user_id as string | undefined;
      if (!userId) return;
      const status = p.status as string | undefined;
      const paid = Boolean(p.paid_at);
      if (status && status !== "completed" && !paid) return;
      const amount =
        (p.total_amount_cents as number | null) ??
        (p.amount_cents as number | null) ??
        0;
      const entry = purchasesByUser.get(userId) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += amount;
      purchasesByUser.set(userId, entry);
    });

    const parkNames = new Map<string, string>();
    (parksRes.data as Record<string, unknown>[]).forEach((park) => {
      if (typeof park.id === "string" && typeof park.name === "string") {
        parkNames.set(park.id, park.name);
      }
    });

    const userLeads = (usersRes.data as Record<string, unknown>[]).map((u) => {
      const stats = purchasesByUser.get(u.id as string);
      const parkId = u.park_id as string | undefined;
      const parkName = parkId ? parkNames.get(parkId) || "Unknown" : "Unknown";
      return {
        id: u.id,
        email: u.email,
        full_name: [u.vorname, u.nachname].filter(Boolean).join(" "),
        source: stats && stats.count > 0 ? "purchase" : "unknown",
        opted_in: false,
        created_at: u.created_at,
        park_name: parkName,
        park: { name: parkName },
      };
    });

    const photoClaimLeads = photoClaimsRes.ok
      // Umfrage-Freischaltungen haben weder Adresse noch Telefon und gehören
      // nicht in die Kontaktliste; Freischaltungen nur mit Telefon schon.
      ? (photoClaimsRes.data as Record<string, unknown>[])
        .filter((c) => String(c.email ?? "").trim() !== "" || String(c.phone ?? "").trim() !== "")
        .map((c) => {
          const parkId = c.park_id as string | undefined;
          const parkName = parkId ? parkNames.get(parkId) || "Unknown" : "Unknown";
          return {
            id: c.id,
            email: c.email,
            phone: c.phone ?? null,
            full_name: c.full_name,
            source: c.social_entry_id ? "social_media" : "photo_claim",
            opted_in: Boolean(c.marketing_opt_in),
            created_at: (c.claimed_at ?? c.created_at) as string,
            locale: c.locale,
            country_code: c.country_code,
            park_name: parkName,
            park: { name: parkName },
          };
        })
      : [];

    const leads = [...userLeads, ...photoClaimLeads].sort(
      (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );

    return new Response(
      JSON.stringify({ leads }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

}
