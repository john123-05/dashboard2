import { invokeSharedEdgeFunction } from './sharedEdgeFunctions';

const VAPID_PUBLIC_KEY =
  'BJ0F5Oz_pAS91QnmiAoeNitlymlWb1ZF94TMYF_tpgRe9uM1SzdbhuBb6I0VaWmz7EYTs8xuWwciPW1EQg25fmk';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isOperatorPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getCurrentOperatorPushSubscription(): Promise<PushSubscription | null> {
  if (!isOperatorPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeOperatorPush(parkId: string): Promise<void> {
  if (!isOperatorPushSupported()) {
    throw new Error('Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Berechtigung für Benachrichtigungen wurde nicht erteilt.');
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const json = subscription.toJSON();
  const { error } = await invokeSharedEdgeFunction('operator-push-subscription', {
    method: 'POST',
    body: {
      park_id: parkId,
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    },
  });

  if (error) {
    throw new Error(error);
  }
}

export async function unsubscribeOperatorPush(parkId: string): Promise<void> {
  const subscription = await getCurrentOperatorPushSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const { error } = await invokeSharedEdgeFunction('operator-push-subscription', {
    method: 'DELETE',
    body: { park_id: parkId, endpoint },
  });

  if (error) {
    throw new Error(error);
  }
}

export async function sendOperatorTestPush(parkId: string): Promise<void> {
  const { error } = await invokeSharedEdgeFunction('operator-test-push', {
    method: 'POST',
    body: { park_id: parkId },
  });

  if (error) {
    throw new Error(error);
  }
}
