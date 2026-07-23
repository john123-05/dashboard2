import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json({ error: "Server not configured" }, 500);
    }

    // 1) Identify the caller from their session JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    // 2) The caller must be an org_owner. Staff management is owner-only.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership || membership.role !== "org_owner") {
      return json({ error: "Nur der Betreiber darf Mitarbeiter verwalten." }, 403);
    }
    const orgId = membership.organization_id as string;

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "list") {
      const { data: mems } = await admin
        .from("organization_memberships")
        .select("user_id, role, created_at")
        .eq("organization_id", orgId)
        .eq("role", "staff")
        .order("created_at", { ascending: true });
      const ids = (mems ?? []).map((m) => m.user_id);
      let profiles: Array<{ id: string; email: string | null; full_name: string | null }> = [];
      if (ids.length) {
        const { data } = await admin
          .from("operator_profiles")
          .select("id, email, full_name")
          .in("id", ids);
        profiles = data ?? [];
      }
      const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
      return json({
        staff: (mems ?? []).map((m) => ({
          user_id: m.user_id,
          created_at: m.created_at,
          email: byId[m.user_id]?.email ?? null,
          full_name: byId[m.user_id]?.full_name ?? null,
        })),
      });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      if (!email || !email.includes("@")) return json({ error: "Gültige E-Mail erforderlich." }, 400);
      if (password.length < 8) return json({ error: "Passwort muss mindestens 8 Zeichen haben." }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created?.user) {
        return json({ error: createErr?.message ?? "Konnte Mitarbeiter nicht anlegen (E-Mail evtl. schon vergeben)." }, 400);
      }
      const newId = created.user.id;
      await admin.from("operator_profiles").upsert({ id: newId, email, full_name: fullName });
      const { error: memErr } = await admin
        .from("organization_memberships")
        .insert({ user_id: newId, organization_id: orgId, role: "staff" });
      if (memErr) {
        await admin.auth.admin.deleteUser(newId).catch(() => {});
        return json({ error: memErr.message }, 400);
      }
      return json({ ok: true, user_id: newId });
    }

    if (action === "delete") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id fehlt" }, 400);
      // Only allow removing a staff member of the caller's own org.
      const { data: target } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", targetId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!target || target.role !== "staff") {
        return json({ error: "Kein Mitarbeiter dieser Organisation." }, 404);
      }
      await admin.from("organization_memberships").delete().eq("user_id", targetId).eq("organization_id", orgId);
      await admin.auth.admin.deleteUser(targetId).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
