import * as webpush from 'jsr:@negrel/webpush@0.5.0';

// Shared by dispatch-lead-push (fired from a DB trigger) and test-push
// (fired from the staff Einstellungen page's "Test senden" button) — both
// need the exact same "send this payload to these subscriptions, prune the
// ones that come back expired" behavior.
const VAPID_KEYS_JSON = Deno.env.get('VAPID_KEYS_JSON');
const VAPID_CONTACT_EMAIL = Deno.env.get('VAPID_CONTACT_EMAIL') || 'john.m.nolting@gmail.com';

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

export function getAppServer(): Promise<webpush.ApplicationServer> {
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

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export interface PushDispatchResult {
  sent: number;
  goneEndpoints: string[];
}

// App-Geräte (Liftpictures Dashboard iOS ab 1.4) stehen in derselben Tabelle wie Browser:
// endpoint = "expo:<ExponentPushToken[...]>", p256dh/auth_key = "expo". Sie gehen über den
// Expo-Push-Dienst statt Web-Push. Damit schicken alle bestehenden Absender automatisch auch an die App.
export const EXPO_PREFIX = 'expo:';
export const isExpoSubscription = (sub: { endpoint: string }) => sub.endpoint.startsWith(EXPO_PREFIX);

async function sendExpo(subs: StoredSubscription[], payload: string): Promise<PushDispatchResult> {
  let parsed: { title?: string; body?: string; url?: string } = {};
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = { body: payload };
  }
  let sent = 0;
  const goneEndpoints: string[] = [];
  for (let i = 0; i < subs.length; i += 100) {
    const chunk = subs.slice(i, i + 100);
    const messages = chunk.map((s) => ({
      to: s.endpoint.slice(EXPO_PREFIX.length),
      title: parsed.title ?? 'Liftpictures',
      body: parsed.body ?? '',
      data: { url: parsed.url ?? '/' },
      sound: 'default',
    }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      const body = await res.json().catch(() => null);
      const tickets = (body?.data ?? []) as Array<{ status: string; details?: { error?: string } }>;
      tickets.forEach((t, k) => {
        if (t.status === 'ok') sent += 1;
        else if (t.details?.error === 'DeviceNotRegistered') goneEndpoints.push(chunk[k].endpoint);
        else console.error('expo push failed', t);
      });
    } catch (err) {
      console.error('expo push request failed', err);
    }
  }
  return { sent, goneEndpoints };
}

export async function sendPushToSubscriptions(
  subscriptions: StoredSubscription[],
  payload: string,
): Promise<PushDispatchResult> {
  const expo = subscriptions.filter(isExpoSubscription);
  const web = subscriptions.filter((s) => !isExpoSubscription(s));
  const expoResult = expo.length > 0 ? await sendExpo(expo, payload) : { sent: 0, goneEndpoints: [] };
  if (web.length === 0) return expoResult;

  const appServer = await getAppServer();

  let sent = expoResult.sent;
  const goneEndpoints: string[] = [...expoResult.goneEndpoints];

  await Promise.all(
    web.map(async (sub) => {
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

  return { sent, goneEndpoints };
}
