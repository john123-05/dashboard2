import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Sieht dieser Betreiber den Park? Die Zeilen von `parks` sind per RLS auf seine Parks beschränkt. */
async function operatorCanSeePark(req: Request, parkId: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!url || !anon || !authorization) return false;
  const res = await fetch(`${url}/rest/v1/parks?select=id&id=eq.${parkId}`, {
    headers: { apikey: anon, Authorization: authorization },
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * DELETE { park_id, ids: [claim-id, …] } - löscht Foto-Freischaltungen (photo_claims)
 * dieses Parks. Der Freischalt-Link der betroffenen Gäste funktioniert danach nicht mehr.
 */
async function deleteClaims(req: Request) {
  const body = await req.json().catch(() => null) as { park_id?: unknown; ids?: unknown } | null;
  const parkId = typeof body?.park_id === "string" ? body.park_id : "";
  const ids = Array.isArray(body?.ids) ? body!.ids.map(String) : [];
  if (!UUID.test(parkId) || ids.length === 0 || ids.length > 500 || !ids.every((id) => UUID.test(id))) {
    return jsonResponse({ error: "park_id und ids (UUIDs, höchstens 500) erforderlich" }, 400);
  }
  if (!(await operatorCanSeePark(req, parkId))) {
    return jsonResponse({ error: "Kein Zugriff auf diesen Park" }, 403);
  }

  const res = await fetch(
    `${APP_SUPABASE_URL}/rest/v1/photo_claims?park_id=eq.${parkId}&id=in.(${ids.join(",")})`,
    {
      method: "DELETE",
      headers: {
        apikey: APP_SUPABASE_SERVICE_KEY as string,
        Authorization: `Bearer ${APP_SUPABASE_SERVICE_KEY}`,
        Prefer: "return=representation",
      },
    },
  );
  if (!res.ok) {
    return jsonResponse({ error: "Löschen fehlgeschlagen", details: await res.text() }, 502);
  }
  const deleted = await res.json().catch(() => []) as Array<{ id: string }>;
  return jsonResponse({ deletedIds: deleted.map((r) => r.id) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  if (req.method === "DELETE") return await deleteClaims(req);

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    const parkFilter = parkId ? `&park_id=eq.${parkId}` : "";

    const [usersRes, purchasesRes, parksRes, photoClaimsRes] = await Promise.all([
      fetchExternal(`users?select=id,email,vorname,nachname,created_at,park_id&order=created_at.desc${parkFilter}`),
      fetchExternal(`purchases?select=user_id,amount_cents,total_amount_cents,status,paid_at,park_id${parkFilter}`),
      fetchExternal(`parks?select=id,name`),
      // Imst (and any future shop-less park) doesn't create a `users` row at all —
      // claiming a photo there only ever writes to `photo_claims` (service-role
      // only table, by design). Without this, those leads never show up here.
      fetchExternal(`photo_claims?select=id,full_name,email,phone,social_entry_id,park_id,marketing_opt_in,claimed_at,created_at,locale,country_code&order=created_at.desc${parkFilter}`),
    ]);

    if (!usersRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch users", details: usersRes.details }),
        { status: usersRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!purchasesRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch purchases", details: purchasesRes.details }),
        { status: purchasesRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!parksRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch parks", details: parksRes.details }),
        { status: parksRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Best-effort: if photo_claims is unreachable for some reason, still show the
    // users-based leads rather than failing the whole page.
    if (!photoClaimsRes.ok) {
      console.warn("Failed to fetch photo_claims leads:", photoClaimsRes.details);
    }

    const purchasesByUser = new Map<string, { count: number; total: number }>();
    (purchasesRes.data as Record<string, unknown>[]).forEach((p) => {
      const userId = p.user_id as string | undefined;
      if (!userId) return;
      const status = p.status as string | undefined;
      const paid = Boolean(p.paid_at);
      if (status && status !== "completed" && !paid) return;
      const amount =
        (p.total_amount_cents as number | null) ??
        (p.amount_cents as number | null) ??
        0;
      const entry = purchasesByUser.get(userId) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += amount;
      purchasesByUser.set(userId, entry);
    });

    const parkNames = new Map<string, string>();
    (parksRes.data as Record<string, unknown>[]).forEach((park) => {
      if (typeof park.id === "string" && typeof park.name === "string") {
        parkNames.set(park.id, park.name);
      }
    });

    const userLeads = (usersRes.data as Record<string, unknown>[]).map((u) => {
      const stats = purchasesByUser.get(u.id as string);
      const parkId = u.park_id as string | undefined;
      const parkName = parkId ? parkNames.get(parkId) || "Unknown" : "Unknown";
      return {
        id: u.id,
        email: u.email,
        full_name: [u.vorname, u.nachname].filter(Boolean).join(" "),
        source: stats && stats.count > 0 ? "purchase" : "unknown",
        opted_in: false,
        created_at: u.created_at,
        park_name: parkName,
        park: { name: parkName },
      };
    });

    const photoClaimLeads = photoClaimsRes.ok
      // Umfrage-Freischaltungen haben weder Adresse noch Telefon und gehören
      // nicht in die Kontaktliste; Freischaltungen nur mit Telefon schon.
      ? (photoClaimsRes.data as Record<string, unknown>[])
        .filter((c) => String(c.email ?? "").trim() !== "" || String(c.phone ?? "").trim() !== "")
        .map((c) => {
          const parkId = c.park_id as string | undefined;
          const parkName = parkId ? parkNames.get(parkId) || "Unknown" : "Unknown";
          return {
            id: c.id,
            email: c.email,
            phone: c.phone ?? null,
            full_name: c.full_name,
            source: c.social_entry_id ? "social_media" : "photo_claim",
            opted_in: Boolean(c.marketing_opt_in),
            created_at: (c.claimed_at ?? c.created_at) as string,
            locale: c.locale,
            country_code: c.country_code,
            park_name: parkName,
            park: { name: parkName },
          };
        })
      : [];

    const leads = [...userLeads, ...photoClaimLeads].sort(
      (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    );

    return new Response(
      JSON.stringify({ leads }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
