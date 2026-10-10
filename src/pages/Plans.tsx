import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, ChevronRight } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { PLAN_LABEL_KEY, useEntitlements, type PlanKey } from '../lib/plans';
import GlassCard from '../components/ui/GlassCard';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
import PlanCard, { PlanAction, PriceFigure } from '../components/upgrade/PlanCard';

// Seite „Pläne und Preise“ (docs/PRODUKT_PLAN.md, B4). Preise von John bestätigt
// am 10.10.2026. Anfragen laufen wie bei CRM/Shop über `meldeAusstattungsInteresse`,
// bis Stripe (Aufgabe S1) die Buchung übernimmt.

const PRICE: Record<PlanKey, number> = { basis: 0, marketing_starter: 49, marketing_pro: 149 };

const CARDS: {
  plan: PlanKey;
  noteKey: string;
  points: string[];
  highlight?: boolean;
}[] = [
  {
    plan: 'basis',
    noteKey: 'plans.basis_note',
    points: ['plans.b_ops', 'plans.b_system', 'plans.b_support', 'plans.b_team'],
  },
  {
    plan: 'marketing_starter',
    noteKey: 'plans.starter_note',
    points: ['plans.s_all', 'plans.s_contacts', 'plans.s_survey', 'plans.s_pixel', 'plans.s_email', 'plans.s_team'],
  },
  {
    plan: 'marketing_pro',
    noteKey: 'plans.pro_note',
    highlight: true,
    points: ['plans.p_all', 'plans.p_social', 'plans.p_review', 'plans.p_email', 'plans.p_reports', 'plans.p_team'],
  },
];

type Cell = boolean | string;
// `soon`: Funktion ist im Plan vorgesehen, aber noch in Arbeit (ehrlich kennzeichnen).
const ROWS: { labelKey: string; cells: [Cell, Cell, Cell]; soon?: boolean }[] = [
  { labelKey: 'plans.row_operations', cells: [true, true, true] },
  { labelKey: 'plans.row_team', cells: ['3', '10', 'plans.unlimited'] },
  { labelKey: 'plans.row_contacts', cells: [false, true, true] },
  { labelKey: 'plans.row_survey', cells: [false, true, true] },
  { labelKey: 'plans.row_pixel', cells: [false, true, true] },
  { labelKey: 'plans.row_email', cells: [false, '2.000', '10.000'], soon: true },
  { labelKey: 'plans.row_social', cells: [false, 'plans.cell_share_unlock', 'plans.cell_campaigns'], soon: true },
  { labelKey: 'plans.row_review', cells: [false, false, true] },
  { labelKey: 'plans.row_reports', cells: [false, false, true], soon: true },
  { labelKey: 'plans.row_rights', cells: [false, false, true], soon: true },
];

const ADDONS = [
  { to: '/shop/preise', titleKey: 'nav.shop', textKey: 'plans.addon_shop' },
  { to: '/users', titleKey: 'nav.speed', textKey: 'plans.addon_speed' },
  { to: '/configuration', titleKey: 'nav.configuration', textKey: 'plans.addon_hardware' },
];

export default function Plans() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const { plan: currentPlan } = useEntitlements();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  const money = (value: number) =>
    value.toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  async function request(plan: PlanKey) {
    if (!parkId) return;
    setBusy(plan);
    setError(null);
    try {
      const name = plan === 'marketing_pro' ? 'Marketing Pro' : 'Marketing Starter';
      await meldeAusstattungsInteresse(parkId, { label: `Plan anfragen: ${name} (${PRICE[plan]} €/Monat)` });
      setRequested((prev) => [...prev, plan]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  const showCell = (cell: Cell) => {
    if (cell === true) return <Check className="mx-auto h-4 w-4 text-brand-600" aria-label="✓" />;
    if (cell === false) return <Minus className="mx-auto h-4 w-4 text-slate-300" aria-label="–" />;
    return <span className="text-sm text-[color:var(--ink)]">{cell.startsWith('plans.') ? t(cell) : cell}</span>;
  };

  return (
    <div className="space-y-8">
      <UpgradePageHeader title={t('plans.page_title')} subtitle={t('plans.page_subtitle')} />

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        {CARDS.map((card) => {
          const isCurrent = currentPlan === card.plan;
          // Niedrigere Pläne als der aktuelle werden nicht mehr zum Anfragen angeboten.
          const lower = ['basis', 'marketing_starter', 'marketing_pro'].indexOf(card.plan) <
            ['basis', 'marketing_starter', 'marketing_pro'].indexOf(currentPlan);
          return (
            <PlanCard
              key={card.plan}
              highlight={card.highlight}
              badge={card.highlight ? t('plans.badge_popular') : undefined}
              badgeTone="brand"
              name={t(PLAN_LABEL_KEY[card.plan])}
              price={
                <PriceFigure
                  value={money(PRICE[card.plan])}
                  suffix={card.plan === 'basis' ? undefined : t('crm_pricing.per_month')}
                />
              }
              priceNote={t(card.noteKey)}
              includedLabel={t('crm_pricing.included')}
              points={card.points.map((key) => t(key))}
              action={
                card.plan === 'basis' || lower ? (
                  <div className="mt-5 min-h-[2.5rem]" />
                ) : (
                  <PlanAction
                    highlight={card.highlight}
                    done={isCurrent || requested.includes(card.plan)}
                    doneLabel={isCurrent ? t('plans.current') : t('crm_pricing.requested')}
                    busy={busy === card.plan}
                    disabled={busy !== null}
                    label={t('plans.request')}
                    busyLabel={t('crm_pricing.sending')}
                    onClick={() => void request(card.plan)}
                  />
                )
              }
            />
          );
        })}
      </div>
      <p className="-mt-4 text-center text-xs text-[color:var(--ink-3)]">{t('plans.request_note')}</p>

      <GlassCard className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-4">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('plans.compare_title')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-[color:var(--line)] text-xs text-[color:var(--ink-3)]">
                <th className="px-5 py-3 font-medium" />
                {CARDS.map((card) => (
                  <th key={card.plan} className={`w-32 px-3 py-3 text-center font-semibold ${card.highlight ? 'text-brand-700' : 'text-[color:var(--ink-2)]'}`}>
                    {t(PLAN_LABEL_KEY[card.plan])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {ROWS.map((row) => (
                <tr key={row.labelKey}>
                  <td className="px-5 py-3 text-sm text-[color:var(--ink-2)]">
                    {t(row.labelKey)}
                    {row.soon && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        {t('plans.soon')}
                      </span>
                    )}
                  </td>
                  {row.cells.map((cell, index) => (
                    <td key={index} className="px-3 py-3 text-center">
                      {showCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <section>
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('plans.addons_title')}</h3>
        <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('plans.addons_sub')}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ADDONS.map((addon) => (
            <Link
              key={addon.to}
              to={addon.to}
              className="group flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-white p-4 transition hover:border-brand-300"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[color:var(--ink)]">{t(addon.titleKey)}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--ink-3)]">{t(addon.textKey)}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition group-hover:text-brand-600" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
