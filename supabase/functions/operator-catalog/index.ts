import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-catalog (docs/AUSBAU_PLAN.md, PK3): Pakete, Preise und Vergleichszeilen für „Preise & Pakete“ im Dashboard.
 *   GET ?park_id=…  -> { packages, points, cells }  (nur aktive; leer, wenn der Katalog noch nicht angelegt ist)
 * Das Dashboard nimmt bei leerer Antwort oder Fehler seine eingebauten Werte (nie eine leere Preisseite).
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const parkId = new URL(req.url).searchParams.get('park_id') ?? '';
    if (!UUID.test(parkId)) return json({ error: 'Invalid park_id' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const [packages, points, cells] = await Promise.all([
      supabaseService.from('catalog_packages')
        .select('key, grp, sort, highlight, price_cents, price_unit, term_months, free_months, setup_cents, texts, bullets, meta')
        .eq('active', true).order('sort'),
      supabaseService.from('catalog_points').select('key, grp, sort, kind, soon, texts').eq('active', true).order('sort'),
      supabaseService.from('catalog_package_points').select('package_key, point_key, included, value'),
    ]);
    for (const result of [packages, points, cells]) {
      if (result.error?.code === '42P01' || result.error?.code === 'PGRST205') {
        return json({ ok: true, data: { packages: [], points: [], cells: [] } });
      }
      if (result.error) return json({ error: 'Catalog unavailable' }, 503);
    }
    return json({ ok: true, data: { packages: packages.data ?? [], points: points.data ?? [], cells: cells.data ?? [] } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Catalog unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
