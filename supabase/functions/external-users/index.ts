import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  try {
    const [usersRes, purchasesRes] = await Promise.all([
      fetchExternal("users?select=id,email,vorname,nachname,created_at"),
      fetchExternal("purchases?select=user_id,amount_cents,total_amount_cents,status,paid_at"),
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

    const users = (usersRes.data as Record<string, unknown>[]).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      full_name: [u.vorname, u.nachname].filter(Boolean).join(" ") || null,
      phone: null,
      opted_in_marketing: false,
      created_at: u.created_at,
    }));

    const purchases = (purchasesRes.data as Record<string, unknown>[]).map((p) => ({
      customer_id: p.user_id,
      amount_cents: p.total_amount_cents ?? p.amount_cents ?? 0,
      status: p.status ?? (p.paid_at ? "completed" : "pending"),
    }));

    return new Response(
      JSON.stringify({ customers: users, purchases }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
