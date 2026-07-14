import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
    return { ok: false as const, status: res.status, details };
  }

  const data = res.status === 204 ? null : await res.json();
  return { ok: true as const, data };
}

function errorResponse(status: number, error: string, details?: string) {
  return new Response(JSON.stringify(details ? { error, details } : { error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

// Confirms a ticket exists and belongs to the calling park before letting an
// operator read, reply to, archive or delete it - the park_id in the
// request is operator-supplied, so without this check one park could act on
// another park's ticket by guessing/knowing its id.
interface TicketRow {
  id: string;
  organization_id: string;
  status: string;
  archived_at: string | null;
}

type TicketLookup = { ok: true; ticket: TicketRow } | { ok: false; response: Response };

async function loadTicketForPark(ticketId: string, parkId: string): Promise<TicketLookup> {
  const res = await fetchExternal(
    `support_tickets?select=id,organization_id,status,archived_at&id=eq.${ticketId}`
  );
  if (!res.ok) return { ok: false, response: errorResponse(res.status, "Failed to load ticket", res.details) };

  const rows = res.data as TicketRow[];
  const ticket = rows[0];
  if (!ticket) return { ok: false, response: errorResponse(404, "Ticket not found") };
  if (ticket.organization_id !== parkId) {
    return { ok: false, response: errorResponse(403, "Ticket does not belong to this park") };
  }

  return { ok: true, ticket };
}

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
    const archived = url.searchParams.get("archived");

    // Thread for one ticket (operator-side detail view).
    if (ticketId) {
      if (!parkId) return errorResponse(400, "park_id is required");

      const lookup = await loadTicketForPark(ticketId, parkId);
      if (!lookup.ok) return lookup.response;

      const messagesRes = await fetchExternal(
        `support_ticket_messages?select=id,ticket_id,organization_id,author_id,author_role,message,created_at,updated_at&ticket_id=eq.${ticketId}&order=created_at.asc`
      );
      if (!messagesRes.ok) {
        return errorResponse(messagesRes.status, "Failed to fetch messages", messagesRes.details);
      }
      return new Response(JSON.stringify({ ticket: lookup.ticket, messages: messagesRes.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parkId) {
      return errorResponse(400, "park_id is required");
    }

    // Recent support replies across all of this park's tickets, for the
    // operator dashboard's Alerts & Activity feed.
    if (recentMessages) {
      const ticketsForParkRes = await fetchExternal(
        `support_tickets?select=id,subject&organization_id=eq.${parkId}`
      );
      if (!ticketsForParkRes.ok) {
        return errorResponse(ticketsForParkRes.status, "Failed to fetch tickets", ticketsForParkRes.details);
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
        return errorResponse(recentRes.status, "Failed to fetch recent messages", recentRes.details);
      }

      const messages = (recentRes.data as { ticket_id: string; [key: string]: unknown }[]).map((m) => ({
        ...m,
        ticket_subject: subjectByTicketId[m.ticket_id] ?? null,
      }));
      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const archivedFilter = archived ? "not.is.null" : "is.null";
    const ticketsRes = await fetchExternal(
      `support_tickets?select=id,organization_id,created_by,subject,description,status,priority,archived_at,created_at,updated_at&organization_id=eq.${parkId}&archived_at=${archivedFilter}&order=updated_at.desc`
    );
    if (!ticketsRes.ok) {
      return errorResponse(ticketsRes.status, "Failed to fetch tickets", ticketsRes.details);
    }

    return new Response(JSON.stringify({ tickets: ticketsRes.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const payload = await req.json().catch(() => null);
    const parkId = payload?.park_id;

    if (!parkId) {
      return errorResponse(400, "park_id is required");
    }

    // Reply to an existing ticket (ticket_id + message, no subject).
    if (payload?.ticket_id) {
      const ticketId = payload.ticket_id;
      const message = typeof payload?.message === "string" ? payload.message.trim() : "";
      if (!message) return errorResponse(400, "message is required");

      const lookup = await loadTicketForPark(ticketId, parkId);
      if (!lookup.ok) return lookup.response;

      const insertRes = await fetchExternal("support_ticket_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          ticket_id: ticketId,
          organization_id: parkId,
          author_role: "operator",
          message,
        }),
      });
      if (!insertRes.ok) {
        return errorResponse(insertRes.status, "Failed to send reply", insertRes.details);
      }

      // A new operator message means the conversation is active again -
      // reopen a resolved/closed ticket and bring it back out of the archive.
      const needsReopen = lookup.ticket.status === "resolved" || lookup.ticket.status === "closed";
      const needsUnarchive = lookup.ticket.archived_at !== null;
      let reopened = false;
      if (needsReopen || needsUnarchive) {
        const patch: Record<string, unknown> = {};
        if (needsReopen) patch.status = "open";
        if (needsUnarchive) patch.archived_at = null;
        const reopenRes = await fetchExternal(`support_tickets?id=eq.${ticketId}`, {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
        });
        reopened = reopenRes.ok && needsReopen;
      }

      const created = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
      return new Response(JSON.stringify({ message: created, reopened }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a new ticket.
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const description = typeof payload?.description === "string" ? payload.description.trim() : "";
    const priority = VALID_PRIORITIES.has(payload?.priority) ? payload.priority : "medium";
    const reporterEmail = typeof payload?.reporter_email === "string" ? payload.reporter_email.trim() : "";
    const reporterName = typeof payload?.reporter_name === "string" ? payload.reporter_name.trim() : "";

    if (!subject || !description) {
      return errorResponse(400, "park_id, subject and description are required");
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
      return errorResponse(insertRes.status, "Failed to create ticket", insertRes.details);
    }

    const created = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
    return new Response(JSON.stringify({ ticket: created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "PATCH") {
    const payload = await req.json().catch(() => null);
    const parkId = payload?.park_id;
    const ticketId = payload?.ticket_id;
    const archived = payload?.archived;

    if (!parkId || !ticketId || typeof archived !== "boolean") {
      return errorResponse(400, "park_id, ticket_id and archived (boolean) are required");
    }

    const lookup = await loadTicketForPark(ticketId, parkId);
    if (!lookup.ok) return lookup.response;

    const updateRes = await fetchExternal(`support_tickets?id=eq.${ticketId}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ archived_at: archived ? new Date().toISOString() : null }),
    });
    if (!updateRes.ok) {
      return errorResponse(updateRes.status, "Failed to update ticket", updateRes.details);
    }

    const updated = Array.isArray(updateRes.data) ? updateRes.data[0] : updateRes.data;
    return new Response(JSON.stringify({ ticket: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id");
    const ticketId = url.searchParams.get("ticket_id");

    if (!parkId || !ticketId) {
      return errorResponse(400, "park_id and ticket_id are required");
    }

    const lookup = await loadTicketForPark(ticketId, parkId);
    if (!lookup.ok) return lookup.response;

    // support_ticket_messages cascades on delete (see
    // 20260220004915_create_support_ticket_tables.sql in liftpictures-app-v2).
    const deleteRes = await fetchExternal(`support_tickets?id=eq.${ticketId}`, { method: "DELETE" });
    if (!deleteRes.ok) {
      return errorResponse(deleteRes.status, "Failed to delete ticket", deleteRes.details);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return errorResponse(405, "Method not allowed");
});
