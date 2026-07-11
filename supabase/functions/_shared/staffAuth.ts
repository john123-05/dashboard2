// Shared by upload-media-asset, update-media-asset, delete-media-asset.
// Verifies the caller against the real admin_users list in the shared
// staff/production project (kvpcwlcfgmsmarjtwpsx), never against this
// project's own auth (which has no admin concept — it's the customer-facing
// org/auth project).

const STAFF_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const STAFF_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

export type StaffAuthResult = { ok: true } | { ok: false; status: number; message: string };

export async function verifyStaffAdmin(staffAccessToken: string): Promise<StaffAuthResult> {
  if (!STAFF_SUPABASE_URL || !STAFF_SERVICE_KEY) {
    return { ok: false, status: 500, message: "Staff project credentials not configured" };
  }

  const userRes = await fetch(`${STAFF_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: STAFF_SERVICE_KEY,
      Authorization: `Bearer ${staffAccessToken}`,
    },
  });

  if (!userRes.ok) {
    return { ok: false, status: 401, message: "Ungültige oder abgelaufene Staff-Sitzung" };
  }

  const user = await userRes.json();
  const userId = user?.id;
  if (!userId) {
    return { ok: false, status: 401, message: "Konnte Benutzer nicht auflösen" };
  }

  const adminRes = await fetch(
    `${STAFF_SUPABASE_URL}/rest/v1/admin_users?select=user_id&user_id=eq.${userId}`,
    {
      headers: {
        apikey: STAFF_SERVICE_KEY,
        Authorization: `Bearer ${STAFF_SERVICE_KEY}`,
      },
    },
  );

  if (!adminRes.ok) {
    return { ok: false, status: 500, message: "Admin-Prüfung fehlgeschlagen" };
  }

  const rows = await adminRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, status: 403, message: "Kein Admin-Zugriff für diesen Account" };
  }

  return { ok: true };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
