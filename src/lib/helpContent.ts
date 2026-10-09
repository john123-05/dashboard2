// Inhalte des Hilfe-Centers (TopBar -> HelpCenter). Jeder Artikel gehört zu
// einer oder mehreren Seiten; das Hilfe-Center zeigt zuerst die Artikel der
// Seite, auf der man gerade ist. Texte: `help.<id>.title` / `help.<id>.body`
// in src/lib/i18n.tsx (alle 7 Sprachen). Plan und Ideen: docs/HILFE_CENTER.md.

export type HelpArticle = {
  id: string;
  /** Seiten, zu denen der Artikel passt (Pfad-Anfang). */
  routes: string[];
  /** Seite, die der Knopf „Zur Seite“ öffnet. */
  link: string;
};

export const HELP_ARTICLES: HelpArticle[] = [
  { id: 'overview', routes: ['/'], link: '/' },
  { id: 'revenue', routes: ['/revenue', '/'], link: '/revenue' },
  { id: 'payments', routes: ['/revenue', '/purchases'], link: '/purchases' },
  { id: 'photos', routes: ['/photos'], link: '/photos' },
  { id: 'unlock', routes: ['/leads'], link: '/leads' },
  { id: 'export', routes: ['/leads'], link: '/leads' },
  { id: 'overlay', routes: ['/personalization'], link: '/personalization' },
  { id: 'overlay_live', routes: ['/personalization'], link: '/personalization' },
  { id: 'status', routes: ['/health'], link: '/health' },
  { id: 'restart', routes: ['/health', '/personalization'], link: '/health' },
  { id: 'paper', routes: ['/health', '/'], link: '/health' },
  { id: 'price', routes: ['/settings', '/revenue'], link: '/settings' },
  { id: 'hours', routes: ['/settings', '/'], link: '/settings' },
  { id: 'team', routes: ['/team', '/settings'], link: '/team' },
  { id: 'upgrades', routes: ['/configuration', '/shop', '/users'], link: '/configuration' },
  { id: 'support', routes: ['/tickets'], link: '/tickets' },
];

/** Artikel zur aktuellen Seite; bei Unterseiten zählt der längste passende Pfad. */
export function articlesForPath(pathname: string): HelpArticle[] {
  const matches = (route: string) => (route === '/' ? pathname === '/' : pathname.startsWith(route));
  const own = HELP_ARTICLES.filter((a) => a.routes.some(matches));
  return own.length > 0 ? own : HELP_ARTICLES.slice(0, 4);
}

/** Seitenname für „Hilfe zu: …“ (Navigationstexte). */
export const PAGE_LABEL_KEYS: [string, string][] = [
  ['/revenue', 'nav.revenue'],
  ['/purchases', 'nav.purchases'],
  ['/users', 'nav.speed'],
  ['/photos', 'nav.photos'],
  ['/leads', 'nav.leads'],
  ['/personalization', 'nav.personalization'],
  ['/tickets', 'nav.support'],
  ['/health', 'nav.system_health'],
  ['/kamera', 'nav.camera'],
  ['/configuration', 'nav.configuration'],
  ['/shop', 'nav.shop'],
  ['/team', 'nav.team'],
  ['/settings', 'nav.settings'],
];

export function pageLabelKey(pathname: string) {
  if (pathname === '/') return 'nav.overview';
  return PAGE_LABEL_KEYS.find(([route]) => pathname.startsWith(route))?.[1] ?? 'nav.overview';
}

export const SUPPORT_EMAIL = 'info@liftpictures.com';
export const SUPPORT_PHONE = '+49 5222 8504-90';
export const SUPPORT_PHONE_HREF = 'tel:+495222850490';
