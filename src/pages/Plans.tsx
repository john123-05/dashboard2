import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Gauge, Mail, Package, ShoppingBag, type LucideIcon } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { BillingDisabledError, openBillingPortal, startCheckout } from '../lib/billing';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { bulletList, catalogCompare, catalogGroup, catalogPackage, packageText, useCatalog } from '../lib/catalog';
import { PLAN_LABEL_KEY, useEntitlements, type PlanKey } from '../lib/plans';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
import PlanCard, { PlanAction, PriceFigure } from '../components/upgrade/PlanCard';
import CompareTable, { type CompareRow } from '../components/upgrade/CompareTable';
import { hasGuestActivity } from '../components/GuestActivityAwareOverlay';
import { ShopCompare, SoftwareCompare, SpeedCompare } from '../components/upgrade/PackageCompare';
import ShopPackages from '../components/upgrade/ShopPackages';
import SpeedPackages from '../components/upgrade/SpeedPackages';

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

// `soon`: Funktion ist im Plan vorgesehen, aber noch in Arbeit (ehrlich kennzeichnen).
const ROWS: CompareRow[] = [
  { labelKey: 'plans.row_operations', cells: [true, true, true] },
  { labelKey: 'plans.row_team', cells: ['3', '10', 'plans.unlimited'] },
  { labelKey: 'plans.row_contacts', cells: [false, true, true] },
  { labelKey: 'plans.row_survey', cells: [false, true, true] },
  { labelKey: 'plans.row_pixel', cells: [false, true, true] },
  { labelKey: 'plans.row_email', cells: [false, '2.000', '10.000'] },
  { labelKey: 'pp.row_segments', cells: [false, true, true] },
  { labelKey: 'pp.row_automations', cells: [false, false, true] },
  { labelKey: 'plans.row_social', cells: [false, 'plans.cell_share_unlock', 'plans.cell_campaigns'] },
  { labelKey: 'plans.row_review', cells: [false, false, true] },
  { labelKey: 'plans.row_reports', cells: [false, false, true], soon: true },
  { labelKey: 'plans.row_rights', cells: [false, false, true] },
  { labelKey: 'pp.row_guides', cells: [true, true, true] },
  { labelKey: 'pp.row_addon_shop', cells: ['pp.cell_addon', 'pp.cell_addon', 'pp.cell_addon'] },
  { labelKey: 'pp.row_addon_speed', cells: ['pp.cell_addon', 'pp.cell_addon', 'pp.cell_addon'] },
];

type Filter = 'all' | 'marketing' | 'shop' | 'speed' | 'system';
const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'pp.filter_all' },
  { key: 'marketing', labelKey: 'pp.filter_marketing' },
  { key: 'shop', labelKey: 'pp.filter_shop' },
  { key: 'speed', labelKey: 'pp.filter_speed' },
  { key: 'system', labelKey: 'pp.filter_system' },
];

// Zusätzlich buchbare Erweiterungen (unabhängig vom Plan). `feature`: zeigt „Aktiv“, wenn gebucht.
const ADDONS: {
  key: string;
  group: Exclude<Filter, 'all'>;
  icon: LucideIcon;
  titleKey: string;
  textKey: string;
  priceKey: string;
  to?: string;
  linkKey?: string;
  feature?: 'online_shop' | 'speed';
}[] = [
  { key: 'shop', group: 'shop', icon: ShoppingBag, titleKey: 'pp.addon_shop_title', textKey: 'pp.addon_shop_text', priceKey: 'pp.addon_shop_price', to: '/shop/preise', linkKey: 'pp.details', feature: 'online_shop' },
  { key: 'speed', group: 'speed', icon: Gauge, titleKey: 'pp.addon_speed_title', textKey: 'pp.addon_speed_text', priceKey: 'pp.addon_speed_price', to: '/users', linkKey: 'pp.details', feature: 'speed' },
  { key: 'mail', group: 'marketing', icon: Mail, titleKey: 'pp.addon_mail_title', textKey: 'pp.addon_mail_text', priceKey: 'pp.addon_mail_price' },
  { key: 'hardware', group: 'system', icon: Package, titleKey: 'pp.addon_hw_title', textKey: 'pp.addon_hw_text', priceKey: 'pp.price_on_request', to: '/configuration', linkKey: 'pp.open_page' },
];

