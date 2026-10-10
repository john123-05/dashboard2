import { useState, type ReactNode } from 'react';
import { usePark } from '../../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../../lib/equipment';
import { requestShopActivation } from '../../lib/shop';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import PlanCard, { PlanAction, PriceFigure } from './PlanCard';

type PlanKey = 'monatlich' | 'jaehrlich' | 'fullservice';

const eur = (value: number, locale: string, digits = 0) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const SETUP_PRICE = 749;
export const MONTHLY_PRICE = 99;
const FREE_MONTHS = 3;
export const YEARLY_PRICE = MONTHLY_PRICE * (12 - FREE_MONTHS);
const YEARLY_FULL_PRICE = MONTHLY_PRICE * 12;
const YEARLY_SAVING = YEARLY_FULL_PRICE - YEARLY_PRICE;
export const REVENUE_SHARE_PERCENT = 15;

const PACKAGE_POINTS = [
  'shop_pricing.point_design', 'shop_pricing.point_setup', 'shop_pricing.point_products',
  'shop_pricing.point_payments', 'shop_pricing.point_hosting',
  'shop_pricing.point_database', 'shop_pricing.point_sales',
];

const FULL_POINTS = [
  'shop_pricing.full_setup', 'shop_pricing.full_monthly', 'shop_pricing.full_hosting',
  'shop_pricing.full_shipping', 'shop_pricing.full_managed',
];

// Die drei Wege zum Online-Shop (Karten mit allem, was enthalten ist). Wird auf der Seite
// „Online-Shop freischalten“ und in „Preise & Pakete“ verwendet.
export default function ShopPackages() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const money = (value: number) => eur(value, locale);
  const { parkId } = usePark();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(plan: PlanKey) {
    if (!parkId) return;
    setBusy(plan);
    setError(null);
    try {
      const label =
        plan === 'monatlich'
          ? `Shop freischalten: Einrichtung ${SETUP_PRICE} € einmalig + ${MONTHLY_PRICE} €/Monat`
          : plan === 'jaehrlich'
            ? `Shop freischalten: Einrichtung ${SETUP_PRICE} € einmalig + 12 Monate im Voraus ${YEARLY_PRICE} € (${FREE_MONTHS} Monate geschenkt)`
            : `Shop freischalten: Full-Service, ${REVENUE_SHARE_PERCENT} % der Shop-Einnahmen, Einrichtung und Monatskosten 0 €`;
      await meldeAusstattungsInteresse(parkId, { label });
      await requestShopActivation(parkId).catch(() => undefined);
      setRequested((prev) => [...prev, plan]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  function action(plan: PlanKey, highlight?: boolean) {
    return (
      <PlanAction
        highlight={highlight}
        done={requested.includes(plan)}
        doneLabel={t('crm_pricing.requested')}
        busy={busy === plan}
        disabled={busy !== null}
        label={t('shop_pricing.activate')}
        busyLabel={t('crm_pricing.sending')}
        onClick={() => void request(plan)}
      />
    );
  }

  // Setup fee and monthly/yearly amount side by side, same size, with a "+" between.
  function setupPlus(second: ReactNode, secondNote: ReactNode) {
    return (
      <div className="flex items-start gap-2.5">
        <div>
          <PriceFigure value={money(SETUP_PRICE)} />
          <p className="mt-1 text-xs text-[color:var(--ink-3)]">{t('shop_pricing.one_time')}</p>
        </div>
        <span className="flex h-[34px] items-center text-2xl font-semibold leading-none text-[color:var(--ink)]">+</span>
        <div>
          <PriceFigure value={second} />
          <p className="mt-1 text-xs text-[color:var(--ink-3)]">{secondNote}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        <PlanCard
          badge={t('crm_pricing.monthly')}
          name={t('shop_pricing.monthly_name')}
          price={setupPlus(money(MONTHLY_PRICE), t('shop_pricing.per_month'))}
          priceNote={t('shop_pricing.setup_desc')}
          includedLabel={t('crm_pricing.included')}
          points={PACKAGE_POINTS.map((p) => t(p))}
          action={action('monatlich')}
        />

        <PlanCard
          highlight
          badge={t('shop_pricing.yearly_badge', { months: FREE_MONTHS })}
          badgeTone="brand"
          name={t('shop_pricing.yearly_name')}
          price={setupPlus(
            money(YEARLY_PRICE),
            <>
              {t('crm_pricing.for_months', { months: 12 })} <span className="text-slate-400 line-through">{money(YEARLY_FULL_PRICE)}</span>
            </>,
          )}
          priceNote={
            <>
              <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: money(YEARLY_SAVING) })}</span>{' '}
              {t('crm_pricing.compared', { amount: money(MONTHLY_PRICE) })}
            </>
          }
          includedLabel={t('crm_pricing.included')}
          points={PACKAGE_POINTS.map((p) => t(p))}
          action={action('jaehrlich', true)}
        />

        <PlanCard
          badge={t('shop_pricing.full_badge')}
          badgeTone="positive"
          name={t('shop_pricing.full_name')}
          price={<PriceFigure value={`${REVENUE_SHARE_PERCENT} %`} suffix={t('shop_pricing.share_label')} />}
          priceNote={t('shop_pricing.full_desc')}
          includedLabel={t('crm_pricing.included')}
          points={FULL_POINTS.map((p) => t(p))}
          action={action('fullservice')}
        />
      </div>
    </>
  );
}
