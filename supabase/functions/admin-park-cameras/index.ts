import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'POST') {
    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);

    const parkId = text(payload.park_id);
    const customerCode = text(payload.customer_code).replace(/\D/g, '').slice(0, 4);
    if (!parkId) return json({ error: 'Park fehlt' }, 400);
    if (!customerCode) return json({ error: 'Kamera-Code fehlt' }, 400);

    const { data, error } = await supabaseService
      .from('park_cameras')
      .insert({
        park_id: parkId,
        customer_code: customerCode,
        camera_name: text(payload.camera_name) || null,
        attraction_id: text(payload.attraction_id) || null,
        is_active: bool(payload.is_active, true),
      })
      .select('id, park_id, customer_code, camera_name, attraction_id, is_active')
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('park_cameras').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
