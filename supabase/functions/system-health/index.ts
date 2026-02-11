import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

function errorResponse(message: string, status = 500, details?: string) {
  return new Response(
    JSON.stringify({ error: message, details }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
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

function toIsoDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return errorResponse("External Supabase credentials not configured");
  }

  const services: {
    name: string;
    status: "operational" | "degraded" | "down";
    latency?: number;
    detail?: string;
  }[] = [];

  const events: {
    id: string;
    event_type: string;
    severity: "info" | "warning" | "error" | "critical";
    message: string;
    created_at: string;
  }[] = [];

  const metrics: Record<string, unknown> = {};

  try {
    const externalStart = Date.now();
    const [usersRes, photosRes, purchasesRes] = await Promise.all([
      fetchExternal("users?select=id,created_at"),
      fetchExternal(
        "photos?select=id,created_at,captured_at,is_paid,storage_bucket,storage_path&order=created_at.desc&limit=200"
      ),
      fetchExternal(
        "purchases?select=id,user_id,status,paid_at,created_at,amount_cents,total_amount_cents&order=created_at.desc&limit=200"
      ),
    ]);
    const externalLatency = Date.now() - externalStart;

    if (!usersRes.ok || !photosRes.ok || !purchasesRes.ok) {
      const detail = !usersRes.ok
        ? usersRes.details
        : !photosRes.ok
          ? photosRes.details
          : purchasesRes.details;
      services.push({
        name: "External Database",
        status: "down",
        latency: externalLatency,
        detail: "Failed to read external tables",
      });
      events.push({
        id: crypto.randomUUID(),
        event_type: "external_db",
        severity: "critical",
        message: `External database read failed: ${detail}`,
        created_at: new Date().toISOString(),
      });
    } else {
      const users = usersRes.data as Record<string, unknown>[];
      const photos = photosRes.data as Record<string, unknown>[];
      const purchases = purchasesRes.data as Record<string, unknown>[];

      metrics.external_users_count = users.length;
      metrics.external_photos_count = photos.length;
      metrics.external_purchases_count = purchases.length;

      services.push({
        name: "External Database",
        status: "operational",
        latency: externalLatency,
      });

      const latestPhoto = photos[0];
      const lastPhotoAt = toIsoDate(
        (latestPhoto?.captured_at as string | undefined) ||
          (latestPhoto?.created_at as string | undefined)
      );
      metrics.last_photo_at = lastPhotoAt;

      if (lastPhotoAt) {
        const ageMs = Date.now() - new Date(lastPhotoAt).getTime();
        const ageHours = ageMs / 36e5;
        if (ageHours > 12) {
          services.push({
            name: "Photo Upload Service",
            status: "down",
            detail: "No new photos in 12h",
          });
          events.push({
            id: crypto.randomUUID(),
            event_type: "photo_upload",
            severity: "critical",
            message: "No new photos detected in the last 12 hours.",
            created_at: new Date().toISOString(),
          });
        } else if (ageHours > 3) {
          services.push({
            name: "Photo Upload Service",
            status: "degraded",
            detail: "No new photos in 3h",
          });
          events.push({
            id: crypto.randomUUID(),
            event_type: "photo_upload",
            severity: "warning",
            message: "No new photos detected in the last 3 hours.",
            created_at: new Date().toISOString(),
          });
        } else {
          services.push({
            name: "Photo Upload Service",
            status: "operational",
          });
        }
      } else {
        services.push({
          name: "Photo Upload Service",
          status: "degraded",
          detail: "No photos found",
        });
      }

      const latestPurchase = purchases[0];
      const lastPurchaseAt = toIsoDate(
        (latestPurchase?.paid_at as string | undefined) ||
          (latestPurchase?.created_at as string | undefined)
      );
      metrics.last_purchase_at = lastPurchaseAt;

      if (lastPurchaseAt) {
        const ageMs = Date.now() - new Date(lastPurchaseAt).getTime();
        const ageHours = ageMs / 36e5;
        if (ageHours > 48) {
          services.push({
            name: "Payment Processing",
            status: "degraded",
            detail: "No recent purchases in 48h",
          });
          events.push({
            id: crypto.randomUUID(),
            event_type: "payments",
            severity: "warning",
            message: "No purchases detected in the last 48 hours.",
            created_at: new Date().toISOString(),
          });
        } else {
          services.push({
            name: "Payment Processing",
            status: "operational",
          });
        }
      } else {
        services.push({
          name: "Payment Processing",
          status: "degraded",
          detail: "No purchases found",
        });
      }

      const storageSample = photos.find(
        (p) => p.storage_bucket && p.storage_path
      );
      if (storageSample) {
        const storageUrl = `${APP_SUPABASE_URL}/storage/v1/object/public/${storageSample.storage_bucket}/${storageSample.storage_path}`;
        const storageStart = Date.now();
        const storageRes = await fetch(storageUrl, { method: "HEAD" });
        const storageLatency = Date.now() - storageStart;

        if (storageRes.ok) {
          services.push({
            name: "CDN / Image Delivery",
            status: "operational",
            latency: storageLatency,
          });
        } else {
          services.push({
            name: "CDN / Image Delivery",
            status: "degraded",
            latency: storageLatency,
            detail: `Storage returned ${storageRes.status}`,
          });
          events.push({
            id: crypto.randomUUID(),
            event_type: "storage",
            severity: "warning",
            message: `Storage object check failed with ${storageRes.status}.`,
            created_at: new Date().toISOString(),
          });
        }
      } else {
        services.push({
          name: "CDN / Image Delivery",
          status: "degraded",
          detail: "No storage objects found",
        });
      }
    }

    if (STRIPE_SECRET_KEY) {
      const stripeStart = Date.now();
      const stripeRes = await fetch(
        "https://api.stripe.com/v1/charges?limit=1",
        {
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        }
      );
      const stripeLatency = Date.now() - stripeStart;
      if (stripeRes.ok) {
        const stripeData = await stripeRes.json();
        const lastCharge = stripeData?.data?.[0];
        metrics.last_stripe_charge_at = lastCharge?.created
          ? new Date(lastCharge.created * 1000).toISOString()
          : null;
        services.push({
          name: "Stripe API",
          status: "operational",
          latency: stripeLatency,
        });
      } else {
        const details = await stripeRes.text();
        services.push({
          name: "Stripe API",
          status: "down",
          latency: stripeLatency,
        });
        events.push({
          id: crypto.randomUUID(),
          event_type: "stripe",
          severity: "critical",
          message: `Stripe API error: ${details}`,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      services.push({
        name: "Stripe API",
        status: "degraded",
        detail: "STRIPE_SECRET_KEY not configured",
      });
    }

    return new Response(
      JSON.stringify({
        generated_at: new Date().toISOString(),
        services,
        events,
        metrics,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return errorResponse(
      "System health check failed",
      500,
      error?.message || "Unknown error"
    );
  }
});
