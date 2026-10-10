import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';
import { usePark } from '../contexts/ParkContext';
import { hasGuestActivity } from '../components/GuestActivityAwareOverlay';

// Pläne und Funktionen des Betreiber-Dashboards (docs/PRODUKT_PLAN.md, Abschnitt 3 und Aufgabe B1).
//
// Eine Stelle für die Frage „Darf dieser Park diese Funktion nutzen?“. Seiten,
// Navigation und Upgrade-Hinweise fragen nur noch `useEntitlements().has(feature)`
// statt eigene Regeln zu haben.
//
// Übergangsregel, wenn für den Park noch keine Zeile in `park_entitlements` existiert:
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

/** Übersetzungsschlüssel für Plannamen. */
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
  error: boolean;
  refresh: () => void;
};

export type ParkEntitlement = {
  park_id: string;
  plan: PlanKey;
  features: FeatureKey[];
  status: 'active' | 'trial' | 'paused' | 'cancelled';
  trial_until: string | null;
};

/** Pausierte/gekündigte und abgelaufene Testpläne fallen auf Basis zurück.
 * Zusätzliche Features gelten nur bei aktiver Freischaltung. Das Test-Enddatum
 * zählt einschließlich des ganzen Tages in Europe/Berlin.
 */
export function resolveEntitlements(row: ParkEntitlement | null, parkId: string | null, now = new Date()) {
  if (!row) {
    const addons: FeatureKey[] = hasGuestActivity(parkId) ? ['speed'] : [];
    return { plan: 'marketing_starter' as PlanKey, features: addons };
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
  const active = row.status === 'active' ||
    (row.status === 'trial' && row.trial_until !== null && row.trial_until >= today);
  return {
    plan: active ? row.plan : 'basis' as PlanKey,
    features: active ? row.features : [],
  };
}

function isEntitlement(value: unknown, parkId: string): value is ParkEntitlement {
  if (!value || typeof value !== 'object') return false;
  const row = value as ParkEntitlement;
  return row.park_id === parkId && PLAN_ORDER.includes(row.plan) &&
    ['active', 'trial', 'paused', 'cancelled'].includes(row.status) &&
    Array.isArray(row.features) && row.features.every((f) => Object.prototype.hasOwnProperty.call(FEATURE_PLAN, f)) &&
    (row.trial_until === null || (typeof row.trial_until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.trial_until))) &&
    (row.status !== 'trial' || row.trial_until !== null);
}

// Sidebar, Profilmenü und PlanGate teilen gleichzeitige Anfragen. Keine Daten
// in localStorage.
//
// Verhalten bei Fehlern (Entscheidung 10.10.2026): NICHT sperren. Scheitert der
// Abruf (Function nicht erreichbar, Netz weg, Zeitlimit), gilt der zuletzt
// bekannte Stand dieses Parks, sonst die Übergangsregel. Grund: die Sperre ist
// eine Anzeige-Regel, kein Schutz der Daten - ein Aussetzer darf zahlende
// Kunden nicht aus ihrem CRM werfen und keine offenen Formulare schließen.
const lastKnown = new Map<string, ParkEntitlement | null>();

// Adresse der Function `operator-entitlements` im shared-Projekt. Sie wurde im
// Supabase-Editor angelegt, der dabei eine Zufalls-Adresse vergibt („hyper-processor“);
// der Name `operator-entitlements` steht nur in der Anzeige. Wird die Function einmal per
// CLI neu bereitgestellt (`supabase functions deploy operator-entitlements`), hier
// zurück auf 'operator-entitlements' stellen.
const ENTITLEMENTS_FUNCTION = 'hyper-processor';
const pending = new Map<string, Promise<ParkEntitlement | null>>();
async function fetchEntitlements(parkId: string): Promise<ParkEntitlement | null> {
  const { data: { session } } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Missing session');
  const key = `${parkId}:${session.access_token}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(
      `${EXTERNAL_SUPABASE_URL}/functions/v1/${ENTITLEMENTS_FUNCTION}?${new URLSearchParams({ park_id: parkId })}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw new Error(`Entitlements HTTP ${response.status}`);
    const body = await response.json();
    if (body?.data === null) return null;
    if (!isEntitlement(body?.data, parkId)) throw new Error('Invalid entitlements response');
    return body.data;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}

export function useEntitlements(): Entitlements {
  const { parkId } = usePark();
  const auth = useContext(AuthContext);
  const sessionKey = auth?.session?.access_token ?? '';
  const [refreshId, setRefreshId] = useState(0);
  const refresh = useCallback(() => setRefreshId((n) => n + 1), []);
  const [state, setState] = useState<{ parkId: string; row: ParkEntitlement | null; error: boolean } | null>(
    () => (parkId && lastKnown.has(parkId) ? { parkId, row: lastKnown.get(parkId) ?? null, error: false } : null),
  );

  useEffect(() => {
    if (!parkId) return;
    let cancelled = false;
    void fetchEntitlements(parkId).then(
      (row) => {
        lastKnown.set(parkId, row);
        if (!cancelled) setState({ parkId, row, error: false });
      },
      () => {
        // Fehler: letzten bekannten Stand behalten, sonst Übergangsregel (row = null).
        if (!cancelled) setState({ parkId, row: lastKnown.get(parkId) ?? null, error: true });
      },
    );
    return () => { cancelled = true; };
    // sessionKey: nach An-/Ummeldung im Hintergrund neu laden, ohne die Seite zu sperren.
  }, [parkId, sessionKey, refreshId]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    // Änderungen durch Staff und das Ende eines Testtages übernehmen.
    const timer = window.setInterval(onVisible, 5 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return useMemo(() => {
    const current = state?.parkId === parkId ? state : null;
    // Nur der allererste Abruf für einen Park heisst „lädt“. Spätere Abrufe
    // (Zeitgeber, Tab-Wechsel, neues Token) laufen im Hintergrund.
    const loading = !!parkId && !current;
    const error = current?.error ?? false;
    const { plan, features } = current
      ? resolveEntitlements(current.row, parkId)
      : { plan: 'basis' as PlanKey, features: [] as FeatureKey[] };
    return {
      plan,
      addons: features.filter((feature) => FEATURE_PLAN[feature] === 'addon'),
      has: (feature: FeatureKey) => !loading && (planIncludes(plan, feature) || features.includes(feature)),
      requiredPlan: (feature: FeatureKey) => FEATURE_PLAN[feature],
      loading,
      /** Letzter Abruf gescheitert - nur zur Information, sperrt nichts. */
      error,
      refresh,
    };
  }, [parkId, state, refresh]);
}
