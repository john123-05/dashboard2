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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  try {
    const [photosRes, recentRes] = await Promise.all([
      fetchExternal(
        "photos?select=id,is_paid,created_at,captured_at,storage_bucket,storage_path,owner_user_id"
      ),
      fetchExternal(
        "photos?select=id,is_paid,created_at,captured_at,storage_bucket,storage_path,owner_user_id&order=captured_at.desc&limit=12"
      ),
    ]);

    if (!photosRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photos", details: photosRes.details }),
        { status: photosRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!recentRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch recent photos", details: recentRes.details }),
        { status: recentRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const toStatus = (p: Record<string, unknown>) =>
      p.is_paid ? "purchased" : "available";

    const toImageUrl = (p: Record<string, unknown>) => {
      const bucket = p.storage_bucket as string | undefined;
      const path = p.storage_path as string | undefined;
      if (!bucket || !path) return null;
      return `${APP_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    };

    const photos = (photosRes.data as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      status: toStatus(p),
      attraction_id: p.owner_user_id ?? null,
    }));

    const recent = (recentRes.data as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      image_url: toImageUrl(p),
      thumbnail_url: toImageUrl(p),
      status: toStatus(p),
      taken_at: (p.captured_at ?? p.created_at) as string,
      attraction: { name: "Photo" },
    }));

    return new Response(
      JSON.stringify({
        photos,
        attractions: [],
        recent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
