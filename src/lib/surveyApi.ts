import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';

export type Localized = Record<string, string>;
export type QuestionType = 'nps' | 'stars' | 'yesno' | 'choice' | 'text';

export type UnlockMode = 'email' | 'survey' | 'social';
export type FieldLevel = 'off' | 'optional' | 'required';
export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube' | 'whatsapp';

export interface SocialSettings {
  platforms?: SocialPlatform[];
  handle?: string;
  hashtag?: string;
  instructions?: Localized;
  share_text?: Localized;
  giveaway_enabled?: boolean;
  giveaway_text?: Localized;
  post_link?: FieldLevel;
}

export interface SurveySettings {
  park_id: string;
  mode: UnlockMode;
  email_mode: FieldLevel;
  phone_mode: FieldLevel;
  social: SocialSettings;
  review_url: string | null;
  review_min_score: number;
  intro: Localized;
  review_text: Localized;
  thanks_text: Localized;
}

export interface SurveyQuestion {
  /** Fehlt bei neuen, noch nicht gespeicherten Fragen. */
  id?: string;
  type: QuestionType;
  prompt: Localized;
  options: Localized[];
  required: boolean;
  is_score_question: boolean;
}

export interface SurveyConfig {
  settings: SurveySettings;
  questions: SurveyQuestion[];
}

export interface SurveyQuestionResult {
  id: string;
  type: QuestionType;
  prompt: Localized;
  options: Localized[];
  active: boolean;
  is_score_question: boolean;
  answered: number;
  distribution?: { value: number; count: number }[];
  average?: number | null;
  yes?: number;
  no?: number;
  counts?: { index: number; count: number }[];
  texts?: { text: string; score: number | null; at: string }[];
}

export interface SurveyResults {
  days: number;
  total: number;
  scored: number;
  average_score: number | null;
  nps: number | null;
  promoters: number;
  detractors: number;
  passives: number;
  review_link_shown: number;
  review_min_score: number;
  distribution: { score: number; count: number }[];
  timeline: { day: string; count: number; avg_score: number | null }[];
  questions: SurveyQuestionResult[];
  truncated: boolean;
}

/** Text in der gewünschten Sprache, sonst Englisch, Deutsch, irgendeine. */
export function pickLocalized(value: Localized | null | undefined, lang = 'de'): string {
  if (!value) return '';
  return value[lang] || value.en || value.de || Object.values(value)[0] || '';
}

async function call<T>(init: RequestInit, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');

  const params = new URLSearchParams(query);
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-survey?${params.toString()}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body?.data as T;
}

export function fetchSurveyConfig(parkId: string): Promise<SurveyConfig> {
  return call<SurveyConfig>({ method: 'GET' }, { park_id: parkId });
}

export function saveSurveyConfig(parkId: string, config: SurveyConfig): Promise<SurveyConfig> {
  return call<SurveyConfig>(
    {
      method: 'POST',
      body: JSON.stringify({ park_id: parkId, settings: config.settings, questions: config.questions }),
    },
    { park_id: parkId },
  );
}

export function fetchSurveyResults(parkId: string, days: number): Promise<SurveyResults> {
  return call<SurveyResults>({ method: 'GET' }, { park_id: parkId, view: 'results', days: String(days) });
}

/** Startvorlage: Weiterempfehlung + zwei Folgefragen. */
export function defaultQuestions(): SurveyQuestion[] {
  return [
    {
      type: 'nps',
      prompt: {
        de: 'Wie wahrscheinlich ist es, dass du uns weiterempfiehlst?',
        en: 'How likely are you to recommend us to a friend?',
      },
      options: [],
      required: true,
      is_score_question: true,
    },
    {
      type: 'text',
      prompt: { de: 'Was hat dir besonders gefallen oder was können wir besser machen?', en: 'What did you like most, or what could we do better?' },
      options: [],
      required: false,
      is_score_question: false,
    },
  ];
}

/* ------------------------------------------------------------- Modus, Kontakt, Social */

export function setUnlockMode(parkId: string, mode: UnlockMode): Promise<SurveyConfig> {
  return call<SurveyConfig>(
    { method: 'POST', body: JSON.stringify({ park_id: parkId, action: 'set_mode', mode }) },
    { park_id: parkId },
  );
}

export function saveContactSettings(
  parkId: string,
  email_mode: FieldLevel,
  phone_mode: FieldLevel,
): Promise<SurveyConfig> {
  return call<SurveyConfig>(
    { method: 'POST', body: JSON.stringify({ park_id: parkId, action: 'save_contact', email_mode, phone_mode }) },
    { park_id: parkId },
  );
}

export function saveSocialSettings(parkId: string, social: SocialSettings): Promise<SurveyConfig> {
  return call<SurveyConfig>(
    { method: 'POST', body: JSON.stringify({ park_id: parkId, action: 'save_social', social }) },
    { park_id: parkId },
  );
}

export interface SocialEntry {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  giveaway_opt_in: boolean;
  platform: string | null;
  handle: string | null;
  post_url: string | null;
  posted_at: string | null;
  created_at: string;
  country_code: string | null;
}

export interface SocialResults {
  days: number;
  unlocked: number;
  posted: number;
  with_link: number;
  giveaway: number;
  platforms: { platform: string; count: number }[];
  timeline: { day: string; unlocked: number; posted: number }[];
  entries: SocialEntry[];
  truncated: boolean;
}

export function fetchSocialResults(parkId: string, days: number): Promise<SocialResults> {
  return call<SocialResults>({ method: 'GET' }, { park_id: parkId, view: 'social', days: String(days) });
}
