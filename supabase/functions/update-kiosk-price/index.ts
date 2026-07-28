import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/staffAuth.ts";

const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OWN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

type ChangeMode = "future" | "retroactive";

function isChangeMode(value: unknown): value is ChangeMode {
  return value === "future" || value === "retroactive";
}

async function fetchExternal(path: string, init: RequestInit = {}) {
  const res = await fetch(`${APP_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: APP_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const details = await res.text();
    return { ok: false as const, status: res.status, details };
  }

  if (res.status === 204) {
    return { ok: true as const, data: null };
  }

  return { ok: true as const, data: await res.json() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!OWN_SUPABASE_URL || !OWN_SERVICE_ROLE_KEY || !APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return json({ error: "Required credentials not configured" }, 500);
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return json({ error: "Missing bearer token" }, 401);
  }

  const ownService = createClient(OWN_SUPABASE_URL, OWN_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await ownService.auth.getUser(token);

  if (userError || !user) {
    return json({ error: "Invalid operator session" }, 401);
  }

  const { data: membership } = await ownService
    .from("organization_memberships")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role === "staff") {
    return json({ error: "No permission to change kiosk prices" }, 403);
  }

  const body = await req.json().catch(() => null) as {
    park_id?: unknown;
    price_cents?: unknown;
    mode?: unknown;
  } | null;

  const parkId = typeof body?.park_id === "string" ? body.park_id : "";
  const priceCents = Number(body?.price_cents);
  const mode = body?.mode;

  if (!parkId) return json({ error: "park_id is required" }, 400);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000) {
    return json({ error: "price_cents must be an integer between 0 and 100000" }, 400);
  }
  if (!isChangeMode(mode)) {
    return json({ error: "mode must be future or retroactive" }, 400);
  }

  const parkRes = await fetchExternal(`parks?select=id,name,price_per_photo_cents&id=eq.${parkId}&limit=1`);
  if (!parkRes.ok) {
    return json({ error: "Failed to load park", details: parkRes.details }, parkRes.status);
  }

  const park = Array.isArray(parkRes.data) ? parkRes.data[0] as Record<string, unknown> | undefined : undefined;
  if (!park) {
    return json({ error: "Park not found" }, 404);
  }

  const currentPriceRaw = park.price_per_photo_cents;
  const currentPriceCents = Number(currentPriceRaw);
  const nowIso = new Date().toISOString();

  if (mode === "retroactive") {
    const deleteRes = await fetchExternal(`park_price_history?park_id=eq.${parkId}`, { method: "DELETE" });
    if (!deleteRes.ok) {
      return json({ error: "Failed to clear existing price history", details: deleteRes.details }, deleteRes.status);
    }

    const insertRes = await fetchExternal("park_price_history", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          park_id: parkId,
          effective_from: "1970-01-01T00:00:00Z",
          price_per_photo_cents: priceCents,
          change_mode: "retroactive",
          changed_by_operator_id: user.id,
        },
      ]),
    });

    if (!insertRes.ok) {
      return json({ error: "Failed to write retroactive price history", details: insertRes.details }, insertRes.status);
    }
  } else {
    const historyRes = await fetchExternal(
      `park_price_history?select=id,effective_from,price_per_photo_cents&park_id=eq.${parkId}&order=effective_from.asc`
    );
    if (!historyRes.ok) {
      return json({ error: "Failed to load existing price history", details: historyRes.details }, historyRes.status);
    }

    const historyRows = Array.isArray(historyRes.data) ? historyRes.data as Record<string, unknown>[] : [];
    if (
      historyRows.length === 0 &&
      currentPriceRaw !== null &&
      currentPriceRaw !== undefined &&
      Number.isInteger(currentPriceCents)
    ) {
      const baselineRes = await fetchExternal("park_price_history", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([
          {
            park_id: parkId,
            effective_from: "1970-01-01T00:00:00Z",
            price_per_photo_cents: currentPriceCents,
            change_mode: "retroactive",
            changed_by_operator_id: user.id,
          },
        ]),
      });

      if (!baselineRes.ok) {
        return json({ error: "Failed to create baseline price history", details: baselineRes.details }, baselineRes.status);
      }
    }

    const futureRes = await fetchExternal("park_price_history", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([
        {
          park_id: parkId,
          effective_from: nowIso,
          price_per_photo_cents: priceCents,
          change_mode: "future",
          changed_by_operator_id: user.id,
        },
      ]),
    });

    if (!futureRes.ok) {
      return json({ error: "Failed to write future price change", details: futureRes.details }, futureRes.status);
    }
  }

  const patchRes = await fetchExternal(`parks?id=eq.${parkId}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      price_per_photo_cents: priceCents,
    }),
  });

  if (!patchRes.ok) {
    return json({ error: "Failed to update current kiosk price", details: patchRes.details }, patchRes.status);
  }

  const updatedHistoryRes = await fetchExternal(
    `park_price_history?select=effective_from,price_per_photo_cents,change_mode&park_id=eq.${parkId}&order=effective_from.asc`
  );

  if (!updatedHistoryRes.ok) {
    return json({ error: "Price was updated, but failed to reload history", details: updatedHistoryRes.details }, updatedHistoryRes.status);
  }

  return json({
    ok: true,
    park: Array.isArray(patchRes.data) ? patchRes.data[0] ?? null : null,
    price_history: updatedHistoryRes.data ?? [],
    applied_mode: mode,
  });
});
