import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { hasAccountSeenTour, isTourDisabled, markAccountSeenTour, setTourDisabled } from '../lib/dashboardTourSettings';
import { setOnboardingTrackingSuppressed, useOnboarding } from '../lib/onboarding';
import Modal from './ui/Modal';

// Begrüßung und Rundgang (Teil von „Erste Schritte“, siehe src/lib/onboarding.ts).
// - Beim ersten Anmelden: Begrüßung mit Auswahl „Rundgang“, „Erste Schritte“ oder „Später“.
// - Rundgang: eine Karte unten rechts, die Seite für Seite öffnet und erklärt, was man dort tun kann.
//   Die Seite bleibt dabei sichtbar und bedienbar. Start auch über das Hilfe-Center (`lp:start-tour`).
export default function WelcomeTour() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { items, markDone } = useOnboarding();
  const steps = items.filter((item) => !item.action);
  const [mode, setMode] = useState<'off' | 'welcome' | 'tour'>('off');
  const [index, setIndex] = useState(0);
  // Auf dem Handy startet die Karte klein, damit die Seite dahinter zu sehen ist.
  const [details, setDetails] = useState(() => typeof window === 'undefined' || window.innerWidth > 900);
  const step = steps[index];
  const firstName = (profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '';

  useEffect(() => {
    if (!user || steps.length === 0) return;
    if (isTourDisabled() || hasAccountSeenTour(user.id)) return;
    markAccountSeenTour(user.id);
    setMode('welcome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, steps.length > 0]);

  useEffect(() => {
    function start() {
      setIndex(0);
      setMode('tour');
    }
    window.addEventListener('lp:start-tour', start);
    return () => window.removeEventListener('lp:start-tour', start);
  }, []);

  // Im Rundgang zählen Seitenbesuche nicht als „erledigt“ – man hat die Seite ja nur kurz gezeigt bekommen.
  useEffect(() => {
    setOnboardingTrackingSuppressed(mode === 'tour');
    return () => setOnboardingTrackingSuppressed(false);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'tour' || !step) return;
    if (location.pathname !== step.path) navigate(step.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, step?.path]);

  useEffect(() => {
    if (mode !== 'tour') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('off');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  function finish() {
    markDone('tour');
    setMode('off');
    // Erst nach dem Ende des Rundgangs wieder mitzählen, dann zur Liste.
    window.setTimeout(() => navigate('/start'), 0);
  }

  if (mode === 'welcome') {
    return (
      <Modal onClose={() => setMode('off')} labelledBy="ob-welcome" panelClassName="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <h2 id="ob-welcome" className="mt-4 text-[26px] font-light leading-tight tracking-tight text-[color:var(--ink)]">
          {firstName ? t('ob.modal_title', { name: firstName }) : t('ob.welcome_plain')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('ob.modal_text')}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={() => { setIndex(0); setMode('tour'); }} className="glass-button-primary justify-center">
            {t('ob.modal_tour')} <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setMode('off'); navigate('/start'); }} className="glass-button-secondary justify-center">
            {t('ob.modal_steps')}
          </button>
          <button type="button" onClick={() => setMode('off')} className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
            {t('ob.modal_later')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setTourDisabled(true); setMode('off'); }}
          className="mt-5 text-xs text-[color:var(--ink-3)] hover:underline"
        >
          {t('ob.modal_never')}
        </button>
      </Modal>
    );
  }

  if (mode !== 'tour' || !step) return null;
  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  return (
    <div
      role="dialog"
      aria-label={t('ob.start_tour')}
      className="fixed bottom-4 right-4 z-[95] w-[min(400px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[color:var(--line-strong)] bg-white shadow-[0_16px_48px_rgba(16,24,40,0.22)] max-[900px]:bottom-[calc(84px+env(safe-area-inset-bottom,0px))] max-[900px]:left-4 max-[900px]:w-auto"
    >
      <div className="h-1 bg-slate-100">
        <div className="h-full bg-brand-600 transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="max-h-[55vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[color:var(--ink-3)]">{t('ob.tour_step', { index: index + 1, total: steps.length })}</p>
            <h3 className="text-base font-semibold text-[color:var(--ink)]">{t(`ob.${step.id}.title`)}</h3>
          </div>
          <button
            type="button"
            onClick={() => setMode('off')}
            aria-label={t('ob.tour_close')}
            title={t('ob.tour_close')}
            className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-2)]">{t(`ob.${step.id}.purpose`)}</p>
        <button
          type="button"
          onClick={() => setDetails((v) => !v)}
          aria-expanded={details}
          className="mt-3 flex min-h-[36px] w-full items-center justify-between gap-2 text-left text-xs font-semibold text-[color:var(--ink-3)]"
        >
          {t('ob.can_title')}
          <ChevronDown className={`h-4 w-4 transition-transform ${details ? 'rotate-180' : ''}`} />
        </button>
        {details && (
          <>
            <ul className="mt-1 space-y-1.5">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-2 text-sm leading-snug text-[color:var(--ink-2)]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {t(`ob.${step.id}.can${n}`)}
                </li>
              ))}
            </ul>
            {step.locked && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-[color:var(--ink-3)]">{t('ob.locked_hint')}</p>}
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="glass-button-secondary disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> {t('ob.tour_back')}
          </button>
          {isLast ? (
            <button type="button" onClick={finish} className="glass-button-primary">
              <Check className="h-4 w-4" /> {t('ob.tour_finish')}
            </button>
          ) : (
            <button type="button" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} className="glass-button-primary">
              {t('ob.tour_next')} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
