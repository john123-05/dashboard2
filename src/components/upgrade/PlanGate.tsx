import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import UpgradeHero from './UpgradeHero';
import GlassCard from '../ui/GlassCard';
import { useI18n } from '../../lib/i18n';
import { PLAN_LABEL_KEY, featureForPath, useEntitlements, type FeatureKey } from '../../lib/plans';

/**
 * Zeigt den Inhalt nur, wenn der Park die Funktion gebucht hat - sonst die
 * Upgrade-Seite mit dem Plan, der sie enthält (docs/PRODUKT_PLAN.md, B3).
 * Ohne `feature` gilt die Funktion der aktuellen Seite (`featureForPath`).
 * Add-ons (Online-Shop, Speedmessung) haben eigene Upgrade-Seiten und werden
 * hier nicht gesperrt.
 */
export default function PlanGate({ feature, children }: { feature?: FeatureKey; children: ReactNode }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const entitlements = useEntitlements();
  const key = feature ?? featureForPath(pathname);

  if (!key) return <>{children}</>;
  const required = entitlements.requiredPlan(key);
  if (required === 'addon') return <>{children}</>;
  // Nur beim allerersten Abruf kurz warten; Fehler sperren nicht (siehe plans.ts).
  if (entitlements.loading) {
    return (
      <GlassCard className="p-5 sm:p-6">
        <p role="status" className="text-sm text-[color:var(--ink-3)]">{t('app.loading')}</p>
      </GlassCard>
    );
  }
  if (entitlements.has(key)) return <>{children}</>;

  const plan = t(PLAN_LABEL_KEY[required]);
  return (
    <UpgradeHero
      badge={t('nav.upgrade')}
      title={t('plans.gate_title', { plan })}
      intro={t('plans.gate_text', { plan })}
      actions={
        <Link to="/plaene" className="glass-button-primary">
          {t('shop.view_plans')}
        </Link>
      }
    />
  );
}

/** Kleines Abzeichen „Teil von …“ für Seitenköpfe von Plan-Funktionen. */
export function PlanBadge({ feature }: { feature: FeatureKey }) {
  const { t } = useI18n();
  const { requiredPlan } = useEntitlements();
  const required = requiredPlan(feature);
  if (required === 'addon') return null;
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
      {t('plans.included_in', { plan: t(PLAN_LABEL_KEY[required]) })}
    </span>
  );
}
