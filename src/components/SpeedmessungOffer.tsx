import { useState } from 'react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { useI18n, useLocaleTag } from '../lib/i18n';
import UpgradeHero from './upgrade/UpgradeHero';
import PlanCard, { PlanAction, PriceFigure } from './upgrade/PlanCard';

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
    image: '/speedmessung/display.jpg?v=2',
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
      <UpgradeHero
        badge={t('speed.offer.locked')}
        title={t('speed.offer.headline')}
        intro={t('speed.offer.intro')}
        points={BENEFITS.map((item) => ({ title: t(item.title), text: t(item.text) }))}
        pointColumns={2}
        note={t('speed.offer.summary')}
      />

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
      <p className="text-center text-xs text-[color:var(--ink-3)]">
        {t('speed.offer.afterword')}
      </p>
    </section>
  );
}
