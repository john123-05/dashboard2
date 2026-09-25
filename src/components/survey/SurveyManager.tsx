import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Star, Trash2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import SurveyResultsView from './SurveyResultsView';
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
  nps: 'Weiterempfehlung (0–10)',
  stars: 'Sterne (1–5)',
  yesno: 'Ja / Nein',
  choice: 'Auswahl',
  text: 'Freitext',
};

const inputClass =
  'w-full rounded-lg border border-slate-200/70 bg-white/70 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-400';

function LocalizedField({
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
  const [value, setValue] = useState<number | string | boolean | null>(null);
  const prompt = pickLocalized(q.prompt) || 'Fragetext fehlt';
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
                {v ? 'Ja' : 'Nein'}
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
                {pickLocalized(o) || `Antwort ${i + 1}`}
              </button>
            ))}
          </div>
        )}
        {q.type === 'text' && (
          <textarea rows={2} className={inputClass} placeholder="Antwort des Gastes" onChange={() => setValue('x')} />
        )}
      </div>
    </div>
  );
}

function SurveyPreview({ config }: { config: SurveyConfig }) {
  const { settings, questions } = config;
  const intro = pickLocalized(settings.intro);
  const review = pickLocalized(settings.review_text) || 'Danke! Magst du uns kurz bei Google bewerten?';
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Vorschau für den Gast</p>
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        {intro && <p className="text-sm text-slate-600">{intro}</p>}
        {questions.map((q, i) => (
          <PreviewQuestion key={q.id ?? `new-${i}`} q={q} index={i} />
        ))}
        <button type="button" className="w-full rounded bg-amber-400 px-4 py-2.5 text-sm font-black uppercase italic text-slate-900">
          Foto freischalten
        </button>
        {settings.review_url && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase text-emerald-700">
              Nach der Freischaltung · ab Score {settings.review_min_score}
            </p>
            <p className="mt-1 text-sm text-emerald-900">{review}</p>
            <span className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
              Bei Google bewerten
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Hauptteil */

export default function SurveyManager({ parkId }: { parkId: string }) {
  const [tab, setTab] = useState<'settings' | 'results'>('settings');
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSurveyConfig(parkId)
      .then((c) => {
        if (!active) return;
        setConfig(c);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
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
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
    setSaving(false);
  }

  const scoreQuestion = useMemo(() => config?.questions.find((q) => q.is_score_question), [config]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> wird geladen…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-white/50 p-1">
        {([['settings', 'Einstellungen'], ['results', 'Auswertung']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
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
            <GlassCard className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-slate-800">Vor der Freischaltung</h3>
              <p className="mt-0.5 text-sm text-slate-500">Was müssen Gäste tun, um ihr Foto zu sehen?</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([
                  ['email', 'E-Mail-Adresse angeben', 'Name, E-Mail und Newsletter-Häkchen'],
                  ['survey', 'Umfrage beantworten', 'Ein paar Fragen, danach ist das Foto frei'],
                ] as const).map(([mode, title, sub]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patchSettings({ mode })}
                    className={`rounded-xl border p-4 text-left transition ${
                      config.settings.mode === mode
                        ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-300'
                        : 'border-slate-200/70 bg-white/60 hover:bg-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {config.settings.mode === mode && <Check className="h-4 w-4 text-brand-600" />}
                      {title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{sub}</span>
                  </button>
                ))}
              </div>
            </GlassCard>

            {config.settings.mode === 'survey' && (
              <>
                <GlassCard className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-800">Fragen</h3>
                    {config.questions.length === 0 && (
                      <button
                        type="button"
                        className="glass-button-secondary"
                        onClick={() => change({ ...config, questions: defaultQuestions() })}
                      >
                        Vorlage laden
                      </button>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    <LocalizedField
                      label="Einleitung (optional)"
                      value={config.settings.intro}
                      onChange={(intro) => patchSettings({ intro })}
                      multiline
                    />

                    {config.questions.map((q, index) => (
                      <div key={q.id ?? `new-${index}`} className="rounded-xl border border-slate-200/70 bg-white/60 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-400">Frage {index + 1}</span>
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
                            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                            ))}
                          </select>
                          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={q.required}
                              onChange={(e) => patchQuestion(index, { required: e.target.checked })}
                            />
                            Pflicht
                          </label>
                          <div className="ml-auto flex gap-1">
                            <button type="button" onClick={() => move(index, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Nach oben">
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => move(index, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Nach unten">
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => change({ ...config, questions: config.questions.filter((_, i) => i !== index) })}
                              className="rounded p-1 text-rose-400 hover:bg-rose-50"
                              aria-label="Frage entfernen"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-3">
                          <LocalizedField label="Fragetext" value={q.prompt} onChange={(prompt) => patchQuestion(index, { prompt })} />

                          {q.type === 'choice' && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-slate-600">Antworten (je Zeile eine)</p>
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
                              Diese Frage entscheidet über den Bewertungs-Link
                            </label>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => addQuestion(t)}
                          disabled={config.questions.length >= 12}
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white/50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" /> {TYPE_LABEL[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-5 sm:p-6">
                  <h3 className="text-base font-semibold text-slate-800">Bewertung bei Google</h3>
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-600">Link zur Bewertungsseite</p>
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
                        Link anzeigen ab Score{' '}
                        {scoreQuestion ? '' : <span className="text-amber-600">(keine Score-Frage gewählt – dann sehen alle den Link)</span>}
                      </p>
                      <select
                        value={config.settings.review_min_score}
                        onChange={(e) => patchSettings({ review_min_score: Number(e.target.value) })}
                        className="rounded-lg border border-slate-200/70 bg-white px-3 py-2 text-sm"
                      >
                        {Array.from({ length: 11 }, (_, n) => (
                          <option key={n} value={n}>
                            {n === 0 ? '0 – allen Antwortenden' : `ab ${n}`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <LocalizedField
                      label="Text neben dem Link"
                      value={config.settings.review_text}
                      onChange={(review_text) => patchSettings({ review_text })}
                      multiline
                    />
                    <LocalizedField
                      label="Dankestext (wenn kein Link erscheint)"
                      value={config.settings.thanks_text}
                      onChange={(thanks_text) => patchSettings({ thanks_text })}
                      multiline
                    />
                  </div>
                </GlassCard>
              </>
            )}

            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Speichern
              </button>
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" /> Gespeichert – gilt sofort auf der Claim-Seite
                </span>
              )}
              {dirty && <span className="text-sm text-amber-700">Nicht gespeicherte Änderungen</span>}
            </div>
          </div>

          {config.settings.mode === 'survey' && (
            <div className="xl:sticky xl:top-4 xl:self-start">
              <SurveyPreview config={config} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
