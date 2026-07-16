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
    const pathPrefix = text(payload.path_prefix);
    if (!parkId) return json({ error: 'Park fehlt' }, 400);
    if (!pathPrefix) return json({ error: 'Kürzel fehlt' }, 400);

    const { data, error } = await supabaseService
      .from('park_path_prefixes')
      .insert({ park_id: parkId, path_prefix: pathPrefix, is_active: bool(payload.is_active, true) })
      .select('id, park_id, path_prefix, is_active')
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('park_path_prefixes').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
