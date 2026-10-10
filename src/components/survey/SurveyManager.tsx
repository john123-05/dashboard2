import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import GlassCard from '../ui/GlassCard';
import { PlanBadge } from '../upgrade/PlanGate';
import { PLAN_LABEL_KEY, useEntitlements } from '../../lib/plans';
import SurveyResultsView from './SurveyResultsView';
import { accentColorForPark, accentTextColorForPark } from '../../lib/parkBrand';
import {
  defaultQuestions,
  fetchSurveyConfig,
  pickLocalized,
  saveSurveyConfig,
  type Localized,
  type QuestionType,
  type SurveyConfig,
  type SurveyQuestion,
} from '../../lib/surveyApi';

const TYPE_LABEL: Record<QuestionType, string> = {
  nps: 'survey.type_nps',
  stars: 'survey.type_stars',
  yesno: 'survey.type_yesno',
  choice: 'survey.type_choice',
  text: 'survey.type_text',
};

export const inputClass =
  'w-full rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400';

export function LocalizedField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: Localized;
  onChange: (next: Localized) => void;
  multiline?: boolean;
}) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['de', 'en'] as const).map((lang) => (
          <div key={lang} className="relative">
            <Tag
              value={value[lang] ?? ''}
              onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              placeholder={lang === 'de' ? 'Deutsch' : 'English'}
              className={inputClass}
              {...(multiline ? { rows: 2 } : {})}
            />
            <span className="pointer-events-none absolute right-2 top-2 text-[10px] font-semibold uppercase text-slate-300">
              {lang}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Vorschau */

function PreviewQuestion({ q, index }: { q: SurveyQuestion; index: number }) {
  const { t } = useI18n();
  const [value, setValue] = useState<number | string | boolean | null>(null);
  const prompt = pickLocalized(q.prompt) || t('survey.question_missing');
  return (
    <div className="rounded-lg border border-slate-200/70 bg-white p-3">
      <p className="text-sm font-semibold text-slate-800">
        {index + 1}. {prompt}
        {q.required && <span className="text-rose-500"> *</span>}
      </p>
      <div className="mt-2">
        {q.type === 'nps' && (
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setValue(n)}
                className={`h-8 w-8 rounded text-xs font-semibold ${
                  value === n ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {q.type === 'stars' && (
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setValue(n)}>
                <Star
                  className={`h-6 w-6 ${typeof value === 'number' && n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                />
              </button>
            ))}
          </div>
        )}
        {q.type === 'yesno' && (
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setValue(v)}
                className={`rounded px-4 py-1.5 text-sm font-medium ${
                  value === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {v ? t('survey.yes') : t('survey.no')}
              </button>
            ))}
          </div>
        )}
        {q.type === 'choice' && (
          <div className="space-y-1">
            {q.options.map((o, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setValue(i)}
                className={`block w-full rounded px-3 py-1.5 text-left text-sm ${
                  value === i ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {pickLocalized(o) || t('survey.answer_n', { n: i + 1 })}
              </button>
            ))}
          </div>
        )}
        {q.type === 'text' && (
          <textarea rows={2} className={inputClass} placeholder={t('survey.guest_answer_placeholder')} onChange={() => setValue('x')} />
        )}
      </div>
    </div>
  );
}

