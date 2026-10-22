import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-page-settings – Seiten-Einstellungen des Parks aus dem CRM (park_page_settings).
 *   GET ?park_id=… -> { data: { camera_page: 'auto' | 'hidden' } }
 * Ohne Zeile (oder solange die Tabelle fehlt) gilt 'auto', also das bisherige Verhalten.
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const parkId = new URL(req.url).searchParams.get('park_id') ?? '';
  if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);

  try {
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const { data, error } = await supabaseService.from('park_page_settings').select('camera_page').eq('park_id', auth.parkId).maybeSingle();
    if (error?.code === '42P01' || error?.code === 'PGRST205') return json({ data: { camera_page: 'auto' } });
    if (error) return json({ error: 'Page settings unavailable' }, 503);
    return json({ data: { camera_page: data?.camera_page === 'hidden' ? 'hidden' : 'auto' } });
  } catch {
    return json({ error: 'Page settings unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
