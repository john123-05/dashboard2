import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

// Returns the day's ride snapshots (running daily ride count + timestamp) for
// one park. The dashboard diffs consecutive snapshots to get rides-per-hour.
// The snapshots are written server-side by the liftpic-status heartbeat, so
// this needs no PC/agent change - but it only has data from the day logging
// was switched on onward.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "External Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    const date = url.searchParams.get("date");
    if (!parkId || !date) {
      return new Response(JSON.stringify({ error: "park_id and date are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path =
      `machine_ride_snapshots?select=captured_at,rides_today` +
      `&park_id=eq.${parkId}&business_date=eq.${date}&order=captured_at.asc`;
    const res = await fetch(`${APP_SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: APP_SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const details = await res.text();
      return new Response(JSON.stringify({ error: "Failed to fetch ride snapshots", details }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const snapshots = await res.json();
    return new Response(JSON.stringify({ snapshots }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
