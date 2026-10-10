// Rechte je Seite (docs/PRODUKT_PLAN.md, H1–H3). Inhaber sehen alles. Für Mitarbeiter gilt
// `allowed_pages` aus der Mitgliedschaft; ist sie leer (null), gilt der bisherige Standard.

export type PageKey =
  | 'overview' | 'revenue' | 'purchases' | 'photos' | 'personalization' | 'health' | 'kamera'
  | 'marketing' | 'shop' | 'speed' | 'configuration' | 'tickets' | 'settings' | 'team' | 'plans';

/** Seiten, die ein Mitarbeiter bekommen kann (Team und Pläne bleiben dem Inhaber vorbehalten). */
export const ASSIGNABLE_PAGES: { key: PageKey; labelKey: string }[] = [
  { key: 'overview', labelKey: 'nav.overview' },
  { key: 'revenue', labelKey: 'nav.revenue' },
  { key: 'purchases', labelKey: 'nav.purchases' },
  { key: 'photos', labelKey: 'nav.photos' },
  { key: 'personalization', labelKey: 'nav.personalization' },
  { key: 'health', labelKey: 'nav.system_health' },
  { key: 'kamera', labelKey: 'nav.camera' },
  { key: 'marketing', labelKey: 'nav.leads' },
  { key: 'shop', labelKey: 'nav.shop' },
  { key: 'speed', labelKey: 'nav.speed' },
  { key: 'configuration', labelKey: 'nav.configuration' },
  { key: 'tickets', labelKey: 'nav.support' },
  { key: 'settings', labelKey: 'nav.settings' },
];

/** Bisheriger Standard für Mitarbeiter ohne eigene Auswahl. */
export const STAFF_DEFAULT_PAGES: PageKey[] = ['photos', 'personalization', 'tickets', 'health', 'kamera'];

export const ROLE_PRESETS: { id: string; labelKey: string; pages: PageKey[] }[] = [
  {
    id: 'operations',
    labelKey: 'team2.preset_ops',
    pages: ['overview', 'revenue', 'purchases', 'photos', 'personalization', 'health', 'kamera', 'marketing', 'shop', 'speed', 'configuration', 'tickets'],
  },
  { id: 'accounting', labelKey: 'team2.preset_acc', pages: ['overview', 'revenue', 'purchases'] },
  { id: 'marketing', labelKey: 'team2.preset_mkt', pages: ['marketing', 'photos', 'personalization'] },
  { id: 'tech', labelKey: 'team2.preset_tech', pages: ['health', 'kamera', 'photos', 'personalization', 'tickets'] },
  { id: 'crew', labelKey: 'team2.preset_crew', pages: ['photos', 'health'] },
];

const PREFIXES: [string, PageKey][] = [
  ['/revenue', 'revenue'],
  ['/purchases', 'purchases'],
  ['/photos', 'photos'],
  ['/personalization', 'personalization'],
  ['/health', 'health'],
  ['/kamera', 'kamera'],
  ['/leads', 'marketing'],
  ['/shop', 'shop'],
  ['/users', 'speed'],
  ['/configuration', 'configuration'],
  ['/tickets', 'tickets'],
  ['/team', 'team'],
  ['/settings', 'settings'],
  ['/plaene', 'plans'],
];

/** Seiten-Schlüssel zu einem Pfad; unbekannte Pfade geben null zurück (nicht eingeschränkt). */
export function pageKeyForPath(pathname: string): PageKey | null {
  if (pathname === '/') return 'overview';
  const hit = PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

export type Viewer = { isOwner: boolean; isStaff: boolean; allowedPages: string[] | null };

export function canSee(key: PageKey | null, viewer: Viewer): boolean {
  if (key === null || viewer.isOwner) return true;
  if (key === 'team' || key === 'plans') return false;
  if (viewer.allowedPages) return viewer.allowedPages.includes(key);
  if (viewer.isStaff) return STAFF_DEFAULT_PAGES.includes(key);
  return true;
}

/** Erste Seite, die die Person öffnen darf (Ziel bei fehlendem Recht). */
export function firstAllowedPath(viewer: Viewer): string {
  const order: [string, PageKey][] = [
    ['/', 'overview'], ['/revenue', 'revenue'], ['/purchases', 'purchases'], ['/photos', 'photos'],
    ['/health', 'health'], ['/personalization', 'personalization'], ['/tickets', 'tickets'],
    ['/kamera', 'kamera'], ['/leads', 'marketing'], ['/configuration', 'configuration'],
  ];
  return order.find(([, key]) => canSee(key, viewer))?.[0] ?? '/photos';
}
