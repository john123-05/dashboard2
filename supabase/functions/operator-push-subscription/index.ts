import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const payload = await req.json().catch(() => null);
  const parkId = typeof payload?.park_id === 'string' ? payload.park_id : null;
  if (!parkId) return json({ error: 'park_id is required' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'POST') {
    const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint : null;
    const p256dh = typeof payload?.keys?.p256dh === 'string' ? payload.keys.p256dh : null;
    const authKey = typeof payload?.keys?.auth === 'string' ? payload.keys.auth : null;
    const userAgent = typeof payload?.userAgent === 'string' ? payload.userAgent : null;

    if (!endpoint || !p256dh || !authKey) {
      return json({ error: 'Invalid subscription payload' }, 400);
    }

    const { error } = await supabaseService.from('operator_push_subscriptions').upsert(
      {
        operator_user_id: auth.userId,
        organization_id: auth.organizationId,
        park_id: auth.parkId,
        endpoint,
        p256dh,
        auth_key: authKey,
        user_agent: userAgent,
      },
      { onConflict: 'endpoint' },
    );

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint : null;
    if (!endpoint) return json({ error: 'Missing endpoint' }, 400);

    const { error } = await supabaseService
      .from('operator_push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('operator_user_id', auth.userId)
      .eq('park_id', auth.parkId);

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
