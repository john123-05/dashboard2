import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';
import { applyDeals, loadDealsFor } from '../_shared/catalogDeals.ts';

/**
 * operator-catalog (docs/AUSBAU_PLAN.md, PK3): Pakete, Preise und Vergleichszeilen für „Preise & Pakete“ im Dashboard.
 *   GET ?park_id=…  -> { packages, points, cells, promotions }  (nur aktive; leer, wenn der Katalog noch nicht angelegt ist)
 *       Preise sind schon für diesen Park angepasst (Kundenpreis, Aktion); die Listenpreise stehen in `deal`.
 *   POST { park_id, promotion_id, event: 'requested' } -> zählt die Anfrage zur Aktion
 * Das Dashboard nimmt bei leerer Antwort oder Fehler seine eingebauten Werte (nie eine leere Preisseite).
 */
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function handler(req: Request): Promise<Response> {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const postPark = typeof body?.park_id === 'string' ? body.park_id : '';
      const promotionId = typeof body?.promotion_id === 'string' ? body.promotion_id : '';
      if (!UUID.test(postPark) || !UUID.test(promotionId) || body?.event !== 'requested') return json({ error: 'Invalid body' }, 400);
      const postAuth = await requireOperatorForPark(req, postPark);
      if (!postAuth.ok) return json({ error: postAuth.message }, postAuth.status);
      await supabaseService.from('catalog_promotion_events')
        .upsert({ promotion_id: promotionId, park_id: postAuth.parkId, event: 'requested' }, { onConflict: 'promotion_id,park_id,event', ignoreDuplicates: true });
      return json({ ok: true });
    }
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
        return json({ ok: true, data: { packages: [], points: [], cells: [], promotions: [] } });
      }
      if (result.error) return json({ error: 'Catalog unavailable' }, 503);
    }
    const deals = await loadDealsFor(auth.parkId);
    const adjusted = applyDeals((packages.data ?? []) as Record<string, unknown>[], deals.overrides, deals.promotions);
    const shown = new Set(adjusted.map((p) => (p.deal as { promotion_id?: string } | null)?.promotion_id).filter(Boolean) as string[]);
    const promotions = deals.promotions
      .filter((p) => shown.has(String(p.id)))
      .map((p) => ({ id: p.id, name: p.name, texts: p.texts, discount_percent: p.discount_percent, free_months: p.free_months, ends_on: p.ends_on, package_keys: p.package_keys }));
    if (promotions.length > 0) {
      await supabaseService.from('catalog_promotion_events').upsert(
        promotions.map((p) => ({ promotion_id: p.id, park_id: auth.parkId, event: 'seen' })),
        { onConflict: 'promotion_id,park_id,event', ignoreDuplicates: true },
      );
    }
    return json({ ok: true, data: { packages: adjusted, points: points.data ?? [], cells: cells.data ?? [], promotions } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Catalog unavailable' }, 500);
  }
}

if (import.meta.main) Deno.serve(handler);
