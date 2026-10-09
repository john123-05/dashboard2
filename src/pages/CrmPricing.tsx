import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
import PlanCard, { PlanAction, PriceFigure } from '../components/upgrade/PlanCard';

type PlanKey = 'monatlich' | 'jaehrlich' | 'langzeit';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const MONTHLY_PRICE = 49;

const PLANS: {
  key: PlanKey;
  badgeKey: string;
  nameKey: string;
  months: number;
  freeMonths: number;
  highlight?: boolean;
}[] = [
  { key: 'monatlich', badgeKey: 'crm_pricing.monthly', nameKey: 'crm_pricing.flexible', months: 1, freeMonths: 0 },
  { key: 'jaehrlich', badgeKey: 'crm_pricing.yearly_badge', nameKey: 'crm_pricing.yearly_name', months: 12, freeMonths: 3, highlight: true },
  { key: 'langzeit', badgeKey: 'crm_pricing.long_badge', nameKey: 'crm_pricing.long_name', months: 48, freeMonths: 6 },
];

const POINTS = [
  'crm_pricing.point_qr', 'crm_pricing.point_hosting', 'crm_pricing.point_digital',
  'crm_pricing.point_contacts', 'crm_pricing.point_unlock', 'crm_pricing.point_social',
  'crm_pricing.point_pixel', 'crm_pricing.point_data', 'crm_pricing.point_maintenance',
];

export default function CrmPricing() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(planKey: PlanKey) {
    const plan = PLANS.find((p) => p.key === planKey);
    if (!parkId || !plan) return;
    setBusy(planKey);
    setError(null);
    try {
      const paid = plan.months - plan.freeMonths;
      const label =
        plan.months === 1
          ? `CRM freischalten: ${MONTHLY_PRICE} €/Monat`
          : `CRM freischalten: ${plan.months} Monate im Voraus ${paid * MONTHLY_PRICE} € (${plan.freeMonths} Monate geschenkt)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequested((prev) => [...prev, planKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <UpgradePageHeader
        back={
          <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
            <ArrowLeft className="h-4 w-4" />
            {t('crm_pricing.back')}
          </Link>
        }
        title={t('crm_pricing.title')}
        subtitle={t('crm_pricing.subtitle')}
      />

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const paid = plan.months - plan.freeMonths;
          const total = paid * MONTHLY_PRICE;
          const full = plan.months * MONTHLY_PRICE;
          return (
            <PlanCard
              key={plan.key}
              highlight={plan.highlight}
              badge={t(plan.badgeKey)}
              badgeTone={plan.highlight ? 'brand' : plan.freeMonths ? 'positive' : 'neutral'}
              name={t(plan.nameKey)}
              price={
                <div className="flex flex-wrap items-end gap-x-2">
                  <PriceFigure value={eur(total, locale)} />
                  {plan.freeMonths > 0 && <span className="pb-0.5 text-sm text-slate-400 line-through">{eur(full, locale)}</span>}
                  <span className="pb-0.5 text-xs text-[color:var(--ink-3)]">
                    {plan.months === 1 ? t('crm_pricing.per_month') : t('crm_pricing.for_months', { months: plan.months })}
                  </span>
                </div>
              }
              priceNote={
                plan.freeMonths > 0 ? (
                  <>
                    <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: eur(full - total, locale) })}</span>{' '}
                    {t('crm_pricing.compared', { amount: eur(MONTHLY_PRICE, locale) })}
                  </>
                ) : (
                  t('crm_pricing.no_advance')
                )
              }
              includedLabel={t('crm_pricing.included')}
              points={POINTS.map((p) => t(p))}
              action={
                <PlanAction
                  highlight={plan.highlight}
                  done={requested.includes(plan.key)}
                  doneLabel={t('crm_pricing.requested')}
                  busy={busy === plan.key}
                  disabled={busy !== null}
                  label={t('crm_pricing.activate')}
                  busyLabel={t('crm_pricing.sending')}
                  onClick={() => void request(plan.key)}
                />
              }
            />
          );
        })}
      </div>
    </div>
  );
}
