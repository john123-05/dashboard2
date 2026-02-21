import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DASHBOARD_SUPABASE_URL =
  Deno.env.get("DASHBOARD_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const DASHBOARD_SUPABASE_SERVICE_KEY =
  Deno.env.get("DASHBOARD_SUPABASE_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DEFAULT_SIGNED_URL_TTL = 3600;

type PhotoInput = {
  id: string;
  taken_at: string;
};

type Campaign = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  priority: number;
};

type LayerRow = {
  id: string;
  campaign_id: string;
  asset_id: string;
  z_index: number;
  opacity: number;
  blend_mode: string;
  fit: string;
  anchor: string;
  scale: number;
  asset: {
    id: string;
    bucket: string;
    path: string;
  } | null;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureEnv() {
  if (!DASHBOARD_SUPABASE_URL || !DASHBOARD_SUPABASE_SERVICE_KEY) {
    return jsonResponse(
      {
        error:
          "Dashboard Supabase credentials not configured. Set DASHBOARD_SUPABASE_URL and DASHBOARD_SUPABASE_SERVICE_KEY.",
      },
      500,
    );
  }
  return null;
}

async function fetchDashboard(path: string) {
  const res = await fetch(`${DASHBOARD_SUPABASE_URL}${path}`, {
    headers: {
      apikey: DASHBOARD_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${DASHBOARD_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Dashboard API request failed (${res.status}): ${details}`);
  }

  return res.json();
}

function parseTtl() {
  const raw = Deno.env.get("OVERLAY_SIGNED_URL_TTL_SECONDS");
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_SIGNED_URL_TTL;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SIGNED_URL_TTL;
  return Math.min(parsed, 24 * 3600);
}

function isCampaignActiveAt(campaign: Campaign, atIso: string) {
  const atMs = new Date(atIso).getTime();
  const startsMs = new Date(campaign.starts_at).getTime();
  if (Number.isNaN(atMs) || Number.isNaN(startsMs)) return false;
  if (atMs < startsMs) return false;
  if (!campaign.ends_at) return true;
  const endsMs = new Date(campaign.ends_at).getTime();
  if (Number.isNaN(endsMs)) return false;
  return atMs <= endsMs;
}

async function createSignedUrl(bucket: string, path: string, ttlSeconds: number) {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const res = await fetch(
    `${DASHBOARD_SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: DASHBOARD_SUPABASE_SERVICE_KEY as string,
        Authorization: `Bearer ${DASHBOARD_SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    },
  );

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to sign ${bucket}/${path} (${res.status}): ${details}`);
  }

  const data = await res.json();
  const signedPath = (data.signedURL || data.signedUrl) as string | undefined;
  if (!signedPath) {
    throw new Error(`Missing signed URL for ${bucket}/${path}`);
  }

  if (signedPath.startsWith("http://") || signedPath.startsWith("https://")) {
    return signedPath;
  }
  return `${DASHBOARD_SUPABASE_URL}/storage/v1${signedPath}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const envError = ensureEnv();
  if (envError) return envError;

  let parkId = "";
  let photos: PhotoInput[] = [];

  try {
    const body = await req.json();
    parkId = String(body?.park_id || "").trim();
    photos = Array.isArray(body?.photos) ? body.photos : [];
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!parkId) {
    return jsonResponse({ error: "park_id is required." }, 400);
  }

  const normalizedPhotos = photos
    .map((p) => ({
      id: String(p?.id || "").trim(),
      taken_at: String(p?.taken_at || "").trim(),
    }))
    .filter((p) => p.id && p.taken_at && !Number.isNaN(new Date(p.taken_at).getTime()));

  if (normalizedPhotos.length === 0) {
    return jsonResponse({ matches: [], expires_in: parseTtl() });
  }

  const ttlSeconds = parseTtl();

  try {
    const photoTimesMs = normalizedPhotos.map((p) => new Date(p.taken_at).getTime());
    const minIso = new Date(Math.min(...photoTimesMs)).toISOString();
    const maxIso = new Date(Math.max(...photoTimesMs)).toISOString();

    const params = new URLSearchParams();
    params.set("select", "id,starts_at,ends_at,priority");
    params.set("park_id", `eq.${parkId}`);
    params.set("status", "eq.active");
    params.set("starts_at", `lte.${maxIso}`);
    params.set("or", `(ends_at.is.null,ends_at.gte.${minIso})`);
    params.append("order", "priority.desc");
    params.append("order", "starts_at.desc");

    const campaigns = (await fetchDashboard(
      `/rest/v1/overlay_campaigns?${params.toString()}`,
    )) as Campaign[];

    const selectedCampaignByPhoto = new Map<string, Campaign | null>();
    const selectedCampaignIds = new Set<string>();

    for (const photo of normalizedPhotos) {
      const campaign = campaigns.find((c) => isCampaignActiveAt(c, photo.taken_at)) ?? null;
      selectedCampaignByPhoto.set(photo.id, campaign);
      if (campaign) selectedCampaignIds.add(campaign.id);
    }

    const layerByCampaign = new Map<string, LayerRow[]>();
    if (selectedCampaignIds.size > 0) {
      const layerParams = new URLSearchParams();
      layerParams.set(
        "select",
        "id,campaign_id,asset_id,z_index,opacity,blend_mode,fit,anchor,scale,asset:overlay_assets(id,bucket,path)",
      );
      layerParams.set("campaign_id", `in.(${Array.from(selectedCampaignIds).join(",")})`);
      layerParams.append("order", "z_index.asc");

      const layers = (await fetchDashboard(
        `/rest/v1/overlay_campaign_layers?${layerParams.toString()}`,
      )) as LayerRow[];

      for (const layer of layers) {
        const list = layerByCampaign.get(layer.campaign_id) ?? [];
        list.push(layer);
        layerByCampaign.set(layer.campaign_id, list);
      }
    }

    const signedUrlCache = new Map<string, string>();
    const matches = [];

    for (const photo of normalizedPhotos) {
      const selectedCampaign = selectedCampaignByPhoto.get(photo.id) ?? null;
      const campaignLayers = selectedCampaign ? layerByCampaign.get(selectedCampaign.id) ?? [] : [];
      const resolvedLayers = [];

      for (const layer of campaignLayers) {
        const asset = layer.asset;
        if (!asset?.bucket || !asset?.path) continue;

        const cacheKey = `${asset.bucket}/${asset.path}`;
        let signedUrl = signedUrlCache.get(cacheKey);

        if (!signedUrl) {
          try {
            signedUrl = await createSignedUrl(asset.bucket, asset.path, ttlSeconds);
            signedUrlCache.set(cacheKey, signedUrl);
          } catch (error) {
            console.error("Failed to create signed URL", {
              asset_id: asset.id,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
        }

        resolvedLayers.push({
          asset_id: layer.asset_id,
          signed_url: signedUrl,
          z_index: layer.z_index,
          opacity: Number(layer.opacity ?? 1),
          blend_mode: layer.blend_mode ?? "normal",
          fit: layer.fit ?? "contain",
          anchor: layer.anchor ?? "center",
          scale: Number(layer.scale ?? 1),
        });
      }

      matches.push({
        photo_id: photo.id,
        campaign_id: selectedCampaign?.id ?? null,
        overlays: resolvedLayers,
      });
    }

    return jsonResponse({
      matches,
      expires_in: ttlSeconds,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
