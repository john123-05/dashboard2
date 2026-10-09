import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { requestShopActivation } from '../lib/shop';
import { useI18n, useLocaleTag } from '../lib/i18n';

type PlanKey = 'monatlich' | 'jaehrlich' | 'fullservice';

const eur = (value: number, locale: string, digits = 0) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

const SETUP_PRICE = 749;
const MONTHLY_PRICE = 99;
const FREE_MONTHS = 3;
const YEARLY_PRICE = MONTHLY_PRICE * (12 - FREE_MONTHS);
const YEARLY_FULL_PRICE = MONTHLY_PRICE * 12;
const YEARLY_SAVING = YEARLY_FULL_PRICE - YEARLY_PRICE;
const REVENUE_SHARE_PERCENT = 15;

const PACKAGE_POINTS = [
  'shop_pricing.point_design', 'shop_pricing.point_setup', 'shop_pricing.point_products',
  'shop_pricing.point_payments', 'shop_pricing.point_hosting',
  'shop_pricing.point_database', 'shop_pricing.point_sales',
];

const FULL_POINTS = [
  'shop_pricing.full_setup', 'shop_pricing.full_monthly', 'shop_pricing.full_hosting',
  'shop_pricing.full_shipping', 'shop_pricing.full_managed',
];

export default function ShopPricing() {
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

  function Action({ plan, dark }: { plan: PlanKey; dark?: boolean }) {
    if (requested.includes(plan)) {
      return (
        <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" />
          {t('crm_pricing.requested')}
        </div>
      );
    }
    return (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void request(plan)}
        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
          dark ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        <Send className="h-4 w-4" />
        {busy === plan ? t('crm_pricing.sending') : t('shop_pricing.activate')}
      </button>
    );
  }

  const cardBase = 'relative flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t('shop_pricing.back')}
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{t('shop_pricing.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('shop_pricing.subtitle')}</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        <div className={cardBase}>
          <span className="mb-2 w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            {t('crm_pricing.monthly')}
          </span>
          <h3 className="text-base font-bold text-slate-800">{t('shop_pricing.monthly_name')}</h3>
          <div className="mt-4 flex items-start gap-2">
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{money(SETUP_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">{t('shop_pricing.one_time')}</p>
            </div>
            <span className="flex h-9 items-center text-3xl font-bold leading-none text-slate-900">+</span>
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{money(MONTHLY_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">{t('shop_pricing.per_month')}</p>
            </div>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            {t('shop_pricing.setup_desc')}
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('crm_pricing.included')}</p>
          <ul className="mt-2 flex-1 space-y-2">
            {PACKAGE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {t(p)}
              </li>
            ))}
          </ul>
          <Action plan="monatlich" />
        </div>

        <div className={`${cardBase} shadow-xl ring-2 ring-amber-400 lg:-translate-y-4`}>
          <span className="mb-2 w-fit rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
            {t('shop_pricing.yearly_badge', { months: FREE_MONTHS })}
          </span>
          <h3 className="text-base font-bold text-slate-800">{t('shop_pricing.yearly_name')}</h3>
          <div className="mt-4 flex items-start gap-2">
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{money(SETUP_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">{t('shop_pricing.one_time')}</p>
            </div>
            <span className="flex h-9 items-center text-3xl font-bold leading-none text-slate-900">+</span>
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{money(YEARLY_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">
                {t('crm_pricing.for_months', { months: 12 })} <span className="text-slate-400 line-through">{money(YEARLY_FULL_PRICE)}</span>
              </p>
            </div>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: money(YEARLY_SAVING) })}</span>{' '}
            {t('crm_pricing.compared', { amount: money(MONTHLY_PRICE) })}
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('crm_pricing.included')}</p>
          <ul className="mt-2 flex-1 space-y-2">
            {PACKAGE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {t(p)}
              </li>
            ))}
          </ul>
          <Action plan="jaehrlich" dark />
        </div>

        <div className={cardBase}>
          <span className="mb-2 w-fit rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            {t('shop_pricing.full_badge')}
          </span>
          <h3 className="text-base font-bold text-slate-800">{t('shop_pricing.full_name')}</h3>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{REVENUE_SHARE_PERCENT} %</span>
            <span className="pb-0.5 text-xs text-slate-500">{t('shop_pricing.share_label')}</span>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            {t('shop_pricing.full_desc')}
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('crm_pricing.included')}</p>
          <ul className="mt-2 flex-1 space-y-2">
            {FULL_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {t(p)}
              </li>
            ))}
          </ul>
          <Action plan="fullservice" />
        </div>
      </div>

    </div>
  );
}
