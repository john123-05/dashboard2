import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportToCSV } from '../../lib/utils';
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
    <GlassCard className="px-4 py-3">
      <p className="text-xs text-[color:var(--ink-3)]">{label}</p>
      <p className="mt-1 text-[28px] font-light tabular-nums tracking-tight text-[color:var(--ink)]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">{sub}</p>}
    </GlassCard>
  );
}

function QuestionCard({ q }: { q: SurveyQuestionResult }) {
  const { t } = useI18n();
  const localeTag = useLocaleTag();
  const [search, setSearch] = useState('');
  const texts = (q.texts ?? []).filter((entry) => entry.text.toLowerCase().includes(search.trim().toLowerCase()));
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
          <>
            {(q.texts ?? []).length > 4 && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('table.search')}
                  className="glass-input py-1.5 pl-9 pr-3 text-sm"
                />
              </div>
            )}
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(q.texts ?? []).length === 0 && <li className="text-sm text-slate-400">{t('survey.no_answers_yet')}</li>}
            {texts.map((entry, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {entry.text}
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {new Date(entry.at).toLocaleDateString(localeTag)}
                  {typeof entry.score === 'number' && ` · ${t('survey.score_n', { n: entry.score })}`}
                </span>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </GlassCard>
  );
}

export default function SurveyResultsView({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const localeTag = useLocaleTag();
  const [days, setDays] = useState<number>(30);
  const [locale, setLocale] = useState('');
  const [country, setCountry] = useState('');
  const [options, setOptions] = useState<{ languages: string[]; countries: string[] }>({ languages: [], countries: [] });
  const [data, setData] = useState<SurveyResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSurveyResults(parkId, days, { locale, country })
      .then((r) => {
        if (!active) return;
        setData(r);
        // Auswahllisten nur aus der ungefilterten Abfrage übernehmen, damit sie nicht schrumpfen.
        if (!locale && !country) setOptions({ languages: r.languages ?? [], countries: r.countries ?? [] });
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : t('survey.load_failed')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId, days, locale, country]);

  const npsTotal = data ? data.promoters + data.passives + data.detractors : 0;
  const maxDay = Math.max(1, ...(data?.timeline ?? []).map((d) => d.count));

  // Ø Score je Kalenderwoche (Montag), gewichtet mit der Zahl der Antworten je Tag.
  const weekly = useMemo(() => {
    const weeks = new Map<string, { sum: number; weight: number }>();
    for (const d of data?.timeline ?? []) {
      if (d.avg_score === null) continue;
      const date = new Date(d.day);
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      const entry = weeks.get(key) ?? { sum: 0, weight: 0 };
      entry.sum += d.avg_score * d.count;
      entry.weight += d.count;
      weeks.set(key, entry);
    }
    return Array.from(weeks.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({
        week: new Date(week).toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit' }),
        score: Math.round((v.sum / v.weight) * 10) / 10,
      }));
  }, [data, localeTag]);

  function exportAnswers() {
    if (!data) return;
    const rows: Record<string, unknown>[] = [];
    for (const q of data.questions) {
      const question = pickLocalized(q.prompt);
      if (q.type === 'text') {
        for (const entry of q.texts ?? []) rows.push({ question, answer: entry.text, count: 1, score: entry.score ?? '', date: entry.at });
      } else if (q.distribution) {
        for (const d of q.distribution) rows.push({ question, answer: d.value, count: d.count, score: '', date: '' });
      } else if (q.type === 'yesno') {
        rows.push({ question, answer: t('survey.yes'), count: q.yes ?? 0, score: '', date: '' });
        rows.push({ question, answer: t('survey.no'), count: q.no ?? 0, score: '', date: '' });
      } else if (q.counts) {
        for (const c of q.counts) rows.push({ question, answer: pickLocalized(q.options[c.index]), count: c.count, score: '', date: '' });
      }
    }
    exportToCSV(rows, `umfrage-${days}-tage.csv`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('survey.results_intro')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setDays(p.days)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  days === p.days ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
                }`}
              >
                {t(p.label)}
              </button>
            ))}
          </div>
          {options.languages.length > 1 && (
            <select value={locale} onChange={(e) => setLocale(e.target.value)} className="rounded-lg border border-[color:var(--line-strong)] bg-white px-2.5 py-1.5 text-sm text-[color:var(--ink-2)]">
              <option value="">{t('email.all_languages')}</option>
              {options.languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
          )}
          {options.countries.length > 1 && (
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-[color:var(--line-strong)] bg-white px-2.5 py-1.5 text-sm text-[color:var(--ink-2)]">
              <option value="">{t('survey.all_countries')}</option>
              {options.countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={exportAnswers}
            disabled={!data || data.total === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--line-strong)] px-3 py-1.5 text-sm font-medium text-[color:var(--ink-2)] hover:bg-slate-100 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            {t('leads.export')}
          </button>
        </div>
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <GlassCard className="p-5">
              <p className="text-xs text-[color:var(--ink-3)]">NPS</p>
              <p className="mt-1 text-[48px] font-light leading-none tracking-tight text-[color:var(--ink)]">
                {data.nps === null ? '–' : String(data.nps)}
              </p>
              {npsTotal > 0 && (
                <>
                  <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <span className="bg-emerald-500" style={{ width: `${(data.promoters / npsTotal) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${(data.passives / npsTotal) * 100}%` }} />
                    <span className="bg-rose-500" style={{ width: `${(data.detractors / npsTotal) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ink-2)]">
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />{t('survey.promoters_label')} {data.promoters}</span>
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />{t('survey.passives_label')} {data.passives}</span>
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />{t('survey.detractors_label')} {data.detractors}</span>
                  </div>
                </>
              )}
            </GlassCard>
            <Kpi label={t('survey.kpi_answers')} value={String(data.total)} sub={data.average_score === null ? undefined : `${t('survey.kpi_avg_score')}: ${data.average_score}`} />
            <Kpi
              label={t('survey.kpi_link_shown')}
              value={String(data.review_link_shown)}
              sub={t('survey.from_score', { n: data.review_min_score })}
            />
          </div>

          {weekly.length > 1 && (
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-[color:var(--ink)]">{t('survey.score_by_week')}</h4>
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weekly} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="#dfe3eb" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#5c6f82' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#5c6f82' }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#c2410c" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlassCard>
          )}

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
