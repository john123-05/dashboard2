import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

/**
 * admin-park-page-settings – nur Staff (admin_users), für das Liftpictures-CRM (Kunde → Plan).
 *   GET  ?park_id=…                                 -> { data: { camera_page } }
 *   POST { park_id, camera_page: 'auto' | 'hidden' } -> speichern
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const CAMERA = ['auto', 'hidden'];

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  try {
    if (req.method === 'GET') {
      const parkId = new URL(req.url).searchParams.get('park_id') ?? '';
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      const { data, error } = await supabaseService.from('park_page_settings').select('camera_page, updated_at').eq('park_id', parkId).maybeSingle();
      if (error?.code === '42P01' || error?.code === 'PGRST205') return json({ ok: true, data: { camera_page: 'auto', migration_pending: true } });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data: { camera_page: data?.camera_page ?? 'auto', updated_at: data?.updated_at ?? null } });
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      const parkId = typeof body?.park_id === 'string' ? body.park_id : '';
      const camera = typeof body?.camera_page === 'string' ? body.camera_page : '';
      if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
      if (!CAMERA.includes(camera)) return json({ error: 'Ungültige Einstellung für die Kamera-Seite.' }, 400);
      const { error } = await supabaseService
        .from('park_page_settings')
        .upsert({ park_id: parkId, camera_page: camera, updated_at: new Date().toISOString(), updated_by: auth.userId }, { onConflict: 'park_id' });
      if (error?.code === '42P01' || error?.code === 'PGRST205') return json({ error: 'Die Tabelle park_page_settings fehlt noch (Migration einspielen).' }, 409);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data: { camera_page: camera } });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Page settings unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
