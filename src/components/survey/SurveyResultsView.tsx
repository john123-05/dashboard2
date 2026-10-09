import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import GlassCard from '../ui/GlassCard';
import {
  fetchSurveyResults,
  pickLocalized,
  type SurveyQuestionResult,
  type SurveyResults,
} from '../../lib/surveyApi';

const PERIODS = [
  { days: 7, label: 'survey.period_7' },
  { days: 30, label: 'survey.period_30' },
  { days: 90, label: 'survey.period_90' },
  { days: 365, label: 'survey.period_365' },
] as const;

function scoreColor(score: number): string {
  if (score >= 9) return 'bg-emerald-500';
  if (score >= 7) return 'bg-amber-400';
  return 'bg-rose-500';
}

function Bars({ items, colorFor }: {
  items: { label: string; count: number; color?: string }[];
  colorFor?: (index: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-right text-slate-500" title={item.label}>{item.label}</span>
          <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              className={`block h-full rounded-full ${item.color ?? colorFor?.(i) ?? 'bg-brand-500'}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 tabular-nums text-slate-600">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function QuestionCard({ q }: { q: SurveyQuestionResult }) {
  const { t } = useI18n();
  const localeTag = useLocaleTag();
  const prompt = pickLocalized(q.prompt) || t('survey.question');
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800">{prompt}</h4>
        <span className="text-xs text-slate-400">
          {t('survey.answers_count', { count: q.answered })}{!q.active && ` · ${t('survey.question_removed')}`}
          {typeof q.average === 'number' && ` · Ø ${q.average}`}
        </span>
      </div>
      <div className="mt-3">
        {q.type === 'nps' && q.distribution && (
          <Bars
            items={q.distribution.map((d) => ({ label: String(d.value), count: d.count }))}
            colorFor={(i) => scoreColor(i)}
          />
        )}
        {q.type === 'stars' && q.distribution && (
          <Bars items={q.distribution.map((d) => ({ label: `${d.value} ★`, count: d.count }))} />
        )}
        {q.type === 'yesno' && (
          <Bars
            items={[
              { label: t('survey.yes'), count: q.yes ?? 0, color: 'bg-emerald-500' },
              { label: t('survey.no'), count: q.no ?? 0, color: 'bg-rose-400' },
            ]}
          />
        )}
        {q.type === 'choice' && q.counts && (
          <Bars
            items={q.counts.map((c) => ({
              label: pickLocalized(q.options[c.index]) || t('survey.answer_n', { n: c.index + 1 }),
              count: c.count,
            }))}
          />
        )}
        {q.type === 'text' && (
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(q.texts ?? []).length === 0 && <li className="text-sm text-slate-400">{t('survey.no_answers_yet')}</li>}
            {(q.texts ?? []).map((entry, i) => (
              <li key={i} className="rounded-lg bg-white/60 px-3 py-2 text-sm text-slate-700">
                {entry.text}
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {new Date(entry.at).toLocaleDateString(localeTag)}
                  {typeof entry.score === 'number' && ` · ${t('survey.score_n', { n: entry.score })}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}

export default function SurveyResultsView({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const localeTag = useLocaleTag();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SurveyResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSurveyResults(parkId, days)
      .then((r) => {
        if (!active) return;
        setData(r);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : t('survey.load_failed')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId, days]);

  const maxDay = Math.max(1, ...(data?.timeline ?? []).map((d) => d.count));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('survey.results_intro')}</p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-1 text-sm text-slate-700"
        >
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>{t(p.label)}</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('survey.loading')}
        </p>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {data && data.total === 0 && !loading && (
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">{t('survey.no_answers_period')}</p>
        </GlassCard>
      )}

      {data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t('survey.kpi_answers')} value={String(data.total)} />
            <Kpi
              label="NPS"
              value={data.nps === null ? '–' : String(data.nps)}
              sub={t('survey.promoters_line', { promoters: data.promoters, passives: data.passives, detractors: data.detractors })}
            />
            <Kpi label={t('survey.kpi_avg_score')} value={data.average_score === null ? '–' : String(data.average_score)} />
            <Kpi
              label={t('survey.kpi_link_shown')}
              value={String(data.review_link_shown)}
              sub={t('survey.from_score', { n: data.review_min_score })}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">{t('survey.recommendation_distribution')}</h4>
              <div className="mt-3">
                <Bars
                  items={data.distribution.map((d) => ({ label: String(d.score), count: d.count }))}
                  colorFor={(i) => scoreColor(i)}
                />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">{t('survey.answers_per_day')}</h4>
              <div className="mt-3 flex h-32 items-end gap-1">
                {data.timeline.map((d) => (
                  <div
                    key={d.day}
                    className="group relative flex-1 rounded-t bg-brand-500/80"
                    style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%` }}
                    title={`${new Date(d.day).toLocaleDateString(localeTag)}: ${t('survey.answers_count', { count: d.count })}${d.avg_score !== null ? ` · Ø ${d.avg_score}` : ''}`}
                  />
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {data.questions
              .filter((q) => q.active || q.answered > 0)
              .map((q) => (
                <QuestionCard key={q.id} q={q} />
              ))}
          </div>
          {data.truncated && (
            <p className="text-xs text-slate-400">{t('survey.latest_5000')}</p>
          )}
        </>
      )}
    </div>
  );
}
