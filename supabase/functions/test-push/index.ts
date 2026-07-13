import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { sendPushToSubscriptions } from '../_shared/webpush.ts';

// Called from the "Test senden" button in Einstellungen — lets a staff
// member verify their own device is actually receiving pushes without
// waiting for a real lead to come in. Only ever targets the calling
// admin's own subscriptions, never anyone else's.
Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data: subscriptions, error: fetchError } = await supabaseService
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .eq('admin_user_id', auth.userId);

  if (fetchError) return json({ error: fetchError.message }, 500);
  if (!subscriptions || subscriptions.length === 0) {
    return json({ error: 'Kein aktives Abonnement für dieses Gerät gefunden.' }, 404);
  }

  const payload = JSON.stringify({
    title: 'Test-Benachrichtigung',
    body: 'Push-Benachrichtigungen sind korrekt eingerichtet.',
    url: '/staff/einstellungen',
  });

  const { sent, goneEndpoints } = await sendPushToSubscriptions(subscriptions, payload);

  if (goneEndpoints.length > 0) {
    await supabaseService.from('push_subscriptions').delete().in('endpoint', goneEndpoints);
  }

  if (sent === 0) {
    return json({ error: 'Zustellung fehlgeschlagen — Abonnement ist möglicherweise abgelaufen.' }, 502);
  }

  return json({ ok: true, sent });
});
