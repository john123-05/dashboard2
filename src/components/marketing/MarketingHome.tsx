import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, X } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { formatNumber } from '../../lib/utils';
import {
  fetchSurveyResults,
  fetchTrackingSettings,
  type SurveyConfig,
  type SurveyResults,
  type TrackingSettings,
} from '../../lib/surveyApi';

// Startseite des Marketing-CRM (docs/PRODUKT_PLAN.md, C2): Einrichtungsassistent, Kennzahlen mit
// Vergleich zu den 30 Tagen davor und Trichter. Alle Werte kommen aus der Seite `Leads.tsx`
// (schon geladen); nur Pixel-Einstellungen und die Umfrage der letzten 60 Tage holt sie selbst.

const DAY = 24 * 60 * 60 * 1000;

function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!(current > 0) || !(previous > 0)) return <p className="mt-1 text-xs text-[color:var(--ink-3)]">{label}</p>;
  const change = Math.round(((current - previous) / previous) * 100);
  const tone = change >= 0 ? 'text-emerald-600' : 'text-rose-600';
  return (
    <p className="mt-1 text-xs text-[color:var(--ink-3)]">
      <span className={`font-semibold ${tone}`}>
        {change >= 0 ? '+' : '−'}
        {Math.abs(change)} %
      </span>{' '}
      {label}
    </p>
  );
}

