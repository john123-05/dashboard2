import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

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

// For self-service/kiosk parks (no real shop, e.g. Imst's Alpine Coaster):
// every photos row already IS a completed sale. The permanent daily rollup
// (park_photo_sales_daily) survives the 30-day photos retention window —
// see the migration that created it for why photos itself can't be queried
// directly for anything older than that.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    if (!parkId) {
      return new Response(JSON.stringify({ error: "park_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parkRes = await fetchExternal(
      `parks?select=id,name,price_per_photo_cents,timezone&id=eq.${parkId}`
    );
    if (!parkRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch park", details: parkRes.details }),
        { status: parkRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const park = (parkRes.data as Record<string, unknown>[])[0];
    const priceCents = (park?.price_per_photo_cents as number | null) ?? null;

    if (!park || priceCents === null) {
      return new Response(
        JSON.stringify({ isKioskPark: false, priceCents: null, timezone: null, days: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const daysRes = await fetchExternal(
      `park_photo_sales_daily?select=camera_code,business_date,photos_sold_count,min_file_code,max_file_code&park_id=eq.${parkId}&order=business_date.desc`
    );
    if (!daysRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch sales rollup", details: daysRes.details }),
        { status: daysRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        isKioskPark: true,
        priceCents,
        timezone: (park.timezone as string) ?? "Europe/Vienna",
        days: daysRes.data,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
