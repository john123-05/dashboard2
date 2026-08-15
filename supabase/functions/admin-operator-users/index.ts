import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, verifyStaffAdmin } from "../_shared/staffAuth.ts";

const OPERATOR_SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const OPERATOR_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

type Role =
  | "org_owner"
  | "staff"
  | "park_manager"
  | "marketing"
  | "support_agent"
  | "platform_admin";

function normalizeParkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getAllowedParkIds(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
): string[] {
  const metadata = user?.app_metadata ?? {};
  return normalizeParkIds(metadata.allowed_park_ids ?? metadata.park_ids);
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization") ||
    req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function sanitizeRole(value: unknown): Role {
  const normalized = String(value ?? "").trim();
  const allowed: Role[] = [
    "org_owner",
    "staff",
    "park_manager",
    "marketing",
    "support_agent",
    "platform_admin",
  ];
  return allowed.includes(normalized as Role) ? (normalized as Role) : "staff";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!OPERATOR_SUPABASE_URL || !OPERATOR_SERVICE_ROLE_KEY) {
    return json({ error: "Operator project credentials not configured" }, 500);
  }

  try {
    const staffAccessToken = getBearerToken(req);
    if (!staffAccessToken) {
      return json({ error: "Fehlende Staff-Sitzung" }, 401);
    }

    const auth = await verifyStaffAdmin(staffAccessToken);
    if (!auth.ok) {
      return json({ error: auth.message }, auth.status);
    }

    const admin = createClient(
      OPERATOR_SUPABASE_URL,
      OPERATOR_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
      },
    );

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const parkId = String(body.park_id ?? "").trim();

    if (!parkId) {
      return json({ error: "park_id fehlt" }, 400);
    }

    const { data: park, error: parkError } = await admin
      .from("parks")
      .select("id, name, organization_id")
      .eq("id", parkId)
      .maybeSingle();

    if (parkError) {
      return json({ error: parkError.message }, 500);
    }
    if (!park?.organization_id) {
      return json({ error: "Park oder Organisation nicht gefunden" }, 404);
    }

    const organizationId = park.organization_id as string;

    if (action === "list") {
      const { data: memberships, error: membershipsError } = await admin
        .from("organization_memberships")
        .select("id, user_id, role, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (membershipsError) {
        return json({ error: membershipsError.message }, 500);
      }

      const userIds = (memberships ?? []).map((item) => item.user_id);
      let profiles: Array<
        { id: string; email: string | null; full_name: string | null }
      > = [];
      if (userIds.length > 0) {
        const { data: profileRows, error: profileError } = await admin
          .from("operator_profiles")
          .select("id, email, full_name")
          .in("id", userIds);

        if (profileError) {
          return json({ error: profileError.message }, 500);
        }

        profiles = profileRows ?? [];
      }

      const profileById = Object.fromEntries(
        profiles.map((profile) => [profile.id, profile]),
      );
      const authUsers = await Promise.all(
        userIds.map(async (userId) => {
          const { data, error } = await admin.auth.admin.getUserById(userId);
          if (error || !data?.user) return [userId, null] as const;
          return [userId, data.user] as const;
        }),
      );
      const authUserById = Object.fromEntries(authUsers);

      return json({
        users: (memberships ?? [])
          .map((membership) => {
            const authUser = authUserById[membership.user_id];
            const allowedParkIds = getAllowedParkIds(authUser);
            const isScoped = allowedParkIds.length > 0;
            const isVisibleForPark = !isScoped ||
              allowedParkIds.includes(parkId);

            return {
              membership_id: membership.id,
              user_id: membership.user_id,
              role: membership.role,
              created_at: membership.created_at,
              email: profileById[membership.user_id]?.email ?? null,
              full_name: profileById[membership.user_id]?.full_name ?? null,
              allowed_park_ids: allowedParkIds,
              is_park_scoped: isScoped,
              is_legacy_org_wide: !isScoped,
              is_visible_for_park: isVisibleForPark,
            };
          })
          .filter((user) => user.is_visible_for_park),
      });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      const role = sanitizeRole(body.role);

      if (!email || !email.includes("@")) {
        return json({ error: "Gültige E-Mail erforderlich." }, 400);
      }
      if (password.length < 8) {
        return json(
          { error: "Passwort muss mindestens 8 Zeichen haben." },
          400,
        );
      }

      const { data: created, error: createError } = await admin.auth.admin
        .createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { allowed_park_ids: [parkId] },
          user_metadata: { full_name: fullName },
        });

      if (createError || !created?.user) {
        return json({
          error: createError?.message ??
            "Benutzer konnte nicht angelegt werden.",
        }, 400);
      }

      const userId = created.user.id;

      await admin.from("operator_profiles").upsert({
        id: userId,
        email,
        full_name: fullName || null,
      });

      const { error: membershipError } = await admin
        .from("organization_memberships")
        .insert({ user_id: userId, organization_id: organizationId, role });

      if (membershipError) {
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ error: membershipError.message }, 400);
      }

      return json({ ok: true, user_id: userId });
    }

    if (action === "update") {
      const userId = String(body.user_id ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const password = String(body.password ?? "");
      const role = sanitizeRole(body.role);

      if (!userId) return json({ error: "user_id fehlt" }, 400);
      if (!email || !email.includes("@")) {
        return json({ error: "Gültige E-Mail erforderlich." }, 400);
      }
      if (password && password.length < 8) {
        return json(
          { error: "Passwort muss mindestens 8 Zeichen haben." },
          400,
        );
      }

      const { data: membership, error: membershipError } = await admin
        .from("organization_memberships")
        .select("id, role")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (membershipError) return json({ error: membershipError.message }, 500);
      if (!membership) {
        return json({ error: "Benutzer gehört nicht zu diesem Park." }, 404);
      }

      if (membership.role === "org_owner" && role !== "org_owner") {
        const { count: ownerCount } = await admin
          .from("organization_memberships")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("role", "org_owner");
        if ((ownerCount ?? 0) <= 1) {
          return json({
            error: "Mindestens ein Inhaber muss erhalten bleiben.",
          }, 400);
        }
      }

      const { data: currentUserData, error: currentUserError } = await admin
        .auth.admin.getUserById(userId);
      if (currentUserError || !currentUserData?.user) {
        return json({
          error: currentUserError?.message ??
            "Benutzer konnte nicht geladen werden.",
        }, 400);
      }

      const updatePayload: Record<string, unknown> = {
        email,
        app_metadata: {
          ...(currentUserData.user.app_metadata ?? {}),
          allowed_park_ids: [parkId],
        },
        user_metadata: { full_name: fullName },
      };
      if (password) updatePayload.password = password;

      const { error: updateUserError } = await admin.auth.admin.updateUserById(
        userId,
        updatePayload,
      );
      if (updateUserError) return json({ error: updateUserError.message }, 400);

      const { error: profileError } = await admin
        .from("operator_profiles")
        .update({ email, full_name: fullName || null })
        .eq("id", userId);
      if (profileError) return json({ error: profileError.message }, 400);

      const { error: roleError } = await admin
        .from("organization_memberships")
        .update({ role })
        .eq("organization_id", organizationId)
        .eq("user_id", userId);
      if (roleError) return json({ error: roleError.message }, 400);

      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = String(body.user_id ?? "").trim();
      if (!userId) return json({ error: "user_id fehlt" }, 400);

      const { data: membership, error: membershipError } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (membershipError) return json({ error: membershipError.message }, 500);
      if (!membership) {
        return json({ error: "Benutzer gehört nicht zu diesem Park." }, 404);
      }

      if (membership.role === "org_owner") {
        const { count: ownerCount } = await admin
          .from("organization_memberships")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("role", "org_owner");
        if ((ownerCount ?? 0) <= 1) {
          return json({
            error: "Der letzte Inhaber kann nicht gelöscht werden.",
          }, 400);
        }
      }

      await admin
        .from("organization_memberships")
        .delete()
        .eq("organization_id", organizationId)
        .eq("user_id", userId);

      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
    }, 500);
  }
});
