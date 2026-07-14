import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { sendPushToSubscriptions } from '../_shared/webpush.ts';

// Fired by a Postgres AFTER INSERT trigger (via pg_net, see the
// notify_new_lead() trigger function in the SQL migration shipped alongside
// this function) on each of the 4 lead tables. Not reachable from the
// browser, so it's gated by a shared secret header instead of an admin
// bearer token or a platform JWT — same shape as the Make.com *-intake
// functions, just with the trigger as the caller instead of Make.com.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dispatch-Secret',
};

const DISPATCH_SECRET = Deno.env.get('DISPATCH_PUSH_SECRET');

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type LeadTableName =
  | 'email_leads'
  | 'website_requests'
  | 'german_website_requests'
  | 'product_finder_submissions';

const TABLE_META: Record<LeadTableName, { title: string; tab: string }> = {
  email_leads: { title: 'Neue Anfrage per E-Mail', tab: 'leads' },
  website_requests: { title: 'Neue Website-Anfrage (International)', tab: 'website' },
  german_website_requests: { title: 'Neue Website-Anfrage (Deutschland)', tab: 'germanWebsite' },
  product_finder_submissions: { title: 'Neue Produktfinder-Anfrage', tab: 'productFinder' },
};

function isLeadTable(value: unknown): value is LeadTableName {
  return typeof value === 'string' && value in TABLE_META;
}

function buildNotificationBody(record: Record<string, unknown>): string {
  const name = asText(record.name) || asText(record.full_name) || asText(record.firma);
  const email = asText(record.email);
  const parts = [name, email].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Neuer Eintrag eingegangen';
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

async function buildSupportTicketNotification(
  record: Record<string, unknown>,
): Promise<{ title: string; body: string }> {
  const priority = asText(record.priority);
  const priorityLabel = PRIORITY_LABELS[priority] ?? priority;

  // organization_id on support_tickets is actually the shared project's
  // real park_id (see support-tickets edge function in dashboard2) — look
  // up the name so the notification says which park it's from.
  const parkId = asText(record.organization_id);
  let parkName = '';
  if (parkId) {
    const { data } = await supabaseService.from('parks').select('name').eq('id', parkId).maybeSingle();
    parkName = data?.name ?? '';
  }

  const body = [parkName ? `Von ${parkName}` : null, priorityLabel ? `(${priorityLabel})` : null]
    .filter(Boolean)
    .join(' ');

  return {
    title: 'Neues Support-Ticket',
    body: body || 'Details in der App',
  };
}

async function buildSupportTicketMessageNotification(
  record: Record<string, unknown>,
): Promise<{ title: string; body: string; url: string }> {
  const ticketId = asText(record.ticket_id);
  const parkId = asText(record.organization_id);

  let parkName = '';
  if (parkId) {
    const { data } = await supabaseService.from('parks').select('name').eq('id', parkId).maybeSingle();
    parkName = data?.name ?? '';
  }

  let subject = '';
  if (ticketId) {
    const { data } = await supabaseService.from('support_tickets').select('subject').eq('id', ticketId).maybeSingle();
    subject = data?.subject ?? '';
  }

  const body = [parkName ? `Von ${parkName}` : null, subject ? `„${subject}“` : null].filter(Boolean).join(' · ');

  return {
    title: 'Neue Antwort im Support-Ticket',
    body: body || 'Details in der App',
    url: ticketId ? `/staff/support-ticket-kunden?ticket=${ticketId}` : '/staff/support-ticket-kunden',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  if (!DISPATCH_SECRET) {
    return json({ error: 'DISPATCH_PUSH_SECRET is not configured on this project' }, 500);
  }

  const givenSecret = req.headers.get('X-Dispatch-Secret');
  if (givenSecret !== DISPATCH_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const table = (body as Record<string, unknown>).table;
  const record = (body as Record<string, unknown>).record;

  if (!record || typeof record !== 'object') {
    return json({ error: 'Missing or unknown table/record' }, 400);
  }

  let payload: string;
  if (table === 'support_tickets') {
    const { title, body: notifBody } = await buildSupportTicketNotification(record as Record<string, unknown>);
    payload = JSON.stringify({ title, body: notifBody, url: '/staff/support-ticket-kunden' });
  } else if (table === 'support_ticket_messages') {
    // The trigger already gates this to author_role = 'operator' (support's
    // own replies shouldn't notify support) - this check is just defense in
    // depth in case dispatch-lead-push is ever invoked directly.
    const authorRole = asText((record as Record<string, unknown>).author_role);
    if (authorRole !== 'operator') {
      return json({ ok: true, sent: 0, removed: 0 });
    }
    const { title, body: notifBody, url } = await buildSupportTicketMessageNotification(
      record as Record<string, unknown>,
    );
    payload = JSON.stringify({ title, body: notifBody, url });
  } else if (isLeadTable(table)) {
    const meta = TABLE_META[table];
    payload = JSON.stringify({
      title: meta.title,
      body: buildNotificationBody(record as Record<string, unknown>),
      url: `/staff/website-anfragen?tab=${meta.tab}`,
    });
  } else {
    return json({ error: 'Missing or unknown table/record' }, 400);
  }

  const { data: subscriptions, error: fetchError } = await supabaseService
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key');

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!subscriptions || subscriptions.length === 0) {
    return json({ ok: true, sent: 0, removed: 0 });
  }

  const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payload);

  if (goneEndpoints.length > 0) {
    await supabaseService.from('push_subscriptions').delete().in('endpoint', goneEndpoints);
  }

  return json({ ok: true, sent, removed: goneEndpoints.length });
});
