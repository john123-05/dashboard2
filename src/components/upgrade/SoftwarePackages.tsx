import { useState } from 'react';
import { usePark } from '../../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../../lib/equipment';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { bulletList, catalogGroup, catalogPackage, fillText, packageText, reportDealRequest, useCatalog } from '../../lib/catalog';
import DealNote from './DealNote';
import PlanCard, { PlanAction, PriceFigure } from './PlanCard';

// Speedmessung nur als Software, für Parks die die Messhardware schon haben.
export const SOFTWARE_MONTHLY = 49;
export const SOFTWARE_MONTHLY_DISPLAY = 99;
export const FREE_MONTHS_YEAR = 3;
export const FREE_MONTHS_TWO_YEARS = 6;

export const POINTS = [
  'speed.offer.setup', 'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.daily_stats',
  'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.benefit_edit', 'speed.offer.benefit_analyse',
  'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance',
];

type Key = 'monthly' | 'year' | 'two_years';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export default function SoftwarePackages() {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const catalog = useCatalog();
  const fromCatalog = catalogGroup(catalog, 'software').length > 0;
  const { parkId } = usePark();
  const [display, setDisplay] = useState(false);
  const [busy, setBusy] = useState<Key | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Preise und Texte kommen aus dem Katalog (CRM → Pakete & Preise); ohne Katalog gelten die eingebauten Werte.
  const builtIn: { key: Key; pkg: string; name: string; months: number; free: number; highlight?: boolean }[] = [
    { key: 'monthly', pkg: 'software_monthly', name: 'speed.offer.sw_plan_monthly', months: 12, free: 0 },
    { key: 'year', pkg: 'software_year', name: 'speed.offer.sw_plan_year', months: 12, free: FREE_MONTHS_YEAR, highlight: true },
    { key: 'two_years', pkg: 'software_two_years', name: 'speed.offer.sw_plan_two_years', months: 24, free: FREE_MONTHS_TWO_YEARS },
  ];
  const plans = builtIn
    .map((plan) => {
      const cp = catalogPackage(catalog, plan.pkg);
      const base = cp?.price_cents != null ? cp.price_cents / 100 : SOFTWARE_MONTHLY;
      const withDisplay = cp?.meta.display_cents != null ? cp.meta.display_cents / 100 : SOFTWARE_MONTHLY_DISPLAY;
      return {
        ...plan,
        cp,
        months: cp?.term_months ?? plan.months,
        free: cp ? cp.free_months : plan.free,
        highlight: cp ? cp.highlight : plan.highlight,
        monthly: display ? withDisplay : base,
        withDisplay,
        base,
      };
    })
    .filter((plan) => !fromCatalog || plan.cp)
    .sort((a, b) => (a.cp?.sort ?? 0) - (b.cp?.sort ?? 0));

  async function request(plan: (typeof plans)[number]) {
    const monthly = plan.monthly;
    if (!parkId) return;
    setBusy(plan.key);
    setError(null);
    try {
      const paid = plan.months - plan.free;
      const label = `Speedmessung nur Software (Hardware vorhanden${display ? ', mit Display' : ''}): ${plan.months} Monate Laufzeit, ${monthly} €/Monat${plan.free ? `, ${plan.free} Monate geschenkt, im Voraus ${paid * monthly} €` : ''}`;
      await meldeAusstattungsInteresse(parkId, { label: plan.cp?.deal ? `${label} (Aktion/Kundenpreis)` : label });
      void reportDealRequest(parkId, plan.cp);
      setRequested((prev) => [...prev, `${plan.key}-${display}`]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {t('speed.offer.sw_badge')}
          </span>
          <h4 className="mt-2 text-lg font-semibold text-[color:var(--ink)]">{t('speed.offer.sw_title')}</h4>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('speed.offer.sw_text')}</p>
        </div>
        <label className="flex max-w-sm cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--line)] bg-white p-3">
          <input
            type="checkbox"
            checked={display}
            onChange={(e) => setDisplay(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="block text-sm font-medium text-[color:var(--ink)]">{t('speed.offer.sw_display_label')}</span>
            <span className="mt-0.5 block text-xs text-[color:var(--ink-3)]">
              {t('speed.offer.sw_display_text', { with: eur(plans[0]?.withDisplay ?? SOFTWARE_MONTHLY_DISPLAY, locale), without: eur(plans[0]?.base ?? SOFTWARE_MONTHLY, locale) })}
            </span>
          </span>
        </label>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-4 pt-3 sm:grid-cols-3">
        {plans.map((plan) => {
          const paid = plan.months - plan.free;
          const monthly = plan.monthly;
          const total = paid * monthly;
          const full = plan.months * monthly;
          const done = requested.includes(`${plan.key}-${display}`);
          return (
            <PlanCard
              key={plan.key}
              compact
              highlight={plan.highlight}
              badge={packageText(plan.cp, 'badge', language) ? fillText(packageText(plan.cp, 'badge', language)!, { months: plan.free }) : plan.free ? t('speed.offer.sw_free_months', { months: plan.free }) : undefined}
              badgeTone={plan.highlight ? 'brand' : 'positive'}
              name={packageText(plan.cp, 'name', language) ?? t(plan.name)}
              price={
                <>
                <DealNote pkg={plan.cp} />
                {plan.free ? (
                  <PriceFigure compact value={eur(total, locale)} suffix={t('crm_pricing.for_months', { months: plan.months })} />
                ) : (
                  <PriceFigure compact value={eur(monthly, locale)} suffix={t('crm_pricing.per_month')} />
                )}
                </>
              }
              priceNote={
                plan.free ? (
                  <>
                    <span className="text-slate-400 line-through">{eur(full, locale)}</span>{' '}
                    <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: eur(full - total, locale) })}</span> ·{' '}
                    {t('speed.offer.sw_term_paid', { paid, months: plan.months })} · {t('speed.offer.excl_vat')}
                  </>
                ) : (
                  <>
                    {t('speed.offer.sw_term_monthly')} · {t('speed.offer.excl_vat')}
                  </>
                )
              }
              includedLabel={t('crm_pricing.included')}
              points={[...(bulletList(plan.cp, language, true) ?? POINTS.map((key) => t(key))), ...(display ? [t('speed.offer.display_large')] : [])]}
              excluded={display ? bulletList(plan.cp, language, false)?.filter((text) => text !== t('speed.offer.display_large')) : bulletList(plan.cp, language, false)}
              action={
                <PlanAction
                  compact
                  highlight={plan.highlight}
                  done={done}
                  doneLabel={t('speed.offer.requested')}
                  busy={busy === plan.key}
                  disabled={busy !== null}
                  label={t('crm_pricing.activate')}
                  busyLabel={t('crm_pricing.sending')}
                  onClick={() => void request(plan)}
                />
              }
            />
          );
        })}
      </div>
    </section>
  );
}
