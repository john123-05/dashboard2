import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, verifyStaffAdmin } from "../_shared/staffAuth.ts";

const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OWN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!OWN_SUPABASE_URL || !OWN_SERVICE_ROLE_KEY) {
    return json({ error: "Storage credentials not configured" }, 500);
  }

  try {
    const body = await req.json();
    const { staffAccessToken, id, title, category, subcategory, keywords } = body ?? {};

    if (typeof staffAccessToken !== "string" || !staffAccessToken) {
      return json({ error: "Fehlende Staff-Sitzung" }, 401);
    }
    if (typeof id !== "string" || !id) {
      return json({ error: "Fehlende ID" }, 400);
    }

    const auth = await verifyStaffAdmin(staffAccessToken);
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status);
    }

    const patch: Record<string, unknown> = {};
    if (typeof title === "string" && title.trim()) patch.title = title.trim();
    if (typeof category === "string" && category.trim()) patch.category = category.trim();
    if (typeof subcategory === "string") patch.subcategory = subcategory.trim() || null;
    if (Array.isArray(keywords)) {
      patch.keywords = keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    }

    if (Object.keys(patch).length === 0) {
      return json({ error: "Nichts zu ändern" }, 400);
    }

    const patchRes = await fetch(`${OWN_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: OWN_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });

    if (!patchRes.ok) {
      const details = await patchRes.text();
      return json({ error: "Aktualisierung fehlgeschlagen", details }, 502);
    }

    const rows = await patchRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "Eintrag nicht gefunden" }, 404);
    }

    return json({ ok: true, asset: rows[0] });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});
