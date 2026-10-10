// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-survey/index.ts (erzeugt mit scripts/build-paste.py)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';


// For functions deployed directly onto the shared LiftPictures production
// project (kvpcwlcfgmsmarjtwpsx) — admin_users lives right here, so no
// cross-project lookup is needed (contrast with ../staffAuth.ts, which is
// for functions deployed on dashboard2's own project that need to verify
// staff membership against that other project instead).
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  const { data: adminRow, error: adminError } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false, status: 500, message: adminError.message };
  }

  if (!adminRow) {
    return { ok: false, status: 403, message: 'Not an admin user' };
  }

  return { ok: true, userId: userData.user.id };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export const LEAD_TEMPERATURES = ['heiss', 'warm', 'kalt'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export function isValidTemperature(value: unknown): value is LeadTemperature {
  return typeof value === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(value);
}


const OPERATOR_SUPABASE_URL = Deno.env.get("OPERATOR_SUPABASE_URL") ??
  "https://xcrxltiiovpoladpaewd.supabase.co";
const OPERATOR_SUPABASE_ANON_KEY = Deno.env.get("OPERATOR_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ";

export type OperatorAuthResult =
  | { ok: true; userId: string; parkId: string; organizationId: string | null }
  | { ok: false; status: number; message: string };

type OperatorUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

function normalizeParkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getAllowedParkIds(user: OperatorUser | null): string[] {
  const metadata = user?.app_metadata ?? {};
  return normalizeParkIds(metadata.allowed_park_ids ?? metadata.park_ids);
}

async function fetchOperatorUser(token: string): Promise<OperatorUser | null> {
  const response = await fetch(`${OPERATOR_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: OPERATOR_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id
    ? { id: String(user.id), app_metadata: user.app_metadata ?? null }
    : null;
}

async function fetchAccessiblePark(
  token: string,
  parkId: string,
): Promise<{ id: string; organization_id: string | null } | null> {
  const response = await fetch(
    `${OPERATOR_SUPABASE_URL}/rest/v1/parks?select=id,organization_id&id=eq.${
      encodeURIComponent(parkId)
    }`,
    {
      headers: {
        apikey: OPERATOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id
    ? {
      id: String(row.id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
    }
    : null;
}

async function requireOperatorForParkBase(
  req: Request,
  parkId: string,
): Promise<OperatorAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  const user = await fetchOperatorUser(token);
  if (!user) {
    // Kein Betreiber-Token: im Staff-CRM kommt das Token des gemeinsamen Projekts.
    // Staff (admin_users) darf jeden Park sehen.
    const staff = await requireAdminFromRequest(req);
    if (staff.ok) {
      const { data: park } = await supabaseService
        .from("parks")
        .select("id, organization_id")
        .eq("id", parkId)
        .maybeSingle();
      if (!park) return { ok: false, status: 404, message: "Park not found" };
      return {
        ok: true,
        userId: staff.userId,
        parkId: String(park.id),
        organizationId: park.organization_id ? String(park.organization_id) : null,
      };
    }
    return { ok: false, status: 401, message: "Invalid operator auth token" };
  }

  const allowedParkIds = getAllowedParkIds(user);
  if (allowedParkIds.length > 0 && !allowedParkIds.includes(parkId)) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  const park = await fetchAccessiblePark(token, parkId);
  if (!park) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  return {
    ok: true,
    userId: user.id,
    parkId: park.id,
    organizationId: park.organization_id,
  };
}

/**
 * Prüft zusätzlich die Seitenrechte eines Mitarbeiters (docs/PRODUKT_PLAN.md, H3).
 * `pages`: Seiten-Schlüssel (wie src/lib/permissions.ts), von denen eine reichen muss.
 * Nur Mitarbeiter mit eigener Seitenauswahl (`allowed_pages` gesetzt) oder deaktiviertem Zugang
 * werden abgewiesen; Inhaber, Staff-Admins und Mitarbeiter ohne Auswahl bleiben wie bisher.
 * Schlägt die Abfrage fehl, wird NICHT gesperrt (kein Aussperren durch einen Ausfall).
 */
export async function requireOperatorForPark(
  req: Request,
  parkId: string,
  pages?: string[],
): Promise<OperatorAuthResult> {
  const auth = await requireOperatorForParkBase(req, parkId);
  if (!auth.ok || !pages || pages.length === 0) return auth;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return auth;
  try {
    const response = await fetch(
      `${OPERATOR_SUPABASE_URL}/rest/v1/organization_memberships?select=role,allowed_pages,disabled_at&user_id=eq.${
        encodeURIComponent(auth.userId)
      }`,
      { headers: { apikey: OPERATOR_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return auth; // Staff-Admin (anderes Projekt) oder Ausfall
    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return auth;
    if (row.disabled_at) return { ok: false, status: 403, message: "Access disabled" };
    if (row.role === "staff" && Array.isArray(row.allowed_pages)) {
      const allowed = row.allowed_pages as string[];
      if (!pages.some((page) => allowed.includes(page))) {
        return { ok: false, status: 403, message: "No permission for this page" };
      }
    }
  } catch {
    // bewusst offen: ein Ausfall darf niemanden aussperren
  }
  return auth;
}


/**
 * operator-survey
 *
 * Umfrage-Einstellungen und -Auswertung für die Claim-Seite eines Parks.
 *
 *   GET  ?park_id=…                     -> { settings, questions }
 *   GET  ?park_id=…&view=results&days=N -> Auswertung der Umfrage
 *   GET  ?park_id=…&view=social&days=N  -> Auswertung der Social-Media-Freischaltungen
 *   POST { park_id, settings, questions } -> Umfrage speichern (ohne Modus/Kontakt/Social)
 *   POST { park_id, action: 'set_mode', mode }         -> was Gäste zum Freischalten tun
 *   POST { park_id, action: 'save_contact', email_mode, phone_mode, address_mode }
 *   POST { park_id, action: 'save_social', social }
 *   GET  ?park_id=…&view=tracking -> independent ad-tag settings
 *   POST { park_id, action: 'save_tracking', tracking }
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
      email_mode: 'required',
      phone_mode: 'off',
      address_mode: 'off',
      social: {},
    },
    questions: questions ?? [],
  };
}

async function saveConfig(parkId: string, body: Record<string, unknown>) {
  const s = (body.settings ?? {}) as Record<string, unknown>;
  // Der Modus (und Kontakt/Social) hat eigene Aktionen; diese Speicherung fasst
  // nur die Umfrage an. Ist die Umfrage gerade aktiv, gelten die strengen Prüfungen.
  const { data: current } = await supabaseService
    .from('park_survey_settings').select('mode').eq('park_id', parkId).maybeSingle();
  const mode = current?.mode === 'survey' ? 'survey' : 'off';
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

type Level = 'off' | 'optional' | 'required';
const LEVELS: Level[] = ['off', 'optional', 'required'];
const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'whatsapp'];

function level(value: unknown, fallback: Level): Level {
  return LEVELS.includes(value as Level) ? (value as Level) : fallback;
}

async function setMode(parkId: string, modeRaw: unknown) {
  const mode = modeRaw === 'survey' ? 'survey' : modeRaw === 'social' ? 'social' : modeRaw === 'email' ? 'email' : null;
  if (!mode) return { error: 'Unbekannter Modus.' };

  if (mode === 'survey') {
    const { data: questions } = await supabaseService
      .from('park_survey_questions').select('prompt').eq('park_id', parkId).eq('active', true);
    if (!questions || questions.length === 0) {
      return { error: 'Für die Umfrage fehlen noch Fragen. Lege sie im Reiter „Umfrage“ an und speichere sie.' };
    }
  }
  if (mode === 'email') {
    const { data: cur } = await supabaseService
      .from('park_survey_settings').select('email_mode, phone_mode').eq('park_id', parkId).maybeSingle();
    if ((cur?.email_mode ?? 'required') === 'off' && (cur?.phone_mode ?? 'off') === 'off') {
      return { error: 'Im Reiter „Kontakte“ muss E-Mail oder Telefon abgefragt werden.' };
    }
  }
  const { error } = await supabaseService.from('park_survey_settings').upsert(
    { park_id: parkId, mode, updated_at: new Date().toISOString() },
    { onConflict: 'park_id' },
  );
  return error ? { error: error.message } : { ok: true };
}

async function saveContact(parkId: string, body: Record<string, unknown>) {
  const email = level(body.email_mode, 'required');
  const phone = level(body.phone_mode, 'off');
  const address = level(body.address_mode, 'off');
  const { data: cur } = await supabaseService
    .from('park_survey_settings').select('mode').eq('park_id', parkId).maybeSingle();
  if ((cur?.mode ?? 'email') === 'email' && email === 'off' && phone === 'off') {
    return { error: 'Im E-Mail-Modus muss mindestens E-Mail oder Telefon abgefragt werden.' };
  }
  const { error } = await supabaseService.from('park_survey_settings').upsert(
    { park_id: parkId, email_mode: email, phone_mode: phone, address_mode: address, updated_at: new Date().toISOString() },
    { onConflict: 'park_id' },
  );
  return error ? { error: error.message } : { ok: true };
}

async function saveSocial(parkId: string, body: Record<string, unknown>) {
  const raw = (body.social ?? {}) as Record<string, unknown>;
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : [])
    .map((p) => String(p)).filter((p) => PLATFORMS.includes(p));
  const handle = text(raw.handle).slice(0, 80);
  const hashtag = text(raw.hashtag).slice(0, 80);
  const social = {
    platforms,
    handle: handle && !handle.startsWith('@') ? `@${handle}` : handle,
    hashtag: hashtag && !hashtag.startsWith('#') ? `#${hashtag}` : hashtag,
    instructions: localized(raw.instructions, 600),
    share_text: localized(raw.share_text, 300),
    giveaway_enabled: raw.giveaway_enabled === true,
    giveaway_text: localized(raw.giveaway_text, 600),
    post_link: level(raw.post_link, 'optional'),
  };
  const { error } = await supabaseService.from('park_survey_settings').upsert(
    { park_id: parkId, social, updated_at: new Date().toISOString() },
    { onConflict: 'park_id' },
  );
  return error ? { error: error.message } : { ok: true };
}

async function loadTracking(parkId: string) {
  const { data, error } = await supabaseService.from('park_tracking_settings')
    .select('enabled, meta_pixel_id, google_ads_id').eq('park_id', parkId).maybeSingle();
  if (error) return { error: error.message };
  return { data: data ?? { enabled: false, meta_pixel_id: '', google_ads_id: '' } };
}

async function saveTracking(parkId: string, body: Record<string, unknown>) {
  const raw = body.tracking;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Pixel-Einstellungen fehlen.' };
  const input = raw as Record<string, unknown>;
  const metaPixelId = typeof input.meta_pixel_id === 'string' ? input.meta_pixel_id.trim() : '';
  const googleAdsId = typeof input.google_ads_id === 'string' ? input.google_ads_id.trim().toUpperCase() : '';
  const enabled = input.enabled === true;
  if (metaPixelId && !/^[0-9]{8,20}$/.test(metaPixelId)) return { error: 'Die Meta-Pixel-ID muss aus 8 bis 20 Ziffern bestehen.' };
  if (googleAdsId && !/^AW-[0-9]{6,20}$/.test(googleAdsId)) return { error: 'Die Google Ads-ID muss mit AW- beginnen und danach 6 bis 20 Ziffern haben.' };
  if (enabled && !metaPixelId && !googleAdsId) return { error: 'Zum Aktivieren ist mindestens eine Pixel-ID nötig.' };
  const { error } = await supabaseService.from('park_tracking_settings').upsert({
    park_id: parkId,
    enabled,
    meta_pixel_id: metaPixelId,
    google_ads_id: googleAdsId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'park_id' });
  return error ? { error: error.message } : { ok: true };
}

async function loadSocialResults(parkId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabaseService
    .from('park_social_entries')
    .select('id, name, email, phone, giveaway_opt_in, platform, handle, post_url, posted_at, created_at, country_code')
    .eq('park_id', parkId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3000);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const posted = rows.filter((r) => r.posted_at);
  const byPlatform = new Map<string, number>();
  for (const r of posted) {
    const p = text(r.platform, 'sonstige');
    byPlatform.set(p, (byPlatform.get(p) ?? 0) + 1);
  }
  const byDay = new Map<string, { unlocked: number; posted: number }>();
  for (const r of rows) {
    const day = String(r.created_at).slice(0, 10);
    const d = byDay.get(day) ?? { unlocked: 0, posted: 0 };
    d.unlocked += 1;
    if (r.posted_at) d.posted += 1;
    byDay.set(day, d);
  }
  return {
    days,
    unlocked: rows.length,
    posted: posted.length,
    with_link: rows.filter((r) => r.post_url).length,
    giveaway: rows.filter((r) => r.giveaway_opt_in).length,
    platforms: [...byPlatform.entries()].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count),
    timeline: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, d]) => ({ day, ...d })),
    entries: rows.slice(0, 200),
    truncated: rows.length >= 3000,
  };
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
    const auth = await requireOperatorForPark(req, parkId, ['marketing']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    if (url.searchParams.get('view') === 'results') {
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 730);
      return json({ ok: true, data: await loadResults(auth.parkId, days) });
    }
    if (url.searchParams.get('view') === 'social') {
      const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 730);
      return json({ ok: true, data: await loadSocialResults(auth.parkId, days) });
    }
    if (url.searchParams.get('view') === 'tracking') {
      const result = await loadTracking(auth.parkId);
      return 'error' in result ? json({ error: result.error }, 500) : json({ ok: true, data: result.data });
    }
    return json({ ok: true, data: await loadConfig(auth.parkId) });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const parkId = text(body?.park_id);
    if (!body || !parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId, ['marketing']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const action = text(body.action);
    const result = action === 'save_tracking'
      ? await saveTracking(auth.parkId, body)
      : action === 'set_mode'
      ? await setMode(auth.parkId, body.mode)
      : action === 'save_contact'
        ? await saveContact(auth.parkId, body)
        : action === 'save_social'
          ? await saveSocial(auth.parkId, body)
          : await saveConfig(auth.parkId, body);
    if ('error' in result) return json({ error: result.error }, 400);
    if (action === 'save_tracking') {
      const tracking = await loadTracking(auth.parkId);
      return 'error' in tracking ? json({ error: tracking.error }, 500) : json({ ok: true, data: tracking.data });
    }
    return json({ ok: true, data: await loadConfig(auth.parkId) });
  }

  return json({ error: 'Method not allowed' }, 405);
});