function SurveyPreview({
  config,
  accentColor,
  accentTextColor,
}: {
  config: SurveyConfig;
  accentColor: string;
  accentTextColor: string;
}) {
  const { t } = useI18n();
  const { settings, questions } = config;
  const intro = pickLocalized(settings.intro);
  const review = pickLocalized(settings.review_text) || t('survey.default_review_text');
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-[color:var(--ink-3)]">{t('survey.preview_for_guest')}</p>
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {intro && <p className="text-sm text-slate-600">{intro}</p>}
        {questions.map((q, i) => (
          <PreviewQuestion key={q.id ?? `new-${i}`} q={q} index={i} />
        ))}
        <button
          type="button"
          style={{ backgroundColor: accentColor, color: accentTextColor }}
          className="w-full rounded px-4 py-2.5 text-sm font-black uppercase italic"
        >
          {t('survey.unlock_photo')}
        </button>
        {settings.review_url && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              {t('survey.after_unlock_min_score', { score: settings.review_min_score })}
            </p>
            <p className="mt-1 text-sm text-emerald-900">{review}</p>
            <span className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
              {t('survey.rate_on_google')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Hauptteil */

export default function SurveyManager({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'settings' | 'results'>('results');
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const entitlements = useEntitlements();

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSurveyConfig(parkId)
      .then((c) => {
        if (!active) return;
        setConfig(c);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : t('survey.load_failed')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  function change(next: SurveyConfig) {
    setConfig(next);
    setDirty(true);
    setSaved(false);
  }

  const patchSettings = (patch: Partial<SurveyConfig['settings']>) =>
    config && change({ ...config, settings: { ...config.settings, ...patch } });

  const patchQuestion = (index: number, patch: Partial<SurveyQuestion>) =>
    config &&
    change({
      ...config,
      questions: config.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });

  function setScoreQuestion(index: number) {
    if (!config) return;
    change({
      ...config,
      questions: config.questions.map((q, i) => ({ ...q, is_score_question: i === index })),
    });
  }

  function move(index: number, dir: -1 | 1) {
    if (!config) return;
    const target = index + dir;
    if (target < 0 || target >= config.questions.length) return;
    const list = [...config.questions];
    [list[index], list[target]] = [list[target], list[index]];
    change({ ...config, questions: list });
  }

  function reorder(from: number, to: number) {
    if (!config || from === to || from < 0 || to < 0 || to >= config.questions.length) return;
    const list = [...config.questions];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    change({ ...config, questions: list });
  }

  function addTemplate(key: 'satisfaction' | 'source' | 'improve') {
    if (!config || config.questions.length >= 12) return;
    const hasScore = config.questions.some((q) => q.is_score_question);
    const base = { required: false, is_score_question: false, options: [] as Localized[] };
    const question: SurveyQuestion =
      key === 'satisfaction'
        ? { ...base, type: 'stars', prompt: { de: 'Wie zufrieden warst du?', en: 'How satisfied were you?' }, required: true, is_score_question: !hasScore }
        : key === 'source'
          ? {
              ...base,
              type: 'choice',
              prompt: { de: 'Wie hast du von uns erfahren?', en: 'How did you hear about us?' },
              options: [
                { de: 'Empfehlung', en: 'Recommendation' },
                { de: 'Social Media', en: 'Social media' },
                { de: 'Internet', en: 'Internet' },
                { de: 'Vor Ort', en: 'On site' },
              ],
            }
          : { ...base, type: 'text', prompt: { de: 'Was können wir besser machen?', en: 'What can we do better?' } };
    change({ ...config, questions: [...config.questions, question] });
  }

  function addQuestion(type: QuestionType) {
    if (!config) return;
    const hasScore = config.questions.some((q) => q.is_score_question);
    change({
      ...config,
      questions: [
        ...config.questions,
        {
          type,
          prompt: {},
          options: type === 'choice' ? [{ de: '', en: '' }, { de: '', en: '' }] : [],
          required: type !== 'text',
          is_score_question: !hasScore && (type === 'nps' || type === 'stars'),
        },
      ],
    });
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveSurveyConfig(parkId, config);
      setConfig(next);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('survey.save_failed'));
    }
    setSaving(false);
  }

  // Bestandsschutz: Parks mit bereits eingetragenem Bewertungslink behalten die Einstellung.
  const reviewUnlocked = entitlements.loading || entitlements.has('review_routing') || Boolean(config?.settings.review_url?.trim());
  const scoreQuestion = useMemo(() => config?.questions.find((q) => q.is_score_question), [config]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> {t('survey.loading')}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {([['results', t('survey.tab_results')], ['settings', t('survey.tab_settings')]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              tab === key ? 'bg-white text-[color:var(--ink)] shadow-sm' : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {tab === 'results' && <SurveyResultsView parkId={parkId} />}

      {tab === 'settings' && config && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            {(
              <>
                <GlassCard className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-800">{t('survey.questions')}</h3>
                    {config.questions.length === 0 && (
                      <button
                        type="button"
                        className="glass-button-secondary"
                        onClick={() => change({ ...config, questions: defaultQuestions() })}
                      >
                        {t('survey.load_template')}
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    <LocalizedField
                      label={t('survey.intro_optional')}
                      value={config.settings.intro}
                      onChange={(intro) => patchSettings({ intro })}
                      multiline
                    />

                    {config.questions.map((q, index) => (
                      <div
                        key={q.id ?? `new-${index}`}
                        onDragOver={(e) => dragIndex !== null && e.preventDefault()}
                        onDrop={() => {
                          if (dragIndex !== null) reorder(dragIndex, index);
                          setDragIndex(null);
                        }}
                        className={`rounded-xl border bg-slate-50 p-4 ${dragIndex === index ? 'border-brand-300 opacity-60' : 'border-[color:var(--line)]'}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            draggable
                            onDragStart={() => setDragIndex(index)}
                            onDragEnd={() => setDragIndex(null)}
                            title={t('survey.drag_hint')}
                            aria-hidden
                            className="-ml-1 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-semibold text-slate-400">{t('survey.question_n', { n: index + 1 })}</span>
                          <select
                            value={q.type}
                            onChange={(e) => {
                              const type = e.target.value as QuestionType;
                              patchQuestion(index, {
                                type,
                                options: type === 'choice' && q.options.length < 2 ? [{ de: '', en: '' }, { de: '', en: '' }] : q.options,
                                is_score_question: type === 'nps' || type === 'stars' ? q.is_score_question : false,
                              });
                            }}
                            className="rounded-lg border border-slate-200/70 bg-white px-2 py-1 text-sm"
                          >
                            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((typeKey) => (
                              <option key={typeKey} value={typeKey}>{t(TYPE_LABEL[typeKey])}</option>
                            ))}
                          </select>
                          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => patchQuestion(index, { required: e.target.checked })}
                            />
                            {t('survey.required')}
                          </label>
                          <div className="ml-auto flex gap-1">
                            <button type="button" onClick={() => move(index, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label={t('survey.move_up')}>
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => move(index, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label={t('survey.move_down')}>
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => change({ ...config, questions: config.questions.filter((_, i) => i !== index) })}
                              className="rounded p-1 text-rose-400 hover:bg-rose-50"
                              aria-label={t('survey.remove_question')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          <LocalizedField label={t('survey.question_text')} value={q.prompt} onChange={(prompt) => patchQuestion(index, { prompt })} />

                          {q.type === 'choice' && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-slate-600">{t('survey.answers_per_line')}</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(['de', 'en'] as const).map((lang) => (
                                  <textarea
                                    key={lang}
                                    rows={Math.max(3, q.options.length)}
                                    className={inputClass}
                                    placeholder={lang === 'de' ? 'Deutsch' : 'English'}
                                    value={q.options.map((o) => o[lang] ?? '').join('\n')}
                                    onChange={(e) => {
                                      const lines = e.target.value.split('\n');
                                      const count = Math.max(lines.length, q.options.length);
                                      patchQuestion(index, {
                                        options: Array.from({ length: count }, (_, i) => ({
                                          ...(q.options[i] ?? {}),
                                          [lang]: lines[i] ?? '',
                                        })),
                                      });
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {(q.type === 'nps' || q.type === 'stars') && (
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="radio"
                                name="score-question"
                                checked={q.is_score_question}
                                onChange={() => setScoreQuestion(index)}
                              />
                              {t('survey.score_question_decides')}
                            </label>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[color:var(--ink-3)]">{t('survey.templates')}:</span>
                      {([['satisfaction', 'survey.tpl_satisfaction'], ['source', 'survey.tpl_source'], ['improve', 'survey.tpl_improve']] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => addTemplate(key)}
                          disabled={config.questions.length >= 12}
                          className="rounded-full border border-[color:var(--line-strong)] px-3 py-1 text-xs font-medium text-[color:var(--ink-2)] hover:bg-slate-100 disabled:opacity-40"
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(TYPE_LABEL) as QuestionType[]).map((typeKey) => (
                        <button
                          key={typeKey}
                          type="button"
                          onClick={() => addQuestion(typeKey)}
                          disabled={config.questions.length >= 12}
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[color:var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-2)] hover:bg-slate-50 disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" /> {t(TYPE_LABEL[typeKey])}
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                {reviewUnlocked ? (
                <GlassCard className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-800">{t('survey.google_review')}</h3>
                    <PlanBadge feature="review_routing" />
                  </div>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-600">{t('survey.review_link')}</p>
                      <input
                        type="url"
                        value={config.settings.review_url ?? ''}
                        onChange={(e) => patchSettings({ review_url: e.target.value })}
                        placeholder="https://g.page/r/…/review"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-600">
                        {t('survey.show_link_from_score')}{' '}
                        {scoreQuestion ? '' : <span className="text-amber-600">{t('survey.no_score_question')}</span>}
                      </p>
                      <select
                        value={config.settings.review_min_score}
                        onChange={(e) => patchSettings({ review_min_score: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm"
                      >
                        {Array.from({ length: 11 }, (_, n) => (
                          <option key={n} value={n}>
                            {n === 0 ? t('survey.min_score_all') : t('survey.min_score_from', { n })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <LocalizedField
                      label={t('survey.text_next_to_link')}
                      value={config.settings.review_text}
                      onChange={(review_text) => patchSettings({ review_text })}
                      multiline
                    />
                    <LocalizedField
                      label={t('survey.thanks_text')}
                      value={config.settings.thanks_text}
                      onChange={(thanks_text) => patchSettings({ thanks_text })}
                      multiline
                    />
                  </div>
                </GlassCard>
                ) : (
                <GlassCard className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-slate-800">{t('survey.google_review')}</h3>
                    <PlanBadge feature="review_routing" />
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--ink-2)]">
                    {t('plans.gate_text', { plan: t(PLAN_LABEL_KEY.marketing_pro) })}
                  </p>
                  <Link to="/plaene" className="glass-button-primary mt-4 inline-flex">
                    {t('shop.view_plans')}
                  </Link>
                </GlassCard>
                )}
              </>
            )}

            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('survey.save')}
              </button>
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" /> {t('survey.saved_live')}
                </span>
              )}
              {dirty && <span className="text-sm text-amber-700">{t('survey.unsaved')}</span>}
            </div>
          </div>

          {(
            <div className="xl:sticky xl:top-4 xl:self-start">
              <SurveyPreview
                config={config}
                accentColor={accentColorForPark(parkId)}
                accentTextColor={accentTextColorForPark(parkId)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
