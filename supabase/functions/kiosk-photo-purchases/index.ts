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

// Individual, recent purchases for kiosk parks — unlike kiosk-photo-sales
// (the permanent daily rollup, used for long-term revenue trends), this
// reads the raw photos table directly, so it only ever covers the last
// ~30 days (photos are hard-deleted after that — see
// archive-expired-photos). That's the right tradeoff here: "Käufe" is a
// recent activity log, not a historical archive.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 300);
    if (!parkId) {
      return new Response(JSON.stringify({ error: "park_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parkRes = await fetchExternal(
      `parks?select=id,price_per_photo_cents&id=eq.${parkId}`
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
        JSON.stringify({ isKioskPark: false, priceCents: null, purchases: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const photosRes = await fetchExternal(
      `photos?select=id,captured_at,created_at,camera_code&park_id=eq.${parkId}&order=captured_at.desc&limit=${limit}`
    );
    if (!photosRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photos", details: photosRes.details }),
        { status: photosRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const photos = photosRes.data as Record<string, unknown>[];
    const photoIds = photos.map((p) => p.id as string);

    const claimByPhotoId = new Map<string, { email: string; fullName: string }>();
    if (photoIds.length > 0) {
      const claimsRes = await fetchExternal(
        `photo_claims?select=photo_id,email,full_name,status&status=eq.claimed&photo_id=in.(${photoIds.join(",")})`
      );
      if (claimsRes.ok) {
        for (const claim of claimsRes.data as Record<string, unknown>[]) {
          claimByPhotoId.set(claim.photo_id as string, {
            email: claim.email as string,
            fullName: claim.full_name as string,
          });
        }
      }
      // A failed claims lookup shouldn't hide the purchases themselves —
      // just fall back to no email info for any of them.
    }

    const purchases = photos.map((p) => {
      const claim = claimByPhotoId.get(p.id as string);
      return {
        id: p.id,
        capturedAt: (p.captured_at ?? p.created_at) as string,
        cameraCode: (p.camera_code as string) ?? "unknown",
        email: claim?.email ?? null,
        fullName: claim?.fullName ?? null,
      };
    });

    return new Response(
      JSON.stringify({ isKioskPark: true, priceCents, purchases }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
