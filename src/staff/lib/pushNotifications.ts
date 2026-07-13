import { edgeFetch } from './edge-fetch';
import { getApiErrorMessage } from './api-error';

// Public VAPID key — safe to ship in frontend code, it only identifies
// which private key the browser's push service should encrypt messages
// against. The matching private key lives server-side only, as a Supabase
// function secret for dispatch-lead-push.
const VAPID_PUBLIC_KEY =
  'BJ0F5Oz_pAS91QnmiAoeNitlymlWb1ZF94TMYF_tpgRe9uM1SzdbhuBb6I0VaWmz7EYTs8xuWwciPW1EQg25fmk';

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Berechtigung für Benachrichtigungen wurde nicht erteilt.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // A browser refuses to subscribe with a new applicationServerKey while an
  // old subscription (e.g. from a previous VAPID key rotation) is still
  // active for this registration — it throws instead of prompting again, and
  // since Notification.requestPermission() above already resolved without a
  // popup (permission was decided earlier), that failure can look like
  // nothing happened at all. Clearing any stale subscription first makes
  // this idempotent regardless of what the browser already had stored.
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = subscription.toJSON();
  const res = await edgeFetch('/api/admin/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Abonnement konnte nicht gespeichert werden'));
  }
}

export async function sendTestPush(): Promise<void> {
  const res = await edgeFetch('/api/admin/test-push', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Test-Benachrichtigung konnte nicht gesendet werden'));
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const res = await edgeFetch('/api/admin/push-subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Abonnement konnte nicht entfernt werden'));
  }
}
