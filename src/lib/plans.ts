import { useMemo } from 'react';
import { usePark } from '../contexts/ParkContext';
import { hasGuestActivity } from '../components/GuestActivityAwareOverlay';

// Pläne und Funktionen des Betreiber-Dashboards (docs/PRODUKT_PLAN.md, Abschnitt 3 und Aufgabe B1).
//
// Eine Stelle für die Frage „Darf dieser Park diese Funktion nutzen?“. Seiten,
// Navigation und Upgrade-Hinweise fragen nur noch `useEntitlements().has(feature)`
// statt eigene Regeln zu haben.
//
// Übergangsregel, bis die Tabelle `park_entitlements` existiert (Aufgabe B2):
// - Jeder Park hat „Marketing Starter“ - das CRM ist heute für alle offen, so
//   ändert sich für niemanden etwas.
// - Pro-Funktionen sind aus (es gibt sie noch nicht).
// - Add-ons wie bisher: Speedmessung über `hasGuestActivity`, Online-Shop ist
//   überall noch Upgrade.

export type PlanKey = 'basis' | 'marketing_starter' | 'marketing_pro';

export type FeatureKey =
  | 'crm_contacts'
  | 'crm_survey'
  | 'crm_social'
  | 'crm_pixel'
  | 'email_marketing'
  | 'social_campaigns'
  | 'review_routing'
  | 'team_permissions'
  | 'reports_pro'
  | 'online_shop'
  | 'speed';

/** Ab welchem Plan eine Funktion enthalten ist; `addon` = einzeln buchbar, unabhängig vom Plan. */
export const FEATURE_PLAN: Record<FeatureKey, PlanKey | 'addon'> = {
  crm_contacts: 'marketing_starter',
  crm_survey: 'marketing_starter',
  crm_social: 'marketing_starter',
  crm_pixel: 'marketing_starter',
  email_marketing: 'marketing_starter',
  social_campaigns: 'marketing_pro',
  review_routing: 'marketing_pro',
  team_permissions: 'marketing_pro',
  reports_pro: 'marketing_pro',
  online_shop: 'addon',
  speed: 'addon',
};

/** Rangfolge der Pläne: ein höherer Plan enthält alles der niedrigeren. */
export const PLAN_ORDER: PlanKey[] = ['basis', 'marketing_starter', 'marketing_pro'];

/** Übersetzungsschlüssel für Plannamen (Texte folgen mit Aufgabe B3). */
export const PLAN_LABEL_KEY: Record<PlanKey, string> = {
  basis: 'plans.basis',
  marketing_starter: 'plans.marketing_starter',
  marketing_pro: 'plans.marketing_pro',
};

/**
 * Welche Seite zu welcher Funktion gehört. Längster passender Pfad gewinnt
 * (siehe `featureForPath`). Seiten ohne Eintrag gehören zum Basis-Plan.
 * `/leads` (Startseite Marketing-CRM) bleibt bewusst frei: sie ist auch ohne
 * Plan die Upgrade-Seite.
 */
export const ROUTE_FEATURE: [string, FeatureKey][] = [
  ['/leads/kontakte', 'crm_contacts'],
  ['/leads/umfrage', 'crm_survey'],
  ['/leads/social', 'crm_social'],
  ['/leads/pixel', 'crm_pixel'],
  ['/marketing/email', 'email_marketing'],
  ['/shop', 'online_shop'],
  ['/users', 'speed'],
];

export function featureForPath(pathname: string): FeatureKey | null {
  let best: [string, FeatureKey] | null = null;
  for (const entry of ROUTE_FEATURE) {
    const [prefix] = entry;
    const matches = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (matches && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}

/** Ist eine Funktion in einem Plan enthalten (ohne Add-ons)? */
export function planIncludes(plan: PlanKey, feature: FeatureKey): boolean {
  const needed = FEATURE_PLAN[feature];
  if (needed === 'addon') return false;
  return PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(needed);
}

export type Entitlements = {
  plan: PlanKey;
  /** Gebuchte Add-ons (Online-Shop, Speedmessung …). */
  addons: FeatureKey[];
  has: (feature: FeatureKey) => boolean;
  /** Kleinster Plan, der die Funktion enthält - für Upgrade-Hinweise. */
  requiredPlan: (feature: FeatureKey) => PlanKey | 'addon';
  loading: boolean;
};

export function useEntitlements(): Entitlements {
  const { parkId } = usePark();

  return useMemo(() => {
    // Übergangsregel (siehe Kopfkommentar). Mit B2 kommen Plan und Add-ons aus
    // `park_entitlements`; fehlt dort eine Zeile, gilt weiter diese Regel.
    const plan: PlanKey = 'marketing_starter';
    const addons: FeatureKey[] = hasGuestActivity(parkId) ? ['speed'] : [];

    return {
      plan,
      addons,
      has: (feature) => planIncludes(plan, feature) || addons.includes(feature),
      requiredPlan: (feature) => FEATURE_PLAN[feature],
      loading: false,
    };
  }, [parkId]);
}
