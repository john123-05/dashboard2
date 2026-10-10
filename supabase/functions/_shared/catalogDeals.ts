import { supabaseService } from './sameProjectAdminAuth.ts';

/**
 * Rabatte je Kunde (park_price_overrides) und Aktionen (catalog_promotions) auf die Katalogpreise anwenden
 * (docs/AUSBAU_PLAN.md, PK4/PK5). Das Dashboard bekommt fertige Preise: `price_cents`, `setup_cents`, `free_months`
 * und Sonderwerte sind schon angepasst, die Listenpreise stehen in `deal`.
 * Regel: Kundenpreis vor Aktion; mehrere Aktionen: die mit dem höchsten Rabatt. Geschenkte Monate zählen nur bei
 * Paketen mit Laufzeit.
 */
type Row = Record<string, any>; // deno-lint-ignore no-explicit-any

export type Deal = {
  source: 'override' | 'promotion';
  name: string | null;
  promotion_id: string | null;
  percent: number | null;
  fixed: boolean;
  extra_free_months: number;
  valid_until: string | null;
  list_price_cents: number | null;
  list_free_months: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const scale = (cents: unknown, percent: number): number | null =>
  typeof cents === 'number' ? Math.round((cents * (100 - percent)) / 100) : null;

export async function loadDealsFor(parkId: string): Promise<{ overrides: Row[]; promotions: Row[]; plan: string }> {
  const day = today();
  const [overrides, promotions, entitlement] = await Promise.all([
    supabaseService.from('park_price_overrides').select('*').eq('park_id', parkId).eq('active', true),
    supabaseService.from('catalog_promotions').select('*').eq('active', true),
    supabaseService.from('park_entitlements').select('plan').eq('park_id', parkId).maybeSingle(),
  ]);
  const plan = String(entitlement.data?.plan ?? 'marketing_starter');
  const okOverrides = ((overrides.data ?? []) as Row[]).filter((o) => !o.valid_until || String(o.valid_until) >= day);
  const okPromotions = ((promotions.data ?? []) as Row[]).filter((p) => {
    if (p.starts_on && String(p.starts_on) > day) return false;
    if (p.ends_on && String(p.ends_on) < day) return false;
    const a = (p.audience ?? { all: true }) as Row;
    if (a.all === true) return true;
    if (Array.isArray(a.park_ids) && a.park_ids.includes(parkId)) return true;
    if (Array.isArray(a.plans) && a.plans.includes(plan)) return true;
    return false;
  });
  return { overrides: okOverrides, promotions: okPromotions, plan };
}

export function applyDeals(packages: Row[], overrides: Row[], promotions: Row[]): Row[] {
  return packages.map((pkg) => {
    const hasPrice = typeof pkg.price_cents === 'number' && pkg.price_cents > 0;
    const override = overrides.find((o) => o.package_key === pkg.key);
    const promos = promotions
      .filter((p) => !p.package_keys?.length || p.package_keys.includes(pkg.key))
      .sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0) || (b.free_months ?? 0) - (a.free_months ?? 0));
    const promo = promos[0];

    let percent: number | null = null;
    let fixed: number | null = null;
    let extra = 0;
    let source: Deal['source'] | null = null;
    let name: string | null = null;
    let promotionId: string | null = null;
    let validUntil: string | null = null;

    if (override && hasPrice) {
      source = 'override';
      percent = override.discount_percent ?? null;
      fixed = override.fixed_price_cents ?? null;
      extra = override.extra_free_months ?? 0;
      validUntil = override.valid_until ?? null;
    } else if (promo && hasPrice) {
      source = 'promotion';
      percent = promo.discount_percent ?? null;
      extra = pkg.term_months ? promo.free_months ?? 0 : 0;
      name = promo.name;
      promotionId = promo.id;
      validUntil = promo.ends_on ?? null;
    }
    if (!source || (percent === null && fixed === null && extra === 0)) return { ...pkg, deal: null };

    const next: Row = { ...pkg, meta: { ...(pkg.meta ?? {}) } };
    if (fixed !== null) {
      next.price_cents = fixed;
    } else if (percent !== null) {
      next.price_cents = scale(pkg.price_cents, percent);
      if (pkg.setup_cents != null) next.setup_cents = scale(pkg.setup_cents, percent);
      if (pkg.meta?.year2_cents != null) next.meta.year2_cents = scale(pkg.meta.year2_cents, percent);
      if (pkg.meta?.display_cents != null) next.meta.display_cents = scale(pkg.meta.display_cents, percent);
    }
    next.free_months = (pkg.free_months ?? 0) + extra;
    next.deal = {
      source, name, promotion_id: promotionId, percent, fixed: fixed !== null, extra_free_months: extra,
      valid_until: validUntil, list_price_cents: pkg.price_cents, list_free_months: pkg.free_months ?? 0,
    } satisfies Deal;
    return next;
  });
}
