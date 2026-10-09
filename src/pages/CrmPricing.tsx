import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { useI18n, useLocaleTag } from '../lib/i18n';

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
      <div>
        <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          {t('crm_pricing.back')}
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{t('crm_pricing.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('crm_pricing.subtitle')}
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const hl = plan.highlight;
          const paid = plan.months - plan.freeMonths;
          const total = paid * MONTHLY_PRICE;
          const full = plan.months * MONTHLY_PRICE;
          const done = requested.includes(plan.key);
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ${
                hl ? 'shadow-xl ring-2 ring-amber-400 lg:-translate-y-4' : 'ring-slate-200'
              }`}
            >
              <span
                className={`mb-2 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  hl ? 'bg-amber-400 text-slate-900' : plan.freeMonths ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t(plan.badgeKey)}
              </span>
              <h3 className="text-base font-bold text-slate-800">{t(plan.nameKey)}</h3>
              <div className="mt-4 flex flex-wrap items-end gap-x-2">
                <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(total, locale)}</span>
                {plan.freeMonths > 0 && <span className="pb-0.5 text-sm text-slate-400 line-through">{eur(full, locale)}</span>}
                <span className="pb-0.5 text-xs text-slate-500">{plan.months === 1 ? t('crm_pricing.per_month') : t('crm_pricing.for_months', { months: plan.months })}</span>
              </div>
              <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
                {plan.freeMonths > 0 ? (
                  <>
                    <span className="font-semibold text-emerald-700">{t('crm_pricing.saving', { amount: eur(full - total, locale) })}</span>{' '}
                    {t('crm_pricing.compared', { amount: eur(MONTHLY_PRICE, locale) })}
                  </>
                ) : (
                  t('crm_pricing.no_advance')
                )}
              </p>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('crm_pricing.included')}</p>
              <ul className="mt-2 flex-1 space-y-2">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {t(p)}
                  </li>
                ))}
              </ul>
              {done ? (
                <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
                  <Check className="h-4 w-4" />
                  {t('crm_pricing.requested')}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void request(plan.key)}
                  className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    hl ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Send className="h-4 w-4" />
                  {busy === plan.key ? t('crm_pricing.sending') : t('crm_pricing.activate')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
