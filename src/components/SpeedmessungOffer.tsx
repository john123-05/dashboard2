import { useState } from 'react';
import { Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { useI18n, useLocaleTag } from '../lib/i18n';

type PlanKey = 'basis' | 'display' | 'long';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const INCLUDED = [
  'speed.offer.hardware', 'speed.offer.free_hardware', 'speed.offer.setup',
  'speed.offer.daily_stats', 'speed.offer.ranking', 'speed.offer.guest_page',
  'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.hosting',
  'speed.offer.database', 'speed.offer.maintenance',
];

const BENEFITS = [
  { title: 'speed.offer.benefit_profile', text: 'speed.offer.benefit_profile_text' },
  { title: 'speed.offer.benefit_record', text: 'speed.offer.benefit_record_text' },
  { title: 'speed.offer.benefit_periods', text: 'speed.offer.benefit_periods_text' },
  { title: 'speed.offer.benefit_social', text: 'speed.offer.benefit_social_text' },
  { title: 'speed.offer.benefit_purchased', text: 'speed.offer.benefit_purchased_text' },
];

const PLANS: {
  key: PlanKey;
  name: string;
  monthly: number;
  months: number;
  fromYear2?: number;
  highlight?: boolean;
  badge?: string;
  image?: string;
  extras: string[];
}[] = [
  {
    key: 'basis',
    name: 'speed.offer.plan_basic',
    monthly: 149,
    months: 12,
    image: '/speedmessung/langzeit.jpg',
    extras: ['speed.offer.term_12'],
  },
  {
    key: 'display',
    name: 'speed.offer.plan_display',
    monthly: 249,
    months: 12,
    fromYear2: 149,
    highlight: true,
    badge: 'speed.offer.popular',
    image: '/speedmessung/display.jpg',
    extras: [
      'speed.offer.display_large', 'speed.offer.display_free',
      'speed.offer.display_year2', 'speed.offer.term_12',
    ],
  },
  {
    key: 'long',
    name: 'speed.offer.plan_long',
    monthly: 99,
    months: 48,
    badge: 'speed.offer.value',
    image: '/speedmessung/langzeit.jpg',
    extras: ['speed.offer.long_price', 'speed.offer.long_fixed', 'speed.offer.term_48'],
  },
];

export default function SpeedmessungOffer() {
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
      const internalName = plan.key === 'basis' ? 'Speedmessung' : plan.key === 'display' ? 'Speedmessung + Display' : 'Speedmessung 48 Monate';
      const label = `Speedmessung nachrüsten: ${internalName} (${plan.months} Monate, ${plan.monthly} €/Monat${plan.fromYear2 ? `, ab Jahr 2 ${plan.fromYear2} €/Monat` : ''}, Hardware kostenlos)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequested((prev) => [...prev, planKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {t('speed.offer.locked')}
        </span>
        <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900">{t('speed.offer.headline')}</h3>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
          {t('speed.offer.intro')}
        </p>
        <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          {BENEFITS.map((item) => (
            <li key={item.title} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                <span className="block text-[13px] font-semibold leading-snug text-slate-800">{t(item.title)}</span>
                <span className="block text-xs leading-snug text-slate-500">{t(item.text)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          {t('speed.offer.summary')}
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-4 pt-5 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const done = requested.includes(plan.key);
          const hl = plan.highlight;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${
                hl ? 'shadow-xl ring-2 ring-amber-400 sm:-translate-y-4' : 'ring-slate-200'
              }`}
            >
              {plan.image && (
                <div className="relative h-44 w-full shrink-0 overflow-hidden bg-slate-100">
                  <img src={plan.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 h-6">
                  {plan.badge && (
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        hl ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {t(plan.badge)}
                    </span>
                  )}
                </div>
                <h4 className="min-h-[2.5rem] text-sm font-bold leading-snug text-slate-800">{t(plan.name)}</h4>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-black leading-none tracking-tight text-slate-900">{eur(plan.monthly, locale)}</span>
                  <span className="pb-0.5 text-xs text-slate-500">{t('crm_pricing.per_month')}</span>
                </div>
                <p className="mt-1.5 min-h-[2.25rem] text-[11px] leading-snug text-slate-500">
                  {t('speed.offer.term', { months: plan.months })} · {plan.fromYear2 ? t('speed.offer.year2', { amount: eur(plan.fromYear2, locale) }) : t('speed.offer.hardware_zero')} · {t('speed.offer.excl_vat')}
                </p>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('crm_pricing.included')}</p>
                <ul className="mt-2 flex-1 space-y-1.5">
                  {[...INCLUDED, ...plan.extras].map((p) => (
                    <li key={p} className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                      {t(p)}
                    </li>
                  ))}
                </ul>
                {done ? (
                  <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700">
                    <Check className="h-3.5 w-3.5" />
                    {t('speed.offer.requested')}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void request(plan.key)}
                    className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                      hl ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {busy === plan.key ? t('crm_pricing.sending') : t('crm_pricing.activate')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        {t('speed.offer.afterword')}
      </p>
    </section>
  );
}
