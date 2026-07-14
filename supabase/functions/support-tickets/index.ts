import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const APP_SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL");
const APP_SUPABASE_SERVICE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_KEY");

function requireEnv() {
  if (!APP_SUPABASE_URL || !APP_SUPABASE_SERVICE_KEY) {
    return new Response(
      JSON.stringify({ error: "External Supabase credentials not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return null;
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
    return { ok: false, status: res.status, details };
  }

  const data = res.status === 204 ? null : await res.json();
  return { ok: true, data };
}

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

// Bridges the operator dashboard (this project) to the shared project's
// support_tickets table, which is RLS-locked to admin-read-only by design
// (see its migration comment: "read-only dashboard display") - it was
// always meant to be written by a service-role process like this one, not
// directly by operators. A trigger on that table (see
// notify_new_support_ticket) fires a push notification to staff on insert.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const envError = requireEnv();
  if (envError) return envError;

  if (req.method === "GET") {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    const ticketId = url.searchParams.get("ticket_id");
    const recentMessages = url.searchParams.get("recent_messages");

    // Thread for one ticket (operator-side detail view).
    if (ticketId) {
      const messagesRes = await fetchExternal(
        `support_ticket_messages?select=id,ticket_id,organization_id,author_id,author_role,message,created_at,updated_at&ticket_id=eq.${ticketId}&order=created_at.asc`
      );
      if (!messagesRes.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch messages", details: messagesRes.details }),
          { status: messagesRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ messages: messagesRes.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parkId) {
      return new Response(JSON.stringify({ error: "park_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recent support replies across all of this park's tickets, for the
    // operator dashboard's Alerts & Activity feed.
    if (recentMessages) {
      const ticketsForParkRes = await fetchExternal(
        `support_tickets?select=id,subject&organization_id=eq.${parkId}`
      );
      if (!ticketsForParkRes.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch tickets", details: ticketsForParkRes.details }),
          { status: ticketsForParkRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ticketRows = ticketsForParkRes.data as { id: string; subject: string }[];
      if (ticketRows.length === 0) {
        return new Response(JSON.stringify({ messages: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subjectByTicketId = Object.fromEntries(ticketRows.map((t) => [t.id, t.subject]));
      const idsList = ticketRows.map((t) => t.id).join(",");
      const recentRes = await fetchExternal(
        `support_ticket_messages?select=id,ticket_id,author_role,message,created_at&ticket_id=in.(${idsList})&author_role=eq.support&order=created_at.desc&limit=10`
      );
      if (!recentRes.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch recent messages", details: recentRes.details }),
          { status: recentRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const messages = (recentRes.data as { ticket_id: string; [key: string]: unknown }[]).map((m) => ({
        ...m,
        ticket_subject: subjectByTicketId[m.ticket_id] ?? null,
      }));
      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketsRes = await fetchExternal(
      `support_tickets?select=id,organization_id,created_by,subject,description,status,priority,created_at,updated_at&organization_id=eq.${parkId}&order=created_at.desc`
    );
    if (!ticketsRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch tickets", details: ticketsRes.details }),
        { status: ticketsRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ tickets: ticketsRes.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const payload = await req.json().catch(() => null);
    const parkId = payload?.park_id;
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const priority = VALID_PRIORITIES.has(payload?.priority) ? payload.priority : "medium";
    const reporterEmail = typeof payload?.reporter_email === "string" ? payload.reporter_email.trim() : "";
    const reporterName = typeof payload?.reporter_name === "string" ? payload.reporter_name.trim() : "";

    if (!parkId || !subject || !description) {
      return new Response(JSON.stringify({ error: "park_id, subject and description are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reporterLine = reporterName || reporterEmail
      ? `Gemeldet von: ${[reporterName, reporterEmail].filter(Boolean).join(" · ")}\n\n`
      : "";

    const insertRes = await fetchExternal("support_tickets", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: parkId,
        subject,
        description: `${reporterLine}${description}`,
        priority,
        status: "open",
      }),
    });

    if (!insertRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to create ticket", details: insertRes.details }),
        { status: insertRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const created = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
    return new Response(JSON.stringify({ ticket: created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
