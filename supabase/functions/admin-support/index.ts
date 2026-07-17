import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

// Staff-side counterpart to support-tickets (which is the *operator*-side
// bridge, scoped to one park via park_id). This one is unscoped - any staff
// admin can act on any park's ticket - and was referenced by
// SupportTicketKundenPage.tsx / ParksPage.tsx via /api/admin/support the
// whole time, but never actually existed, so those actions have been
// silently failing.
function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'PATCH') {
    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);

    const ticketId = text(payload.ticket_id);
    const status = text(payload.status);
    if (!ticketId) return json({ error: 'ticket_id fehlt' }, 400);
    if (!VALID_STATUSES.has(status)) return json({ error: 'Ungültiger Status' }, 400);

    const { data, error } = await supabaseService
      .from('support_tickets')
      .update({ status })
      .eq('id', ticketId)
      .select('id, status')
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: 'Ticket nicht gefunden' }, 404);
    return json({ ok: true, data });
  }

  if (req.method === 'POST') {
    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);

    const ticketId = text(payload.ticket_id);
    const message = text(payload.message);
    if (!ticketId) return json({ error: 'ticket_id fehlt' }, 400);
    if (!message) return json({ error: 'Nachricht fehlt' }, 400);

    const { data: ticket, error: ticketError } = await supabaseService
      .from('support_tickets')
      .select('id, organization_id')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) return json({ error: ticketError.message }, 400);
    if (!ticket) return json({ error: 'Ticket nicht gefunden' }, 404);

    const { data, error } = await supabaseService
      .from('support_ticket_messages')
      .insert({
        ticket_id: ticketId,
        organization_id: ticket.organization_id,
        author_role: 'support',
        message,
      })
      .select('id')
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const ticketId = new URL(req.url).searchParams.get('id');
    if (!ticketId) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('support_tickets').delete().eq('id', ticketId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
