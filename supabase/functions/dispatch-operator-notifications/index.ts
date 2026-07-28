import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { sendPushToSubscriptions } from '../_shared/webpush.ts';

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

interface OperatorPreferenceRow {
  operator_user_id: string;
  park_id: string;
  push_enabled: boolean;
  photo_inactivity_enabled: boolean;
  photo_inactivity_minutes: number;
  paper_low_enabled: boolean;
  paper_low_threshold: number;
  support_enabled: boolean;
  system_health_enabled: boolean;
}

interface ParkRow {
  id: string;
  name: string;
  timezone: string | null;
  opening_hours: Record<string, [string, string]> | null;
}

interface MachineStatusRow {
  id: string;
  machine_id: string;
  park_id: string;
  camera_code: string | null;
  last_seen_at: string | null;
  paper_remaining: number | null;
  payload: Record<string, unknown> | null;
}

interface SupportMessageRow {
  id: string;
  ticket_id: string;
  organization_id: string;
  message: string;
  created_at: string;
}

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type NotificationType = 'photo_inactivity' | 'paper_low' | 'support_reply' | 'system_health';

function stateMapKey(userId: string, parkId: string, type: NotificationType): string {
  return `${userId}:${parkId}:${type}`;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes < 120) return `${Math.round(totalMinutes)} Minuten`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return minutes === 0 ? `${hours} Stunden` : `${hours} Std ${minutes} Min`;
}

function parseOperationalEvents(payload: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!payload) return [];
  return Array.isArray(payload.operational_events)
    ? (payload.operational_events as Array<Record<string, unknown>>)
    : [];
}

function isWithinOpeningHours(park: ParkRow, now = new Date()): boolean {
  const openingHours = park.opening_hours;
  if (!openingHours || typeof openingHours !== 'object') return true;

  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: park.timezone || 'Europe/Vienna',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const day = parts.find((part) => part.type === 'weekday')?.value.toLowerCase().slice(0, 3) ?? '';
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const hoursForDay = openingHours[day];
    if (!Array.isArray(hoursForDay) || hoursForDay.length < 2) return false;

    const nowMinutes = Number(hour) * 60 + Number(minute);
    const [start, end] = hoursForDay;
    const [startHour, startMinute] = start.split(':').map((value) => Number(value) || 0);
    const [endHour, endMinute] = end.split(':').map((value) => Number(value) || 0);
    const startMinutes = startHour * 60 + startMinute + 30;
    const endMinutes = endHour * 60 + endMinute;
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  } catch {
    return true;
  }
}

async function loadLatestPhotoAt(parkId: string): Promise<string | null> {
  const { data, error } = await supabaseService
    .from('photos')
    .select('captured_at, created_at')
    .eq('park_id', parkId)
    .order('captured_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return asText(data.captured_at) || asText(data.created_at) || null;
}

async function loadLatestSupportReply(parkId: string): Promise<(SupportMessageRow & { subject: string | null }) | null> {
  const { data, error } = await supabaseService
    .from('support_ticket_messages')
    .select('id, ticket_id, organization_id, message, created_at')
    .eq('organization_id', parkId)
    .eq('author_role', 'support')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const { data: ticket } = await supabaseService
    .from('support_tickets')
    .select('subject')
    .eq('id', data.ticket_id)
    .maybeSingle();

  return { ...data, subject: ticket?.subject ?? null };
}

async function loadParks(parkIds: string[]): Promise<Map<string, ParkRow>> {
  if (parkIds.length === 0) return new Map();

  const { data, error } = await supabaseService
    .from('parks')
    .select('id, name, timezone, opening_hours')
    .in('id', parkIds);

  if (error || !data) return new Map();

  return new Map(
    data.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        timezone: row.timezone ?? null,
        opening_hours: (row.opening_hours as Record<string, [string, string]> | null) ?? null,
      },
    ]),
  );
}

async function loadLatestMachineStatusByPark(parkIds: string[]): Promise<Map<string, MachineStatusRow>> {
  if (parkIds.length === 0) return new Map();

  const { data, error } = await supabaseService
    .from('machine_status')
    .select('id, machine_id, park_id, camera_code, last_seen_at, paper_remaining, payload')
    .in('park_id', parkIds)
    .order('last_seen_at', { ascending: false })
    .limit(Math.max(parkIds.length * 5, 10));

  if (error || !data) return new Map();

  const rowsByPark = new Map<string, MachineStatusRow>();
  for (const row of data) {
    if (!rowsByPark.has(row.park_id)) {
      rowsByPark.set(row.park_id, {
        id: row.id,
        machine_id: row.machine_id,
        park_id: row.park_id,
        camera_code: row.camera_code ?? null,
        last_seen_at: row.last_seen_at ?? null,
        paper_remaining: row.paper_remaining ?? null,
        payload: (row.payload as Record<string, unknown> | null) ?? null,
      });
    }
  }
  return rowsByPark;
}

