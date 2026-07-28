import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';
import { sendPushToSubscriptions } from '../_shared/webpush.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  const payload = await req.json().catch(() => null);
  const parkId = typeof payload?.park_id === 'string' ? payload.park_id : null;
  if (!parkId) return json({ error: 'park_id is required' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data: subscriptions, error: fetchError } = await supabaseService
    .from('operator_push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('operator_user_id', auth.userId)
    .eq('park_id', auth.parkId);

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!subscriptions || subscriptions.length === 0) {
    return json({ error: 'Kein aktives Abonnement für dieses Gerät gefunden.' }, 404);
  }

  const payloadText = JSON.stringify({
    title: 'Test-Benachrichtigung',
    body: 'Operator-Benachrichtigungen sind korrekt eingerichtet.',
    url: '/settings',
  });

  const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payloadText);

  if (goneEndpoints.length > 0) {
    await supabaseService.from('operator_push_subscriptions').delete().in('endpoint', goneEndpoints);
  }

  if (sent === 0) {
    return json({ error: 'Zustellung fehlgeschlagen — Abonnement ist möglicherweise abgelaufen.' }, 502);
  }

  return json({ ok: true, sent });
});
