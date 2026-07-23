import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Server-side guard so the restricted "staff" role can never read revenue data,
// even by calling the API directly. Deliberately FAILS OPEN: if we can't
// positively identify the caller as staff (anon call, no session, lookup
// error, missing config), we allow the request - so park owners are never
// locked out of their own revenue. Only a caller confirmed to have the "staff"
// membership role is blocked.
export async function isStaffCaller(req: Request): Promise<boolean> {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return false;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return false;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return false;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    return membership?.role === "staff";
  } catch {
    return false;
  }
}

export function staffForbidden(): Response {
  return new Response(JSON.stringify({ error: "Mitarbeiter haben keinen Zugriff auf Umsätze." }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
