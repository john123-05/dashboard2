import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, verifyStaffAdmin } from "../_shared/staffAuth.ts";

const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OWN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!OWN_SUPABASE_URL || !OWN_SERVICE_ROLE_KEY) {
    return json({ error: "Storage credentials not configured" }, 500);
  }

  try {
    const body = await req.json();
    const { staffAccessToken, id } = body ?? {};

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

    const selectRes = await fetch(
      `${OWN_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}&select=storage_path`,
      {
        headers: {
          apikey: OWN_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!selectRes.ok) {
      return json({ error: "Eintrag konnte nicht geladen werden" }, 502);
    }
    const rows = await selectRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ error: "Eintrag nicht gefunden" }, 404);
    }
    const storagePath = rows[0].storage_path as string;

    // Best-effort: remove the file, but don't block the catalog deletion if
    // it's already gone or the storage call fails for some other reason.
    await fetch(`${OWN_SUPABASE_URL}/storage/v1/object/media-library/${storagePath}`, {
      method: "DELETE",
      headers: {
        apikey: OWN_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
      },
    }).catch(() => null);

    const deleteRes = await fetch(`${OWN_SUPABASE_URL}/rest/v1/media_assets?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        apikey: OWN_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
      },
    });

    if (!deleteRes.ok) {
      const details = await deleteRes.text();
      return json({ error: "Löschen fehlgeschlagen", details }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});
