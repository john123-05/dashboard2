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

function isMissingOpeningHoursConfig(details: string | undefined) {
  const lower = (details || "").toLowerCase();
  return lower.includes("opening_hours_config") && lower.includes("does not exist");
}

function numericValue(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
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

    let parkRes = await fetchExternal(
      `parks?select=id,name,price_per_photo_cents,timezone,opening_hours,opening_hours_config&id=eq.${parkId}`
    );
    if (!parkRes.ok && isMissingOpeningHoursConfig(parkRes.details)) {
      parkRes = await fetchExternal(
        `parks?select=id,name,price_per_photo_cents,timezone,opening_hours&id=eq.${parkId}`
      );
    }
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
        JSON.stringify({ isKioskPark: false, priceCents: null, timezone: null, openingHours: null, openingHoursConfig: null, days: [] }),
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

    // Aggregate BOTH rollups to per-business-date totals. Critically, the two
    // rollups label the same physical camera differently: park_photo_sales_daily
    // keys on the legacy customer code (e.g. "2734") while park_photo_ride_daily
    // keys on the machine camera code (e.g. "cam1"). Merging by camera_code (as
    // this once did) never matched them, so each day's sold count was emitted
    // twice and summed downstream (68 -> 136), and the sales row's file-code
    // span leaked into the ride/"taken" total. Merge by DATE only:
    //   - sold  = the permanent sales rollup (authoritative revenue); the ride
    //             rollup's own sold is only a fallback for dates sales has no row.
    //   - taken = the ride rollup only (rides, for the conversion rate); null
    //             when unknown so conversion is hidden, not nonsensical.
    const salesByDate = new Map<string, number>();
    for (const row of daysRes.data as Record<string, unknown>[]) {
      const date = String(row.business_date ?? "");
      salesByDate.set(date, (salesByDate.get(date) ?? 0) + numericValue(row.photos_sold_count));
    }

    const ridesByDate = new Map<string, { taken: number; sold: number }>();
    if (rideRes.ok) {
      for (const row of rideRes.data as Record<string, unknown>[]) {
        const date = String(row.business_date ?? "");
        const current = ridesByDate.get(date) ?? { taken: 0, sold: 0 };
        current.taken += numericValue(row.photos_taken_count);
        current.sold += numericValue(row.photos_sold_count);
        ridesByDate.set(date, current);
      }
    }

    const allDates = new Set<string>([...salesByDate.keys(), ...ridesByDate.keys()]);
    const mergedDays = Array.from(allDates)
      .map((date) => {
        const rides = ridesByDate.get(date);
        const sold = salesByDate.has(date) ? (salesByDate.get(date) as number) : (rides?.sold ?? 0);
        return {
          camera_code: "all",
          business_date: date,
          photos_sold_count: sold,
          photos_taken_count: rides && rides.taken > 0 ? rides.taken : null,
          min_file_code: null,
          max_file_code: null,
        };
      })
      .sort((left, right) => right.business_date.localeCompare(left.business_date));

    return new Response(
      JSON.stringify({
        isKioskPark: true,
        priceCents,
        timezone: (park.timezone as string) ?? "Europe/Vienna",
        openingHours: park.opening_hours ?? null,
        openingHoursConfig: park.opening_hours_config ?? null,
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
