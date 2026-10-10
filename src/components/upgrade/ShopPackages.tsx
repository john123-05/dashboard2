import { useState, type ReactNode } from 'react';
import { usePark } from '../../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../../lib/equipment';
import { requestShopActivation } from '../../lib/shop';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { bulletList, catalogGroup, catalogPackage, fillText, packageText, reportDealRequest, useCatalog } from '../../lib/catalog';
import DealNote from './DealNote';
import PlanCard, { PlanAction, PriceFigure } from './PlanCard';

type PlanKey = 'monatlich' | 'jaehrlich' | 'fullservice';

const eur = (value: number, locale: string, digits = 0) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const SETUP_PRICE = 749;
export const MONTHLY_PRICE = 99;
const FREE_MONTHS = 3;
export const YEARLY_PRICE = MONTHLY_PRICE * (12 - FREE_MONTHS);
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
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const money = (value: number) => eur(value, locale);
  const { parkId } = usePark();
  // Preise und Texte kommen aus dem Katalog (CRM → Pakete & Preise); ohne Katalog gelten die eingebauten Werte.
  const catalog = useCatalog();
  const fromCatalog = catalogGroup(catalog, 'shop').length > 0;
  const cm = catalogPackage(catalog, 'shop_monthly');
  const cy = catalogPackage(catalog, 'shop_year');
  const cf = catalogPackage(catalog, 'shop_full');
  const setupM = cm?.setup_cents != null ? cm.setup_cents / 100 : SETUP_PRICE;
  const monthlyM = cm?.price_cents != null ? cm.price_cents / 100 : MONTHLY_PRICE;
  const setupY = cy?.setup_cents != null ? cy.setup_cents / 100 : SETUP_PRICE;
  const monthlyY = cy?.price_cents != null ? cy.price_cents / 100 : MONTHLY_PRICE;
  const freeMonths = cy ? cy.free_months : FREE_MONTHS;
  const termY = cy?.term_months ?? 12;
  const yearlyPrice = monthlyY * (termY - freeMonths);
  const yearlyFull = monthlyY * termY;
  const share = cf?.meta.share_percent ?? REVENUE_SHARE_PERCENT;
  const name = (pkg: typeof cm, key: string) => packageText(pkg, 'name', language) ?? t(key);
  const note = (pkg: typeof cm) => packageText(pkg, 'tagline', language);
  const included = (pkg: typeof cm, fallback: string[]) => bulletList(pkg, language, true) ?? fallback.map((p) => t(p));
  const excluded = (pkg: typeof cm) => bulletList(pkg, language, false);
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
          ? `Shop freischalten: Einrichtung ${setupM} € einmalig + ${monthlyM} €/Monat`
          : plan === 'jaehrlich'
            ? `Shop freischalten: Einrichtung ${setupY} € einmalig + ${termY} Monate im Voraus ${yearlyPrice} € (${freeMonths} Monate geschenkt)`
            : `Shop freischalten: Full-Service, ${share} % der Shop-Einnahmen, Einrichtung und Monatskosten 0 €`;
      const cp = plan === 'monatlich' ? cm : plan === 'jaehrlich' ? cy : cf;
      await meldeAusstattungsInteresse(parkId, { label: cp?.deal ? `${label} (Aktion/Kundenpreis)` : label });
      void reportDealRequest(parkId, cp);
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
  function setupPlus(setup: number, second: ReactNode, secondNote: ReactNode) {
    return (
      <div className="flex items-start gap-2.5">
        <div>
          <PriceFigure value={money(setup)} />
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
        {(!fromCatalog || cm) && (
          <PlanCard
            badge={packageText(cm, 'badge', language) ?? t('crm_pricing.monthly')}
            name={name(cm, 'shop_pricing.monthly_name')}
            price={<><DealNote pkg={cm} />{setupPlus(setupM, money(monthlyM), t('shop_pricing.per_month'))}</>}
            priceNote={note(cm) ?? t('shop_pricing.setup_desc')}
            includedLabel={t('crm_pricing.included')}
            points={included(cm, PACKAGE_POINTS)}
            excluded={excluded(cm)}
            action={action('monatlich')}
          />
        )}

        {(!fromCatalog || cy) && (
          <PlanCard
            highlight={cy ? cy.highlight : true}
            badge={packageText(cy, 'badge', language) ? fillText(packageText(cy, 'badge', language)!, { months: freeMonths }) : t('shop_pricing.yearly_badge', { months: freeMonths })}
            badgeTone="brand"
            name={name(cy, 'shop_pricing.yearly_name')}
            price={<><DealNote pkg={cy} />{setupPlus(
              setupY,
              money(yearlyPrice),
              <>
                {t('crm_pricing.for_months', { months: termY })} <span className="text-slate-400 line-through">{money(yearlyFull)}</span>
              </>,
            )}</>}
            priceNote={
              <>
                <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: money(yearlyFull - yearlyPrice) })}</span>{' '}
                {t('crm_pricing.compared', { amount: money(monthlyY) })}
                {note(cy) && <> {note(cy)}</>}
              </>
            }
            includedLabel={t('crm_pricing.included')}
            points={included(cy, PACKAGE_POINTS)}
            excluded={excluded(cy)}
            action={action('jaehrlich', true)}
          />
        )}

        {(!fromCatalog || cf) && (
          <PlanCard
            badge={packageText(cf, 'badge', language) ?? t('shop_pricing.full_badge')}
            badgeTone="positive"
            name={name(cf, 'shop_pricing.full_name')}
            price={<PriceFigure value={`${share} %`} suffix={t('shop_pricing.share_label')} />}
            priceNote={note(cf) ?? t('shop_pricing.full_desc')}
            includedLabel={t('crm_pricing.included')}
            points={included(cf, FULL_POINTS)}
            excluded={excluded(cf)}
            action={action('fullservice')}
          />
        )}
      </div>
    </>
  );
}
