import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, Info, Lightbulb, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../lib/i18n';
import { GUIDE_SECTIONS } from '../../lib/onboarding';

// Erklärung „So funktioniert es“ auf den Seiten.
// - Ausführlich (Einleitung, drei Schritte, Beispiele) für die Marketing-Seiten: wird in der Seite selbst
//   eingebunden (`<PageGuide id="social" />`).
// - Kurz (ein Satz, aufklappbar zu drei Punkten) für alle anderen Seiten: kommt automatisch über das Layout
//   (`<PageGuideStrip />`).
// Einmal ausgeblendet bleibt sie weg (je Nutzer, im Browser); „Diese Seite erklären“ im Hilfe-Center holt sie zurück.

const RICH: Record<string, number> = { social: 3, email: 2, survey: 1, tracking: 1, contacts: 1, speed: 1, shop: 1 };
const EVENT = 'lp:page-guide-changed';

function useClosed(): [string[], (id: string, closed: boolean) => void] {
  const { user } = useAuth();
  const key = `lp-page-guide:${user?.id ?? 'anon'}`;
  const read = (): string[] => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const [closed, setClosed] = useState<string[]>(read);
  useEffect(() => {
    const sync = () => setClosed(read());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (id: string, value: boolean) => {
    const next = value ? [...new Set([...read(), id])] : read().filter((x) => x !== id);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // nur für diese Sitzung
    }
    setClosed(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [closed, set];
}

/** Schritt-Schlüssel der Seite zum aktuellen Pfad (nur die Seite selbst, keine Unterseiten). */
function guideIdForPath(pathname: string): string | null {
  for (const section of GUIDE_SECTIONS) {
    for (const item of section.items) if (!item.action && item.path === pathname) return item.id;
  }
  return null;
}

/** „Diese Seite erklären“ (Hilfe-Center): Erklärung der aktuellen Seite wieder einblenden. */
export function showPageGuide() {
  window.dispatchEvent(new Event('lp:show-page-guide'));
}

export default function PageGuide({ id }: { id: string }) {
  const { t } = useI18n();
  const [closed, setClosed] = useClosed();
  useEffect(() => {
    const show = () => setClosed(id, false);
    window.addEventListener('lp:show-page-guide', show);
    return () => window.removeEventListener('lp:show-page-guide', show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Auf dem Handy erst nur die Einleitung: Schritte und Beispiele klappt man auf, sonst rutscht die Seite weit nach unten.
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);
  const examples = RICH[id];
  if (!examples || closed.includes(id)) return null;

  return (
    <section className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6" aria-label={t('pg.how')}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Info className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[color:var(--ink)]">{t('pg.how')}</p>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`pg.${id}.intro`)}</p>
        </div>
        <button type="button" onClick={() => setClosed(id, true)} aria-label={t('pg.close')} title={t('pg.close')}
          className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-brand-700">
          {t('pg.examples')} <ChevronDown className="h-4 w-4" />
        </button>
      )}
      {open && (
      <>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ink)] text-xs font-semibold text-white">{n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--ink)]">{t(`pg.${id}.s${n}_title`)}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`pg.${id}.s${n}_text`)}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ink-3)]">
        <Lightbulb className="h-3.5 w-3.5" /> {t('pg.examples')}
      </p>
      <ul className={`mt-2 grid gap-3 ${examples >= 3 ? 'md:grid-cols-3' : examples === 2 ? 'md:grid-cols-2' : ''}`}>
        {Array.from({ length: examples }).map((_, i) => (
          <li key={i} className="rounded-lg border border-[color:var(--line)] bg-slate-50 p-4">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{t(`pg.${id}.ex${i + 1}_title`)}</p>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`pg.${id}.ex${i + 1}_text`)}</p>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => setClosed(id, true)} className="mt-4 text-sm font-semibold text-brand-700 hover:underline">
        {t('pg.close')}
      </button>
      </>
      )}
    </section>
  );
}

/** Kurze Erklärung über der Seite (Layout): ein Satz, aufklappbar zu „Das kannst du hier tun“. */
export function PageGuideStrip() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [closed, setClosed] = useClosed();
  const [open, setOpen] = useState(false);
  const id = guideIdForPath(pathname);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!id || RICH[id]) return;
    const show = () => { setClosed(id, false); setOpen(true); };
    window.addEventListener('lp:show-page-guide', show);
    return () => window.removeEventListener('lp:show-page-guide', show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!id || RICH[id] || closed.includes(id)) return null;

  return (
    <div className="mb-5 rounded-lg border border-[color:var(--line)] bg-white">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <Info className="h-4 w-4 shrink-0 text-brand-700" />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-[color:var(--ink-2)]">
          <span className="min-w-0 flex-1 sm:truncate">
            <span className="font-semibold text-[color:var(--ink)]">{t(`ob.${id}.title`)}: </span>
            {t(`ob.${id}.purpose`)}
          </span>
          <span className="hidden shrink-0 text-xs font-semibold text-brand-700 sm:inline">{t('pg.how')}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button type="button" onClick={() => setClosed(id, true)} aria-label={t('pg.close')} title={t('pg.close')}
          className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="border-t border-[color:var(--line)] px-3 py-3 sm:px-4">
          <p className="text-xs font-semibold text-[color:var(--ink-3)]">{t('pg.what')}</p>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1.5 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-2 text-sm leading-snug text-[color:var(--ink-2)]">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                {t(`ob.${id}.can${n}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
