import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';

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
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS_JSON');
const VAPID_CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'john.m.nolting@gmail.com';

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

// Built once per isolate and reused across invocations — ApplicationServer.new()
// generates its own ephemeral ECDH keypair internally, so this only needs to
// happen once, not per request.
let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

function getAppServer(): Promise<webpush.ApplicationServer> {
  if (!appServerPromise) {
    if (!VAPID_KEYS_JSON) {
      throw new Error('VAPID_KEYS_JSON is not configured on this project');
    }
    appServerPromise = (async () => {
      const exported = JSON.parse(VAPID_KEYS_JSON);
      const vapidKeys = await webpush.importVapidKeys(exported, { extractable: false });
      return webpush.ApplicationServer.new({
        contactInformation: `mailto:${VAPID_CONTACT_EMAIL}`,
        vapidKeys,
      });
    })();
  }
  return appServerPromise;
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

  if (!isLeadTable(table) || !record || typeof record !== 'object') {
    return json({ error: 'Missing or unknown table/record' }, 400);
  }

  const meta = TABLE_META[table];
  const payload = JSON.stringify({
    title: meta.title,
    body: buildNotificationBody(record as Record<string, unknown>),
    url: `/staff/website-anfragen?tab=${meta.tab}`,
  });

  const { data: subscriptions, error: fetchError } = await supabaseService
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key');

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!subscriptions || subscriptions.length === 0) {
    return json({ ok: true, sent: 0, removed: 0 });
  }

  const appServer = await getAppServer();

  let sent = 0;
  const goneEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      });
      try {
        await subscriber.pushTextMessage(payload, {});
        sent += 1;
      } catch (err) {
        if (err instanceof webpush.PushMessageError && err.isGone()) {
          goneEndpoints.push(sub.endpoint);
        } else {
          console.error('push failed for endpoint', sub.endpoint, err);
        }
      }
    }),
  );

  if (goneEndpoints.length > 0) {
    await supabaseService.from('push_subscriptions').delete().in('endpoint', goneEndpoints);
  }

  return json({ ok: true, sent, removed: goneEndpoints.length });
});
