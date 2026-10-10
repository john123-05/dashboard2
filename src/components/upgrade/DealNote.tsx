import { useI18n, useLocaleTag } from '../../lib/i18n';
import type { CatalogPackage } from '../../lib/catalog';

// Hinweis auf der Karte, wenn der Park einen Kundenpreis oder eine Aktion hat (docs/AUSBAU_PLAN.md, PK4/PK5):
// Abzeichen („Dein Preis“ / Name der Aktion), Listenpreis durchgestrichen, geschenkte Monate, Gültigkeit.
// Die Preise der Karte sind serverseitig schon angepasst.
export default function DealNote({ pkg }: { pkg: CatalogPackage | undefined }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const deal = pkg?.deal;
  if (!pkg || !deal) return null;
  const money = (cents: number) => (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  const changed = deal.list_price_cents != null && pkg.price_cents != null && deal.list_price_cents !== pkg.price_cents;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
        {deal.source === 'override' ? t('deal.your_price') : (deal.name ?? t('deal.promo_default'))}
      </span>
      {changed && (
        <span className="text-[color:var(--ink-3)] line-through">
          {t('deal.instead_of', { price: `${money(deal.list_price_cents!)} ${t('crm_pricing.per_month')}` })}
        </span>
      )}
      {deal.extra_free_months > 0 && <span className="font-medium text-emerald-700">{t('deal.extra_months', { months: deal.extra_free_months })}</span>}
      {deal.valid_until && (
        <span className="text-[color:var(--ink-3)]">{t('deal.until', { date: new Date(`${deal.valid_until}T00:00:00`).toLocaleDateString(locale) })}</span>
      )}
    </div>
  );
}
