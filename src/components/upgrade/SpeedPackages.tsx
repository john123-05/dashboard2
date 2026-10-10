import { useState } from 'react';
import { usePark } from '../../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../../lib/equipment';
import { Check } from 'lucide-react';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import PlanCard, { PlanAction, PriceFigure } from './PlanCard';

type PlanKey = 'basis' | 'display' | 'long' | 'software';

const eur = (value: number, locale: string) =>
  value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// Für Parks, die die Messhardware schon haben: nur die Software (Profile, Bestenliste, Bearbeiten, Auswerten).
export const SOFTWARE_MONTHLY = 49;
export const SOFTWARE_MONTHS = 12;
export const SOFTWARE_POINTS = [
  'speed.offer.setup', 'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.daily_stats',
  'speed.offer.ranking', 'speed.offer.guest_page', 'speed.offer.benefit_edit', 'speed.offer.benefit_analyse',
  'speed.offer.hosting', 'speed.offer.database', 'speed.offer.maintenance',
];

export const INCLUDED = [
  'speed.offer.hardware', 'speed.offer.free_hardware', 'speed.offer.setup',
  'speed.offer.daily_stats', 'speed.offer.ranking', 'speed.offer.guest_page',
  'speed.offer.photo_speed', 'speed.offer.photo_code', 'speed.offer.hosting',
  'speed.offer.database', 'speed.offer.maintenance',
];

export const PLANS: {
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
    image: '/speedmessung/langzeit.jpg?v=4',
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
    image: '/speedmessung/display.jpg?v=3',
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
    image: '/speedmessung/langzeit.jpg?v=4',
    extras: ['speed.offer.long_price', 'speed.offer.long_fixed', 'speed.offer.term_48'],
  },
];

// Die drei Speedmessung-Pakete (Karten mit allem, was enthalten ist). Wird in der gesperrten
// Speedmessung-Seite und in „Preise & Pakete“ verwendet.
export default function SpeedPackages() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(planKey: PlanKey) {
    const plan = PLANS.find((p) => p.key === planKey);
    if (!parkId || (!plan && planKey !== 'software')) return;
    setBusy(planKey);
    setError(null);
    try {
      if (!plan) {
        await meldeAusstattungsInteresse(parkId, {
          label: `Speedmessung nur Software (Hardware vorhanden): ${SOFTWARE_MONTHS} Monate, ${SOFTWARE_MONTHLY} €/Monat`,
        });
        setRequested((prev) => [...prev, planKey]);
        return;
      }
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
    <>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-4 pt-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.key}
            compact
            highlight={plan.highlight}
            image={plan.image}
            badge={plan.badge ? t(plan.badge) : undefined}
            badgeTone={plan.highlight ? 'brand' : 'positive'}
            name={t(plan.name)}
            price={<PriceFigure compact value={eur(plan.monthly, locale)} suffix={t('crm_pricing.per_month')} />}
            priceNote={
              <>
                {t('speed.offer.term', { months: plan.months })} · {plan.fromYear2 ? t('speed.offer.year2', { amount: eur(plan.fromYear2, locale) }) : t('speed.offer.hardware_zero')} · {t('speed.offer.excl_vat')}
              </>
            }
            includedLabel={t('crm_pricing.included')}
            points={[...INCLUDED, ...plan.extras].map((p) => t(p))}
            action={
              <PlanAction
                compact
                highlight={plan.highlight}
                done={requested.includes(plan.key)}
                doneLabel={t('speed.offer.requested')}
                busy={busy === plan.key}
                disabled={busy !== null}
                label={t('crm_pricing.activate')}
                busyLabel={t('crm_pricing.sending')}
                onClick={() => void request(plan.key)}
              />
            }
          />
        ))}
      </div>
      <div className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {t('speed.offer.sw_badge')}
            </span>
            <h4 className="mt-3 text-lg font-semibold text-[color:var(--ink)]">{t('speed.offer.sw_title')}</h4>
            <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('speed.offer.sw_text')}</p>
            <div className="mt-4">
              <PriceFigure compact value={eur(SOFTWARE_MONTHLY, locale)} suffix={t('crm_pricing.per_month')} />
              <p className="mt-1 text-xs text-[color:var(--ink-3)]">
                {t('speed.offer.term', { months: SOFTWARE_MONTHS })} · {t('speed.offer.sw_hardware_note')} · {t('speed.offer.excl_vat')}
              </p>
            </div>
            <div className="mt-4 max-w-xs">
              <PlanAction
                compact
                done={requested.includes('software')}
                doneLabel={t('speed.offer.requested')}
                busy={busy === 'software'}
                disabled={busy !== null}
                label={t('crm_pricing.activate')}
                busyLabel={t('crm_pricing.sending')}
                onClick={() => void request('software')}
              />
            </div>
          </div>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {SOFTWARE_POINTS.map((key) => (
              <li key={key} className="flex gap-2 text-sm text-[color:var(--ink-2)]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-center text-xs text-[color:var(--ink-3)]">
        {t('speed.offer.afterword')}
      </p>
    </>
  );
}