export default function Plans() {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  // Preise und Texte kommen aus dem Katalog (CRM → Pakete & Preise); ohne Katalog gelten die eingebauten Werte.
  const catalog = useCatalog();
  const plansFromCatalog = catalogGroup(catalog, 'plan').length > 0;
  const price = (plan: PlanKey) => {
    const cents = catalogPackage(catalog, plan)?.price_cents;
    return cents != null ? cents / 100 : PRICE[plan];
  };
  const { plan: currentPlan, has } = useEntitlements();
  const [filter, setFilter] = useState<Filter>(() => {
    const wanted = new URLSearchParams(window.location.search).get('gruppe');
    return FILTERS.some((item) => item.key === wanted) ? (wanted as Filter) : 'all';
  });
  const [mailRequested, setMailRequested] = useState(false);
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
      // Mit eingerichteter Stripe-Abrechnung geht es direkt zur Buchung; sonst wie bisher als Anfrage.
      if (plan !== 'basis') {
        try {
          window.location.assign(await startCheckout(parkId, plan));
          return;
        } catch (billingError) {
          if (!(billingError instanceof BillingDisabledError)) throw billingError;
        }
      }
      const name = plan === 'marketing_pro' ? 'Marketing Pro' : 'Marketing Starter';
      await meldeAusstattungsInteresse(parkId, { label: `Plan anfragen: ${name} (${price(plan)} €/Monat)` });
      setRequested((prev) => [...prev, plan]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  const billingResult = new URLSearchParams(window.location.search).get('billing');

  async function manageBilling() {
    if (!parkId) return;
    setError(null);
    try {
      window.location.assign(await openBillingPortal(parkId));
    } catch (e) {
      setError(e instanceof BillingDisabledError ? t('plans.request_note') : e instanceof Error ? e.message : String(e));
    }
  }

  // Parks mit laufender Speedmessung (Hardware vorhanden) sehen nur die Software-Pakete.
  const hasHardware = hasGuestActivity(parkId);
  const showPlans = filter === 'all' || filter === 'marketing';
  // Shop und Speedmessung zeigen unter ihrem Reiter die ganzen Pakete, nicht nur die Kurzkarte.
  const addonsFromCatalog = catalogGroup(catalog, 'addon').length > 0;
  const addons = ADDONS.filter((addon) =>
    filter === 'all' ? true : addon.group === filter && addon.group !== 'shop' && addon.group !== 'speed',
  )
    .filter((addon) => !addonsFromCatalog || catalogPackage(catalog, `addon_${addon.key}`))
    .sort((a, b) => (catalogPackage(catalog, `addon_${a.key}`)?.sort ?? 0) - (catalogPackage(catalog, `addon_${b.key}`)?.sort ?? 0));
  const goToGroup = (group: Filter) => {
    setFilter(group);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function requestExtraMails() {
    if (!parkId) return;
    setError(null);
    try {
      await meldeAusstattungsInteresse(parkId, { label: 'Zusatz-E-Mails anfragen (E-Mail-Marketing)' });
      setMailRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    }
  }

  return (
    <div className="space-y-8">
      <UpgradePageHeader title={t('pp.title')} subtitle={t('pp.subtitle')} />

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {billingResult === 'success' && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t('plans.billing_success')}</p>}
      {billingResult === 'cancel' && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{t('plans.billing_cancel')}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-[color:var(--line-strong)] p-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              aria-pressed={filter === item.key}
              className={`shrink-0 rounded px-3.5 py-1.5 text-sm transition-colors ${
                filter === item.key ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
              }`}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        {currentPlan !== 'basis' && (
          <button type="button" onClick={() => void manageBilling()} className="glass-button-secondary ml-auto">
            {t('plans.manage_billing')}
          </button>
        )}
      </div>

      {showPlans && (
        <section>
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pp.plans_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('pp.plans_sub')}</p>
          <div className="mt-4 grid items-stretch gap-5 pt-3 lg:grid-cols-3">
            {CARDS.filter((card) => !plansFromCatalog || catalogPackage(catalog, card.plan))
              .sort((a, b) => (catalogPackage(catalog, a.plan)?.sort ?? 0) - (catalogPackage(catalog, b.plan)?.sort ?? 0))
              .map((card) => {
              const cp = catalogPackage(catalog, card.plan);
              const highlight = cp ? cp.highlight : card.highlight;
              const isCurrent = currentPlan === card.plan;
              // Niedrigere Pläne als der aktuelle werden nicht mehr zum Anfragen angeboten.
              const lower = ['basis', 'marketing_starter', 'marketing_pro'].indexOf(card.plan) <
                ['basis', 'marketing_starter', 'marketing_pro'].indexOf(currentPlan);
              return (
                <PlanCard
                  key={card.plan}
                  highlight={highlight}
                  badge={highlight ? packageText(cp, 'badge', language) ?? t('plans.badge_popular') : undefined}
                  badgeTone="brand"
                  name={packageText(cp, 'name', language) ?? t(PLAN_LABEL_KEY[card.plan])}
                  price={
                    <PriceFigure
                      value={money(price(card.plan))}
                      suffix={price(card.plan) === 0 ? undefined : t('crm_pricing.per_month')}
                    />
                  }
                  priceNote={packageText(cp, 'tagline', language) ?? t(card.noteKey)}
                  includedLabel={t('crm_pricing.included')}
                  points={bulletList(cp, language, true) ?? card.points.map((key) => t(key))}
                  excluded={bulletList(cp, language, false)}
                  action={
                    card.plan === 'basis' || lower ? (
                      <div className="mt-5 min-h-[2.5rem]" />
                    ) : (
                      <PlanAction
                        highlight={highlight}
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
          <p className="mt-3 text-center text-xs text-[color:var(--ink-3)]">{t('plans.request_note')}</p>
        </section>
      )}

      {filter === 'shop' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pp.shop_packages_title')}</h3>
              <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('shop_pricing.subtitle')}</p>
            </div>
            <Link to="/shop" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t('pp.go_to_page', { page: t('nav.shop') })} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <ShopPackages />
        </section>
      )}

      {filter === 'speed' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pp.speed_packages_title')}</h3>
              <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('speed.offer.intro')}</p>
            </div>
            <Link to="/users" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t('pp.go_to_page', { page: t('nav.speed') })} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <SpeedPackages softwareOnly={hasHardware} />
        </section>
      )}

      {addons.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pp.addons_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('pp.addons_sub')}</p>
          <div className={`mt-4 grid gap-4 ${addons.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {addons.map((addon) => {
              const Icon = addon.icon;
              const active = addon.feature ? has(addon.feature) : false;
              const ca = catalogPackage(catalog, `addon_${addon.key}`);
              return (
                <div key={addon.key} className="flex flex-col rounded-xl border border-[color:var(--line)] bg-white p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-[color:var(--ink)]">{packageText(ca, 'name', language) ?? t(addon.titleKey)}</p>
                        {active && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            {t('pp.active')}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{packageText(ca, 'tagline', language) ?? t(addon.textKey)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4">
                    <p className="text-sm font-medium text-[color:var(--ink)]">{packageText(ca, 'price_note', language) ?? t(addon.priceKey)}</p>
                    {filter === 'all' && (addon.group === 'shop' || addon.group === 'speed') ? (
                      <button type="button" onClick={() => goToGroup(addon.group)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                        {t('pp.see_prices')}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : addon.to ? (
                      <Link to={addon.to} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                        {t(addon.linkKey ?? 'pp.details')}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : mailRequested ? (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                        <Check className="h-4 w-4" /> {t('crm_pricing.requested')}
                      </span>
                    ) : (
                      <button type="button" onClick={() => void requestExtraMails()} className="text-sm font-semibold text-brand-700 hover:underline">
                        {t('plans.request')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(filter === 'all' || filter === 'marketing' || filter === 'system') && (() => {
        const fromCatalog = catalogCompare(catalog, 'plan', { language, locale, t });
        return (
          <CompareTable
            title={t(filter === 'system' ? 'pp.compare_system_title' : 'plans.compare_title')}
            columns={fromCatalog?.columns ?? CARDS.map((card) => ({
              label: t(PLAN_LABEL_KEY[card.plan]),
              sub: card.plan === 'basis' ? t('fs.free') : `${money(PRICE[card.plan])} ${t('crm_pricing.per_month')}`,
              highlight: card.highlight,
            }))}
            rows={fromCatalog?.rows ?? ROWS}
          />
        );
      })()}
      {filter === 'shop' && <ShopCompare />}
      {filter === 'speed' && (
        <>
          {!hasHardware && <SpeedCompare />}
          <SoftwareCompare />
        </>
      )}
    </div>
  );
}
