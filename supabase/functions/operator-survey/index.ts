import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-survey
 *
 * Umfrage-Einstellungen und -Auswertung für die Claim-Seite eines Parks.
 *
 *   GET  ?park_id=…                     -> { settings, questions }
 *   GET  ?park_id=…&view=results&days=N -> Auswertung der Antworten
 *   PUT  { park_id, settings, questions } -> speichern
 *
 * Fragen werden nie gelöscht, sondern auf active=false gesetzt: bestehende
 * Antworten verweisen per Fragen-ID auf sie, und die Auswertung braucht den
 * Fragetext auch für Antworten aus der Zeit davor.
 */

const QUESTION_TYPES = ['nps', 'stars', 'yesno', 'choice', 'text'] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];
const MAX_QUESTIONS = 12;

type Localized = Record<string, string>;

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Nur {sprache: text} mit kurzen, nicht leeren Texten. */
function localized(value: unknown, max = 500): Localized {
  const out: Localized = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [lang, v] of Object.entries(value as Record<string, unknown>)) {
      const t = text(v);
      if (t && /^[a-z]{2}$/.test(lang)) out[lang] = t.slice(0, max);
    }
  }
  return out;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Score auf 0-10 normieren (Sterne 1-5 -> 2-10). */
export function normalizeScore(type: QuestionType, value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (type === 'nps') return n >= 0 && n <= 10 ? Math.round(n) : null;
  if (type === 'stars') return n >= 1 && n <= 5 ? Math.round(n) * 2 : null;
  return null;
}

async function loadConfig(parkId: string) {
  const [{ data: settings }, { data: questions }] = await Promise.all([
    supabaseService.from('park_survey_settings').select('*').eq('park_id', parkId).maybeSingle(),
    supabaseService
      .from('park_survey_questions')
      .select('*')
      .eq('park_id', parkId)
      .eq('active', true)
      .order('position', { ascending: true }),
  ]);
  return {
    settings: settings ?? {
      park_id: parkId,
      mode: 'email',
      review_url: null,
      review_min_score: 8,
      intro: {},
      review_text: {},
      thanks_text: {},
    },
    questions: questions ?? [],
  };
}

