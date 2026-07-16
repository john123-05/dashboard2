import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, verifyStaffAdmin } from "../_shared/staffAuth.ts";

// park_access lives on this (dashboard2's own) project, not the shared
// content project - see supabase/migrations/20260214090100_create_park_access.sql.
const OWN_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OWN_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!OWN_SUPABASE_URL || !OWN_SERVICE_ROLE_KEY) {
    return json({ error: "Storage credentials not configured" }, 500);
  }

  try {
    const body = await req.json();
    const { staffAccessToken, park_id, park_name, password } = body ?? {};

    if (typeof staffAccessToken !== "string" || !staffAccessToken) {
      return json({ error: "Fehlende Staff-Sitzung" }, 401);
    }
    if (typeof park_id !== "string" || !park_id) {
      return json({ error: "Fehlende Park-ID" }, 400);
    }
    if (typeof password !== "string" || password.length < 6) {
      return json({ error: "Passwort muss mindestens 6 Zeichen haben" }, 400);
    }

    const auth = await verifyStaffAdmin(staffAccessToken);
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status);
    }

    // Hashing (crypt()/gen_salt('bf')) has to happen in Postgres via pgcrypto,
    // so this calls a small RPC rather than posting a pre-hashed value here.
    const rpcRes = await fetch(`${OWN_SUPABASE_URL}/rest/v1/rpc/admin_set_park_password`, {
      method: "POST",
      headers: {
        apikey: OWN_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${OWN_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_park_id: park_id,
        p_park_name: typeof park_name === "string" ? park_name : "",
        p_password: password,
      }),
    });

    if (!rpcRes.ok) {
      const details = await rpcRes.text();
      return json({ error: "Passwort konnte nicht gespeichert werden", details }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }, 500);
  }
});
