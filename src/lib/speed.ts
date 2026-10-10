import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

// Speedmessung im Dashboard (docs/AUSBAU_PLAN.md, SP3/SP4): Function `operator-speed`.

export type SpeedPeriod = 'day' | 'week' | 'month' | 'all';

export interface SpeedSettings {
  headline: string;
  subline: string;
  cta_title: string;
  cta_text: string;
  winner_text: string;
  instagram_handle: string;
  hashtag: string;
  prize_text: string;
  show_qr: boolean;
  auto_scroll: boolean;
  rows: number;
  max_speed_kmh: number | null;
  periods: SpeedPeriod[];
}

export interface SpeedRow {
  id: string;
  rank: number;
  speedKmh: number;
  capturedAt: string;
  day: string;
  email: string;
  claimId: string | null;
  hidden: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface SpeedOverview {
  enabled: boolean;
  period: SpeedPeriod;
  date: string;
  today: string;
  from: string | null;
  to: string | null;
  rows: SpeedRow[];
  total: number;
  stats: { count: number; fastest: number | null; slowest: number | null; average: number | null };
  settings: SpeedSettings;
}

const ENDPOINT = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-speed`;

async function call<T>(init: RequestInit, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams(query).toString()}`, {
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

const post = <T,>(parkId: string, payload: Record<string, unknown>) =>
  call<T>({ method: 'POST', body: JSON.stringify({ park_id: parkId, ...payload }) }, { park_id: parkId });

export const fetchSpeedOverview = (parkId: string, period: SpeedPeriod, date: string) =>
  call<SpeedOverview>({ method: 'GET' }, { park_id: parkId, period, ...(date ? { date } : {}) });
export const saveSpeedSettings = (parkId: string, settings: SpeedSettings) =>
  post<{ settings: SpeedSettings }>(parkId, { action: 'save_settings', settings });
export const setSpeedResultHidden = (parkId: string, resultId: string, hidden: boolean) =>
  post<unknown>(parkId, { action: hidden ? 'hide' : 'unhide', result_id: resultId });

/** Datum um einen Schritt des Zeitraums verschieben (Tag, Woche, Monat). */
export function shiftDate(date: string, period: SpeedPeriod, direction: -1 | 1): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (period === 'month') d.setUTCMonth(d.getUTCMonth() + direction);
  else d.setUTCDate(d.getUTCDate() + direction * (period === 'week' ? 7 : 1));
  return d.toISOString().slice(0, 10);
}
