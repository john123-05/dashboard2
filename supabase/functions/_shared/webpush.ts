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

export async function sendPushToSubscriptions(
  subscriptions: StoredSubscription[],
  payload: string,
): Promise<PushDispatchResult> {
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

  return { sent, goneEndpoints };
}
