import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

// Called from the staff app once a logged-in admin grants notification
// permission and the browser hands back a PushSubscription. Uses the same
// admin-bearer-token auth as every other staff-facing function here, not a
// separate secret, since this is only ever called from an authenticated
// staff session (unlike the Make.com intake endpoints).
Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'POST') {
    const payload = await req.json().catch(() => null);
    const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint : null;
    const p256dh = typeof payload?.keys?.p256dh === 'string' ? payload.keys.p256dh : null;
    const authKey = typeof payload?.keys?.auth === 'string' ? payload.keys.auth : null;
    const userAgent = typeof payload?.userAgent === 'string' ? payload.userAgent : null;

    if (!endpoint || !p256dh || !authKey) {
      return json({ error: 'Invalid subscription payload' }, 400);
    }

    const { error } = await supabaseService.from('push_subscriptions').upsert(
      {
        admin_user_id: auth.userId,
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
    const payload = await req.json().catch(() => null);
    const endpoint = typeof payload?.endpoint === 'string' ? payload.endpoint : null;
    if (!endpoint) return json({ error: 'Missing endpoint' }, 400);

    const { error } = await supabaseService.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
