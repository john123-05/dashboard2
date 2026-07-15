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

function numericValue(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function rowKey(row: Record<string, unknown>): string {
  return `${String(row.camera_code ?? "unknown")}|${String(row.business_date ?? "")}`;
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
      `parks?select=id,name,price_per_photo_cents,timezone,opening_hours&id=eq.${parkId}`
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
        JSON.stringify({ isKioskPark: false, priceCents: null, timezone: null, openingHours: null, days: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [daysRes, rideRes] = await Promise.all([
      fetchExternal(
        `park_photo_sales_daily?select=camera_code,business_date,photos_sold_count,min_file_code,max_file_code&park_id=eq.${parkId}&order=business_date.desc`
      ),
      fetchExternal(
        `park_photo_ride_daily?select=machine_id,camera_code,business_date,photos_taken_count,photos_sold_count&park_id=eq.${parkId}&order=business_date.desc`
      ),
    ]);
    if (!daysRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch sales rollup", details: daysRes.details }),
        { status: daysRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ridesByKey = new Map<string, { photos_taken_count: number; photos_sold_count: number }>();
    if (rideRes.ok) {
      for (const row of rideRes.data as Record<string, unknown>[]) {
        const key = rowKey(row);
        const current = ridesByKey.get(key) ?? { photos_taken_count: 0, photos_sold_count: 0 };
        current.photos_taken_count += numericValue(row.photos_taken_count);
        current.photos_sold_count += numericValue(row.photos_sold_count);
        ridesByKey.set(key, current);
      }
    }

    const mergedDays = (daysRes.data as Record<string, unknown>[]).map((row) => {
      const rides = ridesByKey.get(rowKey(row));
      if (rides) ridesByKey.delete(rowKey(row));
      return {
        ...row,
        photos_taken_count: rides?.photos_taken_count ?? null,
      };
    });

    for (const [key, rides] of ridesByKey.entries()) {
      const [cameraCode, businessDate] = key.split("|");
      mergedDays.push({
        camera_code: cameraCode,
        business_date: businessDate,
        photos_sold_count: rides.photos_sold_count,
        photos_taken_count: rides.photos_taken_count,
        min_file_code: null,
        max_file_code: null,
      });
    }

    mergedDays.sort((left, right) =>
      String(right.business_date ?? "").localeCompare(String(left.business_date ?? ""))
    );

    return new Response(
      JSON.stringify({
        isKioskPark: true,
        priceCents,
        timezone: (park.timezone as string) ?? "Europe/Vienna",
        openingHours: park.opening_hours ?? null,
        days: mergedDays,
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
