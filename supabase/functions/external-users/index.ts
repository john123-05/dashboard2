import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireOperatorForPark } from "../_shared/operatorAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv() {
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "External Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

/**
 * external-users (rewritten)
 *
 * The old version read `users`/`purchases` - a Stripe webshop model that
 * kiosk parks (Imst, Tarzans, ...) never actually use: across the whole
 * database it has exactly one row, ever, from a different park. For these
 * parks the real "customer" event is claiming a printed photo, tracked in
 * photo_claims. Response shape is unchanged (customers[]/purchases[]) so the
 * already-shipped mobile app and web dashboard keep working without an
 * update.
 *
 * `purchases` is intentionally empty: a kiosk purchase (cash/card at the
 * machine, tracked in machine_sale_payments) isn't linked to a named
 * customer at all - the payment and the claim are separate, unlinked
 * events - so a per-customer purchase total would just be fabricated.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    // Names, emails and phone numbers: never without a login, never across parks.
    if (!parkId || !UUID.test(parkId)) return jsonResponse({ error: "park_id (UUID) erforderlich" }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return jsonResponse({ error: auth.message }, auth.status);
    const parkFilter = `&park_id=eq.${parkId}`;

    const claimsRes = await fetchExternal(
      `photo_claims?select=id,email,full_name,phone,marketing_opt_in,claimed_at,created_at,status${parkFilter}&status=eq.claimed&order=claimed_at.desc&limit=500`
    );

    if (!claimsRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photo claims", details: claimsRes.details }),
        { status: claimsRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claims = claimsRes.data as Array<Record<string, unknown>>;

    // One row per email (a guest can claim several photos over time) - kept
    // is the earliest claim, so "created_at" reads as their join date.
    const byEmail = new Map<string, Record<string, unknown>>();
    for (const c of claims) {
      const email = (c.email as string | null)?.toLowerCase().trim();
      const key = email || `claim-${c.id}`;
      const existing = byEmail.get(key);
      const currentDate = new Date((c.claimed_at as string) ?? (c.created_at as string));
      const existingDate = existing
        ? new Date((existing.claimed_at as string) ?? (existing.created_at as string))
        : null;
      if (!existing || (existingDate && currentDate < existingDate)) {
        byEmail.set(key, c);
      }
    }

    const customers = Array.from(byEmail.values()).map((c) => ({
      id: c.id,
      email: c.email ?? null,
      full_name: c.full_name ?? null,
      phone: c.phone ?? null,
      opted_in_marketing: c.marketing_opt_in === true,
      created_at: c.claimed_at ?? c.created_at,
    }));

    return new Response(
      JSON.stringify({ customers, purchases: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
