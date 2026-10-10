import { supabaseService } from './sameProjectAdminAuth.ts';

// Speedmessung (docs/AUSBAU_PLAN.md, SP2/SP3): gemeinsame Auswertung für die öffentliche Bestenliste
// (`park-leaderboard`) und die Betreiber-Ansicht (`operator-speed`). Quelle: `park_speed_results`.

export type Period = 'day' | 'week' | 'month' | 'all';
export const PERIODS: Period[] = ['day', 'week', 'month', 'all'];

// Parks mit eingebauter Speedmessung (wie GUEST_ACTIVITY_PARK_IDS im Dashboard). Weitere Parks über
// `park_entitlements.features` enthält 'speed'.
const SPEED_PARK_IDS = new Set([
  'e2da6436-6a83-4c39-add3-5f99eb6bd897', // CSS-ALPINE / Tarzans
  '3b08e092-beb5-46ec-9811-5698e86dd83a', // Plose
  '25c1022b-4e2e-4fc4-b54d-72a4ced2522b', // Grünberg-Flitzer
]);

export async function speedEnabled(parkId: string): Promise<boolean> {
  if (SPEED_PARK_IDS.has(parkId)) return true;
  const { data } = await supabaseService.from('park_entitlements').select('features').eq('park_id', parkId).maybeSingle();
  return Array.isArray(data?.features) && data.features.includes('speed');
}

export type SpeedSettings = {
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
  periods: Period[];
};

export const DEFAULT_SETTINGS: SpeedSettings = {
  headline: '',
  subline: '',
  cta_title: '',
  cta_text: '',
  winner_text: '',
  instagram_handle: '',
  hashtag: '',
  prize_text: '',
  show_qr: true,
  auto_scroll: true,
  rows: 10,
  max_speed_kmh: null,
  periods: ['day', 'week', 'month', 'all'],
};

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Gespeicherte Einstellungen bereinigt und mit Standardwerten aufgefüllt. */
export function normalizeSettings(raw: unknown): SpeedSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rows = Math.round(Number(s.rows));
  const max = Number(s.max_speed_kmh);
  const periods = Array.isArray(s.periods) ? (s.periods.filter((p) => PERIODS.includes(p as Period)) as Period[]) : [];
  return {
    headline: str(s.headline, 60),
    subline: str(s.subline, 140),
    cta_title: str(s.cta_title, 80),
    cta_text: str(s.cta_text, 300),
    winner_text: str(s.winner_text, 200),
    instagram_handle: str(s.instagram_handle, 40),
    hashtag: str(s.hashtag, 40),
    prize_text: str(s.prize_text, 200),
    show_qr: s.show_qr !== false,
    auto_scroll: s.auto_scroll !== false,
    rows: Number.isFinite(rows) && rows >= 3 && rows <= 30 ? rows : 10,
    max_speed_kmh: Number.isFinite(max) && max > 0 ? Math.min(400, max) : null,
    periods: periods.length > 0 ? [...new Set(periods)] : DEFAULT_SETTINGS.periods,
  };
}

export async function loadSettings(parkId: string): Promise<SpeedSettings> {
  const { data } = await supabaseService.from('park_speed_settings').select('settings').eq('park_id', parkId).maybeSingle();
  return normalizeSettings(data?.settings);
}

export async function parkTimezone(parkId: string): Promise<string> {
  const { data } = await supabaseService.from('parks').select('timezone').eq('id', parkId).maybeSingle();
  return (data?.timezone as string | null) || 'Europe/Berlin';
}

export function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Erster und letzter Kalendertag des Zeitraums, in dem `date` liegt (Woche = Montag bis Sonntag). */
export function rangeFor(period: Period, date: string): { from: string | null; to: string | null } {
  if (period === 'all') return { from: null, to: null };
  const d = new Date(`${date}T12:00:00Z`);
  if (period === 'day') return { from: date, to: date };
  if (period === 'week') {
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    return { from: iso(monday), to: iso(sunday) };
  }
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: iso(first), to: iso(last) };
}

export type RankedRow = {
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
};

/**
 * Rangliste eines Zeitraums: beste Fahrt je Gast, ohne abgemeldete Gäste, ohne Werte über dem Höchstwert.
 * `includeHidden`: ausgeblendete Fahrten bleiben in der Liste (für die Verwaltung), zählen aber nicht im Rang.
 */
export async function rankedRows(
  parkId: string,
  period: Period,
  date: string,
  settings: SpeedSettings,
  opts: { limit: number; includeHidden?: boolean },
): Promise<{ rows: RankedRow[]; total: number; from: string | null; to: string | null }> {
  const { from, to } = rangeFor(period, date);
  let query = supabaseService.from('park_speed_results')
    .select('id, email, claim_id, speed_kmh, captured_at, day, hidden')
    .eq('park_id', parkId)
    .order('speed_kmh', { ascending: false })
    .limit(4000);
  if (from && to) query = query.gte('day', from).lte('day', to);
  if (!opts.includeHidden) query = query.eq('hidden', false);
  if (settings.max_speed_kmh) query = query.lte('speed_kmh', settings.max_speed_kmh);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const all = (data ?? []) as Array<Record<string, unknown>>;

  // Beste Fahrt je Gast (die Liste ist nach Tempo sortiert, also zählt der erste Treffer).
  const best = new Map<string, Record<string, unknown>>();
  const hiddenRows: Array<Record<string, unknown>> = [];
  for (const row of all) {
    if (row.hidden) {
      hiddenRows.push(row);
      continue;
    }
    const email = String(row.email);
    if (!best.has(email)) best.set(email, row);
  }

  const emails = [...best.keys(), ...hiddenRows.map((r) => String(r.email))].filter((e) => !e.startsWith('claim:'));
  const profiles = new Map<string, { displayName: string | null; avatarUrl: string | null; optOut: boolean }>();
  const unique = [...new Set(emails)];
  for (let i = 0; i < unique.length; i += 200) {
    const { data: rows } = await supabaseService.from('park_guest_profiles')
      .select('email, display_name, avatar_url, leaderboard_opt_out').eq('park_id', parkId).in('email', unique.slice(i, i + 200));
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      profiles.set(String(r.email).toLowerCase(), {
        displayName: (r.display_name as string | null) ?? null,
        avatarUrl: (r.avatar_url as string | null) ?? null,
        optOut: r.leaderboard_opt_out === true,
      });
    }
  }

  const visible = [...best.values()].filter((row) => !profiles.get(String(row.email))?.optOut);
  const toRow = (row: Record<string, unknown>, rank: number): RankedRow => {
    const profile = profiles.get(String(row.email));
    return {
      id: String(row.id),
      rank,
      speedKmh: Number(row.speed_kmh),
      capturedAt: String(row.captured_at),
      day: String(row.day),
      email: String(row.email),
      claimId: row.claim_id ? String(row.claim_id) : null,
      hidden: row.hidden === true,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  };
  const rows = visible.slice(0, opts.limit).map((row, index) => toRow(row, index + 1));
  if (opts.includeHidden) rows.push(...hiddenRows.slice(0, 20).map((row) => toRow(row, 0)));
  return { rows, total: visible.length, from, to };
}
