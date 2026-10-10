import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-articles (docs/PRODUKT_PLAN.md, G3): veröffentlichte Ratgeber-Artikel für das Betreiber-Dashboard.
 * GET ?park_id=… -> { data: { articles: […] } }. Bearbeitet werden sie im Liftpictures-CRM (Tabelle `articles`).
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
    const { data, error } = await supabaseService.from('articles')
      .select('slug, title, excerpt, body, lang, cover_url, cover_alt, published_at')
      .eq('status', 'published').order('published_at', { ascending: false }).limit(200);
    if (error?.code === '42P01' || error?.code === 'PGRST205') return json({ ok: true, data: { articles: [] } });
    if (error) return json({ error: 'Articles unavailable' }, 503);
    return json({ ok: true, data: { articles: data ?? [] } });
  } catch {
    return json({ error: 'Articles unavailable' }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