async function saveConfig(parkId: string, body: Record<string, unknown>) {
  const s = (body.settings ?? {}) as Record<string, unknown>;
  const mode = s.mode === 'survey' ? 'survey' : 'email';
  const reviewUrl = text(s.review_url);
  if (reviewUrl && !isHttpUrl(reviewUrl)) return { error: 'Der Bewertungs-Link muss mit https:// beginnen.' };
  const minScore = Math.min(10, Math.max(0, Math.round(Number(s.review_min_score ?? 8))));

  const rawQuestions = Array.isArray(body.questions) ? (body.questions as Record<string, unknown>[]) : [];
  if (rawQuestions.length > MAX_QUESTIONS) return { error: `Höchstens ${MAX_QUESTIONS} Fragen.` };

  const questions = rawQuestions.map((q, index) => {
    const type = QUESTION_TYPES.includes(q.type as QuestionType) ? (q.type as QuestionType) : 'text';
    return {
      id: text(q.id) || null,
      type,
      position: index,
      prompt: localized(q.prompt, 300),
      options: type === 'choice'
        ? (Array.isArray(q.options) ? q.options : []).slice(0, 10).map((o) => localized(o, 120))
          .filter((o) => Object.keys(o).length > 0)
        : [],
      required: q.required !== false,
      is_score_question: q.is_score_question === true && (type === 'nps' || type === 'stars'),
    };
  });

  if (mode === 'survey') {
    if (questions.length === 0) return { error: 'Im Umfrage-Modus braucht es mindestens eine Frage.' };
    if (questions.some((q) => !q.prompt.de && !q.prompt.en)) {
      return { error: 'Jede Frage braucht einen Text (Deutsch oder Englisch).' };
    }
    if (questions.some((q) => q.type === 'choice' && q.options.length < 2)) {
      return { error: 'Eine Auswahl-Frage braucht mindestens zwei Antworten.' };
    }
  }
  // Höchstens eine Score-Frage: die erste markierte gilt.
  let seenScore = false;
  for (const q of questions) {
    if (q.is_score_question) {
      if (seenScore) q.is_score_question = false;
      seenScore = true;
    }
  }

  const { error: settingsError } = await supabaseService.from('park_survey_settings').upsert({
    park_id: parkId,
    mode,
    review_url: reviewUrl || null,
    review_min_score: minScore,
    intro: localized(s.intro, 600),
    review_text: localized(s.review_text, 400),
    thanks_text: localized(s.thanks_text, 400),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'park_id' });
  if (settingsError) return { error: settingsError.message };

  // Bestehende IDs dieses Parks, damit keine fremde Frage überschrieben wird.
  const { data: existing } = await supabaseService
    .from('park_survey_questions')
    .select('id')
    .eq('park_id', parkId);
  const ownIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const keptIds = new Set<string>();

  for (const q of questions) {
    const row = {
      park_id: parkId,
      position: q.position,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      required: q.required,
      is_score_question: q.is_score_question,
      active: true,
    };
    if (q.id && ownIds.has(q.id)) {
      keptIds.add(q.id);
      const { error } = await supabaseService.from('park_survey_questions').update(row).eq('id', q.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabaseService.from('park_survey_questions').insert(row);
      if (error) return { error: error.message };
    }
  }

  const removed = [...ownIds].filter((id) => !keptIds.has(id));
  if (removed.length > 0) {
    await supabaseService.from('park_survey_questions').update({ active: false }).in('id', removed);
  }

  return { ok: true };
}

async function loadResults(parkId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [{ data: questions }, { data: settings }, { data: rows }] = await Promise.all([
    supabaseService.from('park_survey_questions').select('*').eq('park_id', parkId).order('position'),
    supabaseService.from('park_survey_settings').select('review_min_score, review_url').eq('park_id', parkId)
      .maybeSingle(),
    supabaseService
      .from('park_survey_responses')
      .select('id, answers, score, locale, country_code, review_link_shown, submitted_at')
      .eq('park_id', parkId)
      .gte('submitted_at', since)
      .order('submitted_at', { ascending: false })
      .limit(5000),
  ]);

  const responses = rows ?? [];
  const scored = responses.filter((r: { score: number | null }) => typeof r.score === 'number');
  const promoters = scored.filter((r: { score: number }) => r.score >= 9).length;
  const detractors = scored.filter((r: { score: number }) => r.score <= 6).length;
  const nps = scored.length > 0 ? Math.round(((promoters - detractors) / scored.length) * 100) : null;
  const avgScore = scored.length > 0
    ? Math.round((scored.reduce((sum: number, r: { score: number }) => sum + r.score, 0) / scored.length) * 10) / 10
    : null;

  const distribution = Array.from({ length: 11 }, (_, score) => ({
    score,
    count: scored.filter((r: { score: number }) => r.score === score).length,
  }));

  const byDay = new Map<string, { count: number; sum: number; scored: number }>();
  for (const r of responses as Array<{ submitted_at: string; score: number | null }>) {
    const day = r.submitted_at.slice(0, 10);
    const d = byDay.get(day) ?? { count: 0, sum: 0, scored: 0 };
    d.count += 1;
    if (typeof r.score === 'number') { d.sum += r.score; d.scored += 1; }
    byDay.set(day, d);
  }
  const timeline = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, d]) => ({
    day,
    count: d.count,
    avg_score: d.scored > 0 ? Math.round((d.sum / d.scored) * 10) / 10 : null,
  }));

  const perQuestion = (questions ?? []).map((q: Record<string, unknown>) => {
    const id = String(q.id);
    const type = q.type as QuestionType;
    const values = (responses as Array<{ answers: Record<string, unknown>; score: number | null; submitted_at: string }>)
      .map((r) => ({ v: r.answers?.[id], score: r.score, at: r.submitted_at }))
      .filter((x) => x.v !== undefined && x.v !== null && x.v !== '');
    const base = {
      id,
      type,
      prompt: q.prompt,
      options: q.options,
      active: q.active,
      is_score_question: q.is_score_question,
      answered: values.length,
    };
    if (type === 'nps') {
      return {
        ...base,
        distribution: Array.from({ length: 11 }, (_, n) => ({ value: n, count: values.filter((x) => Number(x.v) === n).length })),
        average: values.length ? Math.round((values.reduce((s, x) => s + Number(x.v), 0) / values.length) * 10) / 10 : null,
      };
    }
    if (type === 'stars') {
      return {
        ...base,
        distribution: [1, 2, 3, 4, 5].map((n) => ({ value: n, count: values.filter((x) => Number(x.v) === n).length })),
        average: values.length ? Math.round((values.reduce((s, x) => s + Number(x.v), 0) / values.length) * 10) / 10 : null,
      };
    }
    if (type === 'yesno') {
      return {
        ...base,
        yes: values.filter((x) => x.v === true || x.v === 'yes').length,
        no: values.filter((x) => x.v === false || x.v === 'no').length,
      };
    }
    if (type === 'choice') {
      const opts = Array.isArray(q.options) ? q.options : [];
      return {
        ...base,
        counts: opts.map((_: unknown, index: number) => ({
          index,
          count: values.filter((x) => Number(x.v) === index).length,
        })),
      };
    }
    return {
      ...base,
      texts: values.slice(0, 100).map((x) => ({ text: String(x.v).slice(0, 1000), score: x.score, at: x.at })),
    };
  });

  return {
    days,
    total: responses.length,
    scored: scored.length,
    average_score: avgScore,
    nps,
    promoters,
    detractors,
    passives: scored.length - promoters - detractors,
    review_link_shown: responses.filter((r: { review_link_shown: boolean }) => r.review_link_shown).length,
    review_min_score: (settings as { review_min_score?: number } | null)?.review_min_score ?? 8,
    distribution,
    timeline,
    questions: perQuestion,
    truncated: responses.length >= 5000,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const parkId = text(url.searchParams.get('park_id'));
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    if (url.searchParams.get('view') === 'results') {
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 730);
      return json({ ok: true, data: await loadResults(auth.parkId, days) });
    }
    return json({ ok: true, data: await loadConfig(auth.parkId) });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const parkId = text(body?.park_id);
    if (!body || !parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const result = await saveConfig(auth.parkId, body);
    if ('error' in result) return json({ error: result.error }, 400);
    return json({ ok: true, data: await loadConfig(auth.parkId) });
  }

  return json({ error: 'Method not allowed' }, 405);
});
