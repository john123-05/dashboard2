import type { UnlockMode } from './surveyApi';

/**
 * Die CRM-Reiter sind zugleich eigene Seiten: jeder hat eine eigene Adresse,
 * damit man ihn aus der Navigation direkt öffnen und als Lesezeichen speichern
 * kann. Hier als eigene Datei, damit die Seitenleiste die Liste nutzen kann,
 * ohne die ganze CRM-Seite ins Hauptpaket zu ziehen.
 *
 * Routen: eine einzige `/leads/*` in `App.tsx` - so bleibt die Seite beim
 * Reiterwechsel geladen und holt die Kontakte nicht jedes Mal neu.
 */
export type TabKey = 'overview' | 'allContacts' | 'email' | 'survey' | 'social' | 'tracking';

export const CRM_TABS: { key: TabKey; mode?: UnlockMode; labelKey: string; path: string }[] = [
  { key: 'overview', labelKey: 'crm.tab_start', path: '/leads' },
  { key: 'allContacts', mode: 'email', labelKey: 'leads.title', path: '/leads/kontakte' },
  { key: 'email', labelKey: 'crm.tab_email', path: '/leads/email' },
  { key: 'social', mode: 'social', labelKey: 'crm.tab_social', path: '/leads/social' },
  { key: 'survey', mode: 'survey', labelKey: 'crm.tab_survey', path: '/leads/umfrage' },
  { key: 'tracking', labelKey: 'crm.tab_tracking', path: '/leads/pixel' },
];

export function crmTabForPath(pathname: string): TabKey {
  return [...CRM_TABS].reverse().find((tab) => pathname === tab.path)?.key ?? 'overview';
}