export default function MarketingHome({
  parkId,
  leads,
  lifetimeSold,
  config,
  survey30,
}: {
  parkId: string;
  leads: Record<string, unknown>[];
  lifetimeSold: number | null;
  config: SurveyConfig | null;
  survey30: SurveyResults | null;
}) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const storageKey = `lp-crm-setup:${parkId}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'hidden';
    } catch {
      return false;
    }
  });
  const [tracking, setTracking] = useState<TrackingSettings | null>(null);
  const [survey60, setSurvey60] = useState<SurveyResults | null>(null);

  useEffect(() => {
    let active = true;
    fetchTrackingSettings(parkId).then((r) => active && setTracking(r)).catch(() => {});
    fetchSurveyResults(parkId, 60).then((r) => active && setSurvey60(r)).catch(() => {});
    return () => {
      active = false;
    };
  }, [parkId]);

  const numbers = useMemo(() => {
    const now = Date.now();
    let recent = 0;
    let before = 0;
    let recentOptIn = 0;
    let beforeOptIn = 0;
    for (const lead of leads) {
      const time = typeof lead.created_at === 'string' ? Date.parse(lead.created_at) : NaN;
      if (Number.isNaN(time)) continue;
      const optIn = lead.opted_in === true;
      if (time >= now - 30 * DAY) {
        recent += 1;
        if (optIn) recentOptIn += 1;
      } else if (time >= now - 60 * DAY) {
        before += 1;
        if (optIn) beforeOptIn += 1;
      }
    }
    const total = leads.length;
    const optedIn = leads.filter((lead) => lead.opted_in === true).length;
    return {
      recent,
      before,
      total,
      optedIn,
      rate: total > 0 ? Math.round((optedIn / total) * 100) : 0,
      recentRate: recent > 0 ? Math.round((recentOptIn / recent) * 100) : 0,
      beforeRate: before > 0 ? Math.round((beforeOptIn / before) * 100) : 0,
    };
  }, [leads]);

  const steps = [
    { key: 'mode', label: t('mk.step_mode'), done: Boolean(config?.settings.mode), to: '/leads' },
    { key: 'contacts', label: t('mk.step_contacts'), done: leads.length > 0, to: '/leads/kontakte' },
    { key: 'survey', label: t('mk.step_survey'), done: (config?.questions.length ?? 0) > 0, to: '/leads/umfrage' },
    {
      key: 'pixel',
      label: t('mk.step_pixel'),
      done: Boolean(tracking?.enabled && (tracking.meta_pixel_id || tracking.google_ads_id)),
      to: '/leads/pixel',
    },
    { key: 'review', label: t('mk.step_review'), done: Boolean(config?.settings.review_url?.trim()), to: '/leads/umfrage' },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const ready = config !== null && tracking !== null;

  const responsesBefore = survey60 && survey30 ? Math.max(0, survey60.total - survey30.total) : 0;
  const funnel = [
    { key: 'sold', label: t('mk.funnel_sold'), value: lifetimeSold ?? 0, bar: 'bg-brand-600' },
    { key: 'contacts', label: t('mk.funnel_contacts'), value: numbers.total, bar: 'bg-brand-400' },
    { key: 'optin', label: t('mk.funnel_optin'), value: numbers.optedIn, bar: 'bg-brand-300' },
  ];
  const funnelMax = Math.max(1, ...funnel.map((step) => step.value));
  const vsLabel = t('mk.vs_prev');

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(storageKey, 'hidden');
    } catch {
      /* ohne Speicher bleibt der Assistent beim nächsten Besuch sichtbar */
    }
  }

  return (
    <div className="space-y-4">
      {ready && !hidden && doneCount < steps.length && (
        <GlassCard className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('mk.setup_title')}</h3>
              <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">
                {t('mk.setup_progress', { done: doneCount, total: steps.length })}
              </p>
            </div>
            <button
              type="button"
              onClick={hide}
              aria-label={t('mk.hide')}
              title={t('mk.hide')}
              className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 divide-y divide-[color:var(--line)]">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-3 py-2.5">
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                )}
                <span className={`flex-1 text-sm ${step.done ? 'text-[color:var(--ink-3)] line-through' : 'text-[color:var(--ink)]'}`}>
                  {step.label}
                </span>
                {!step.done && (
                  <Link to={step.to} className="text-sm font-medium text-brand-700 hover:underline">
                    {t('mk.open')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <GlassCard className="p-4">
          <p className="text-xs text-[color:var(--ink-3)]">{t('mk.kpi_new')}</p>
          <p className="mt-2 text-[28px] font-light tracking-tight text-[color:var(--ink)]">{formatNumber(numbers.recent, locale)}</p>
          <Delta current={numbers.recent} previous={numbers.before} label={vsLabel} />
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-[color:var(--ink-3)]">{t('mk.kpi_optin')}</p>
          <p className="mt-2 text-[28px] font-light tracking-tight text-[color:var(--ink)]">{numbers.rate} %</p>
          <Delta current={numbers.recentRate} previous={numbers.beforeRate} label={vsLabel} />
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-[color:var(--ink-3)]">NPS</p>
          <p className="mt-2 text-[28px] font-light tracking-tight text-[color:var(--ink)]">
            {survey30?.nps != null ? String(survey30.nps) : '–'}
          </p>
          <p className="mt-1 text-xs text-[color:var(--ink-3)]">{t('leads.recommendation')}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="text-xs text-[color:var(--ink-3)]">{t('mk.kpi_responses')}</p>
          <p className="mt-2 text-[28px] font-light tracking-tight text-[color:var(--ink)]">
            {survey30 ? formatNumber(survey30.total, locale) : '–'}
          </p>
          <Delta current={survey30?.total ?? 0} previous={responsesBefore} label={vsLabel} />
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('mk.funnel_title')}</h3>
        <div className="mt-4 space-y-3">
          {funnel.map((step, index) => {
            const previous = index === 0 ? null : funnel[index - 1].value;
            const percent = previous && previous > 0 ? Math.round((step.value / previous) * 100) : null;
            return (
              <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[160px_minmax(0,1fr)_150px]">
                <p className="text-sm text-[color:var(--ink-2)]">{step.label}</p>
                <p className="text-right text-sm text-[color:var(--ink)] sm:order-3">
                  <span className="font-semibold">{formatNumber(step.value, locale)}</span>
                  {percent !== null && (
                    <span className="ml-2 text-xs text-[color:var(--ink-3)]">{t('mk.funnel_of_prev', { percent })}</span>
                  )}
                </p>
                <div className="col-span-2 h-3 overflow-hidden rounded-full bg-slate-100 sm:order-2 sm:col-span-1">
                  <div
                    className={`h-full rounded-full ${step.bar} transition-all`}
                    style={{ width: `${Math.max(step.value > 0 ? 2 : 0, (step.value / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