async function upsertDispatchState(
  operatorUserId: string,
  parkId: string,
  notificationType: NotificationType,
  stateKey: string | null,
  payload: Record<string, unknown>,
) {
  await supabaseService.from('operator_notification_dispatch_state').upsert(
    {
      operator_user_id: operatorUserId,
      park_id: parkId,
      notification_type: notificationType,
      state_key: stateKey,
      last_sent_at: new Date().toISOString(),
      resolved_at: null,
      payload,
    },
    { onConflict: 'operator_user_id,park_id,notification_type' },
  );
}

async function resolveDispatchState(
  operatorUserId: string,
  parkId: string,
  notificationType: NotificationType,
) {
  await supabaseService
    .from('operator_notification_dispatch_state')
    .upsert(
      {
        operator_user_id: operatorUserId,
        park_id: parkId,
        notification_type: notificationType,
        resolved_at: new Date().toISOString(),
      },
      { onConflict: 'operator_user_id,park_id,notification_type' },
    );
}

async function sendNotification(
  subscriptions: SubscriptionRow[],
  title: string,
  body: string,
  url: string,
): Promise<number> {
  if (subscriptions.length === 0) return 0;

  const payload = JSON.stringify({ title, body, url });
  const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payload);

  if (goneEndpoints.length > 0) {
    await supabaseService.from('operator_push_subscriptions').delete().in('endpoint', goneEndpoints);
  }

  return sent;
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

  const body = await req.json().catch(() => ({}));
  const requestedParkId = typeof body?.park_id === 'string' ? body.park_id : null;

  const prefsQuery = supabaseService
    .from('operator_notification_preferences')
    .select(
      'operator_user_id, park_id, push_enabled, photo_inactivity_enabled, photo_inactivity_minutes, paper_low_enabled, paper_low_threshold, support_enabled, system_health_enabled',
    )
    .eq('push_enabled', true);

  if (requestedParkId) {
    prefsQuery.eq('park_id', requestedParkId);
  }

  const { data: preferences, error: prefsError } = await prefsQuery;
  if (prefsError) return json({ error: prefsError.message }, 500);
  if (!preferences || preferences.length === 0) {
    return json({ ok: true, sent: 0 });
  }

  const parkIds = [...new Set(preferences.map((row) => row.park_id))];
  const operatorUserIds = [...new Set(preferences.map((row) => row.operator_user_id))];

  const [parksMap, machineStatusMap] = await Promise.all([
    loadParks(parkIds),
    loadLatestMachineStatusByPark(parkIds),
  ]);

  const { data: subscriptionRows } = await supabaseService
    .from('operator_push_subscriptions')
    .select('operator_user_id, park_id, endpoint, p256dh, auth_key')
    .in('operator_user_id', operatorUserIds)
    .in('park_id', parkIds);

  const subscriptionsByUserPark = new Map<string, SubscriptionRow[]>();
  for (const row of subscriptionRows ?? []) {
    const key = `${row.operator_user_id}:${row.park_id}`;
    const list = subscriptionsByUserPark.get(key) ?? [];
    list.push({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth_key: row.auth_key,
    });
    subscriptionsByUserPark.set(key, list);
  }

  const { data: stateRows } = await supabaseService
    .from('operator_notification_dispatch_state')
    .select('operator_user_id, park_id, notification_type, state_key, resolved_at, payload')
    .in('operator_user_id', operatorUserIds)
    .in('park_id', parkIds);

  const states = new Map<string, { state_key: string | null; resolved_at: string | null }>();
  for (const row of stateRows ?? []) {
    states.set(stateMapKey(row.operator_user_id, row.park_id, row.notification_type as NotificationType), {
      state_key: row.state_key ?? null,
      resolved_at: row.resolved_at ?? null,
    });
  }

  const supportRepliesByPark = new Map<string, Awaited<ReturnType<typeof loadLatestSupportReply>>>();
  const latestPhotoByPark = new Map<string, string | null>();

  let sent = 0;

  for (const pref of preferences as OperatorPreferenceRow[]) {
    const park = parksMap.get(pref.park_id);
    if (!park) continue;

    const subs = subscriptionsByUserPark.get(`${pref.operator_user_id}:${pref.park_id}`) ?? [];
    if (subs.length === 0) continue;

    if (pref.support_enabled) {
      if (!supportRepliesByPark.has(pref.park_id)) {
        supportRepliesByPark.set(pref.park_id, await loadLatestSupportReply(pref.park_id));
      }
      const reply = supportRepliesByPark.get(pref.park_id) ?? null;
      if (reply) {
        const key = stateMapKey(pref.operator_user_id, pref.park_id, 'support_reply');
        const state = states.get(key);
        if (state?.state_key !== reply.id) {
          const title = reply.subject ? `Neue Support-Antwort: ${reply.subject}` : 'Neue Support-Antwort';
          const bodyText = asText(reply.message).slice(0, 120) || 'Unser Team hat auf dein Ticket geantwortet.';
          sent += await sendNotification(subs, title, bodyText, '/tickets');
          await upsertDispatchState(pref.operator_user_id, pref.park_id, 'support_reply', reply.id, {
            ticket_id: reply.ticket_id,
            message_id: reply.id,
          });
          states.set(key, { state_key: reply.id, resolved_at: null });
        }
      }
    }

    const machine = machineStatusMap.get(pref.park_id) ?? null;

    if (pref.paper_low_enabled) {
      const remaining = machine?.paper_remaining ?? null;
      const key = stateMapKey(pref.operator_user_id, pref.park_id, 'paper_low');
      if (remaining !== null && remaining <= pref.paper_low_threshold) {
        const nextStateKey = `${remaining}`;
        const state = states.get(key);
        if (state?.state_key !== nextStateKey || state.resolved_at) {
          sent += await sendNotification(
            subs,
            `Fotopapier wird knapp bei ${park.name}`,
            `Noch ${remaining} Blatt verfügbar. Bitte Papier bald nachfüllen.`,
            '/overview',
          );
          await upsertDispatchState(pref.operator_user_id, pref.park_id, 'paper_low', nextStateKey, {
            paper_remaining: remaining,
            threshold: pref.paper_low_threshold,
          });
          states.set(key, { state_key: nextStateKey, resolved_at: null });
        }
      } else {
        await resolveDispatchState(pref.operator_user_id, pref.park_id, 'paper_low');
        states.set(key, { state_key: null, resolved_at: new Date().toISOString() });
      }
    }

    if (pref.system_health_enabled) {
      const key = stateMapKey(pref.operator_user_id, pref.park_id, 'system_health');
      const lastSeen = toDate(machine?.last_seen_at ?? null);
      const ageMinutes = lastSeen ? (Date.now() - lastSeen.getTime()) / 60000 : Number.POSITIVE_INFINITY;
      const recentOperationalEvents = parseOperationalEvents(machine?.payload ?? null)
        .map((event) => ({
          severity: asText(event.severity) || 'info',
          description: asText(event.description) || asText(event.message) || 'Systemereignis',
        }))
        .filter((event) => event.severity && event.severity !== 'info');

      let nextStateKey: string | null = null;
      let title = '';
      let bodyText = '';

      if (!lastSeen || ageMinutes > 15) {
        nextStateKey = `offline:${machine?.last_seen_at ?? 'never'}`;
        title = `Systemzustand kritisch bei ${park.name}`;
        bodyText = lastSeen
          ? `Die Liftpic-Sync-Daten sind seit ${formatDurationMinutes(ageMinutes)} nicht mehr aktualisiert worden.`
          : 'Für diesen Park ist derzeit kein aktueller Sync-Status verfügbar.';
      } else if (recentOperationalEvents.length > 0) {
        const latestEvent = recentOperationalEvents[0];
        nextStateKey = `event:${latestEvent.severity}:${latestEvent.description}`;
        title = `Systemwarnung bei ${park.name}`;
        bodyText = latestEvent.description;
      }

      if (nextStateKey) {
        const state = states.get(key);
        if (state?.state_key !== nextStateKey || state.resolved_at) {
          sent += await sendNotification(subs, title, bodyText, '/health');
          await upsertDispatchState(pref.operator_user_id, pref.park_id, 'system_health', nextStateKey, {
            last_seen_at: machine?.last_seen_at ?? null,
          });
          states.set(key, { state_key: nextStateKey, resolved_at: null });
        }
      } else {
        await resolveDispatchState(pref.operator_user_id, pref.park_id, 'system_health');
        states.set(key, { state_key: null, resolved_at: new Date().toISOString() });
      }
    }

    if (pref.photo_inactivity_enabled && isWithinOpeningHours(park)) {
      if (!latestPhotoByPark.has(pref.park_id)) {
        latestPhotoByPark.set(pref.park_id, await loadLatestPhotoAt(pref.park_id));
      }
      const latestPhotoAt = latestPhotoByPark.get(pref.park_id) ?? null;
      const latestPhotoDate = toDate(latestPhotoAt);
      const gapMinutes = latestPhotoDate
        ? (Date.now() - latestPhotoDate.getTime()) / 60000
        : Number.POSITIVE_INFINITY;
      const key = stateMapKey(pref.operator_user_id, pref.park_id, 'photo_inactivity');

      if (!latestPhotoDate || gapMinutes >= pref.photo_inactivity_minutes) {
        const nextStateKey = latestPhotoAt ?? 'never';
        const state = states.get(key);
        if (state?.state_key !== nextStateKey || state.resolved_at) {
          sent += await sendNotification(
            subs,
            `Keine neuen Bilder bei ${park.name}`,
            latestPhotoDate
              ? `Seit ${formatDurationMinutes(gapMinutes)} ist kein neues Bild eingegangen.`
              : 'Es wurde noch kein letztes Bild erkannt. Bitte Upload prüfen.',
            '/overview',
          );
          await upsertDispatchState(pref.operator_user_id, pref.park_id, 'photo_inactivity', nextStateKey, {
            latest_photo_at: latestPhotoAt,
            threshold_minutes: pref.photo_inactivity_minutes,
          });
          states.set(key, { state_key: nextStateKey, resolved_at: null });
        }
      } else {
        await resolveDispatchState(pref.operator_user_id, pref.park_id, 'photo_inactivity');
        states.set(key, { state_key: null, resolved_at: new Date().toISOString() });
      }
    }
  }

  return json({ ok: true, sent });
});
