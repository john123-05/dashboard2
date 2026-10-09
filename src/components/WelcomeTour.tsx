import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../lib/i18n';
import { hasAccountSeenTour, isTourDisabled, markAccountSeenTour, setTourDisabled } from '../lib/dashboardTourSettings';

type TourStep = {
  id: string;
  route: string;
  title: string;
  benefit: string;
  actions: string;
  kpis: string;
};

type TourMode = 'prompt' | 'tour';

const PROMPT_DURATION_MS = 4000;

const ownerSteps: TourStep[] = [
  {
    id: 'overview',
    route: '/',
    title: 'tour.overview.title',
    benefit: 'tour.overview.benefit',
    actions: 'tour.overview.actions',
    kpis: 'tour.overview.kpis',
  },
  {
    id: 'revenue',
    route: '/revenue',
    title: 'tour.revenue.title',
    benefit: 'tour.revenue.benefit',
    actions: 'tour.revenue.actions',
    kpis: 'tour.revenue.kpis',
  },
  {
    id: 'purchases',
    route: '/purchases',
    title: 'tour.purchases.title',
    benefit: 'tour.purchases.benefit',
    actions: 'tour.purchases.actions',
    kpis: 'tour.purchases.kpis',
  },
  {
    id: 'photos',
    route: '/photos',
    title: 'tour.photos.title',
    benefit: 'tour.photos.benefit',
    actions: 'tour.photos.actions',
    kpis: 'tour.photos.kpis',
  },
  {
    id: 'leads',
    route: '/leads',
    title: 'tour.leads.title',
    benefit: 'tour.leads.benefit',
    actions: 'tour.leads.actions',
    kpis: 'tour.leads.kpis',
  },
  {
    id: 'personalization',
    route: '/personalization',
    title: 'tour.personalization.title',
    benefit: 'tour.personalization.benefit',
    actions: 'tour.personalization.actions',
    kpis: 'tour.personalization.kpis',
  },
  {
    id: 'support',
    route: '/tickets',
    title: 'tour.support.title',
    benefit: 'tour.support.benefit',
    actions: 'tour.support.actions',
    kpis: 'tour.support.kpis',
  },
  {
    id: 'health',
    route: '/health',
    title: 'tour.health.title',
    benefit: 'tour.health.benefit',
    actions: 'tour.health.actions',
    kpis: 'tour.health.kpis',
  },
  {
    id: 'settings',
    route: '/settings',
    title: 'tour.settings.title',
    benefit: 'tour.settings.benefit',
    actions: 'tour.settings.actions',
    kpis: 'tour.settings.kpis',
  },
];

const staffSteps: TourStep[] = [
  ownerSteps[3],
  ownerSteps[5],
  ownerSteps[6],
  ownerSteps[7],
];

function PromptCloseButton({
  remainingMs,
  onClose,
}: {
  remainingMs: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, remainingMs / PROMPT_DURATION_MS));
  const dashOffset = circumference * (1 - progress);

  return (
    <button
      type="button"
      onClick={onClose}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      aria-label={t('tour.close_label')}
    >
      <svg className="absolute inset-0 h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="2.5" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="rgb(14 165 233)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <X className="relative z-10 h-4 w-4" />
    </button>
  );
}

export default function WelcomeTour() {
  const { t } = useI18n();
  const { user, isOwner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<TourMode>('prompt');
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(PROMPT_DURATION_MS);

  const steps = useMemo(() => (isOwner ? ownerSteps : staffSteps), [isOwner]);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!user) return;
    if (isTourDisabled() || hasAccountSeenTour(user.id) || steps.length === 0) return;

    setVisible(true);
    setMode('prompt');
    setIndex(0);
    setRemainingMs(PROMPT_DURATION_MS);
    markAccountSeenTour(user.id);
  }, [steps.length, user]);

  useEffect(() => {
    if (!visible || mode !== 'prompt') return;
    if (location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [location.pathname, mode, navigate, visible]);

  useEffect(() => {
    if (!visible || mode !== 'tour' || !step) return;
    if (location.pathname !== step.route) {
      navigate(step.route, { replace: true });
    }
  }, [location.pathname, mode, navigate, step, visible]);

  useEffect(() => {
    if (!visible || mode !== 'prompt') return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextRemaining = Math.max(0, PROMPT_DURATION_MS - elapsed);
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(timer);
        setVisible(false);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [mode, visible]);

  if (!visible || !step) return null;

  const closeTour = () => setVisible(false);

  if (mode === 'prompt') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/20 p-4 backdrop-blur-[2px] sm:items-center">
        <div className="glass-panel-strong w-full max-w-lg rounded-[32px] p-6 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">{t('tour.welcome')}</p>
                <h3 className="mt-1 text-xl font-bold text-slate-800">{t('tour.prompt_title')}</h3>
              </div>
            </div>
            <PromptCloseButton remainingMs={remainingMs} onClose={closeTour} />
          </div>

          <p className="mt-5 text-sm leading-7 text-slate-600">
            {t('tour.prompt_text')}
          </p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeTour}
              className="inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              <X className="h-4 w-4" />
              {t('tour.close')}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('tour');
                setIndex(0);
              }}
              className="glass-button-primary text-sm"
            >
              {t('tour.yes_show')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="glass-panel-strong w-full max-w-xl rounded-[32px] p-6 shadow-2xl sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">
              {t('tour.step_of', { index: index + 1, total: steps.length })}
            </p>
            <h3 className="mt-2 text-xl font-bold text-slate-800">{t(step.title)}</h3>
          </div>
          <button
            type="button"
            onClick={closeTour}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('tour.close_label')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm leading-7 text-slate-600">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('tour.benefit_label')}</p>
            <p className="mt-1">{t(step.benefit)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('tour.actions_label')}</p>
            <p className="mt-1">{t(step.actions)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{t('tour.kpis_label')}</p>
            <p className="mt-1">{t(step.kpis)}</p>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              className="glass-button-secondary flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('tour.back')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTourDisabled(true);
                closeTour();
              }}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              {t('tour.never_again')}
            </button>
          )}

          {isLast ? (
            <button type="button" onClick={closeTour} className="glass-button-primary text-sm">
              {t('tour.done')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
              className="glass-button-primary flex items-center gap-1.5 text-sm"
            >
              {t('tour.next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
