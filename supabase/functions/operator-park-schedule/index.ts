import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type SchedulePause = {
  start: string;
  end: string;
};

type ScheduleDayConfig = {
  enabled: boolean;
  open: string;
  close: string;
  pauses: SchedulePause[];
};

type ScheduleException = {
  id: string;
  type: 'holiday' | 'vacation' | 'special_hours';
  label: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  open: string | null;
  close: string | null;
  pauses: SchedulePause[];
};

type OpeningHoursConfig = {
  season_start: string | null;
  season_end: string | null;
  weekdays: Record<WeekdayKey, ScheduleDayConfig>;
  exceptions: ScheduleException[];
};

type OpeningHours = Record<string, [string, string] | null>;

const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function normalizePause(entry: unknown): SchedulePause | null {
  if (!entry || typeof entry !== 'object') return null;
  const start = (entry as { start?: unknown }).start;
  const end = (entry as { end?: unknown }).end;
  if (!isValidTime(start) || !isValidTime(end)) return null;
  return { start, end };
}

function defaultDayConfig(enabled = false, open = '09:00', close = '17:00'): ScheduleDayConfig {
  return { enabled, open, close, pauses: [] };
}

function normalizeDay(day: unknown, fallback: [string, string] | null): ScheduleDayConfig {
  const fallbackOpen = fallback?.[0] ?? '09:00';
  const fallbackClose = fallback?.[1] ?? '17:00';
  if (!day || typeof day !== 'object') {
    return defaultDayConfig(Array.isArray(fallback), fallbackOpen, fallbackClose);
  }

  const raw = day as { enabled?: unknown; open?: unknown; close?: unknown; pauses?: unknown[] };
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : Array.isArray(fallback),
    open: isValidTime(raw.open) ? raw.open : fallbackOpen,
    close: isValidTime(raw.close) ? raw.close : fallbackClose,
    pauses: Array.isArray(raw.pauses) ? raw.pauses.map(normalizePause).filter(Boolean) as SchedulePause[] : [],
  };
}

function normalizeException(entry: unknown): ScheduleException | null {
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Record<string, unknown>;
  if (typeof raw.id !== 'string' || typeof raw.label !== 'string') return null;
  if (typeof raw.start_date !== 'string' || typeof raw.end_date !== 'string') return null;
  const type =
    raw.type === 'holiday' || raw.type === 'vacation' || raw.type === 'special_hours'
      ? raw.type
      : 'holiday';
  const isClosed = typeof raw.is_closed === 'boolean' ? raw.is_closed : true;
  return {
    id: raw.id,
    type,
    label: raw.label,
    start_date: raw.start_date,
    end_date: raw.end_date,
    is_closed: isClosed,
    open: isValidTime(raw.open) ? raw.open : null,
    close: isValidTime(raw.close) ? raw.close : null,
    pauses: Array.isArray(raw.pauses) ? raw.pauses.map(normalizePause).filter(Boolean) as SchedulePause[] : [],
  };
}

function createDefaultConfig(openingHours: OpeningHours | null): OpeningHoursConfig {
  return {
    season_start: null,
    season_end: null,
    weekdays: {
      mon: defaultDayConfig(Array.isArray(openingHours?.mon), openingHours?.mon?.[0] ?? '09:00', openingHours?.mon?.[1] ?? '17:00'),
      tue: defaultDayConfig(Array.isArray(openingHours?.tue), openingHours?.tue?.[0] ?? '09:00', openingHours?.tue?.[1] ?? '17:00'),
      wed: defaultDayConfig(Array.isArray(openingHours?.wed), openingHours?.wed?.[0] ?? '09:00', openingHours?.wed?.[1] ?? '17:00'),
      thu: defaultDayConfig(Array.isArray(openingHours?.thu), openingHours?.thu?.[0] ?? '09:00', openingHours?.thu?.[1] ?? '17:00'),
      fri: defaultDayConfig(Array.isArray(openingHours?.fri), openingHours?.fri?.[0] ?? '09:00', openingHours?.fri?.[1] ?? '17:00'),
      sat: defaultDayConfig(Array.isArray(openingHours?.sat), openingHours?.sat?.[0] ?? '09:00', openingHours?.sat?.[1] ?? '17:00'),
      sun: defaultDayConfig(Array.isArray(openingHours?.sun), openingHours?.sun?.[0] ?? '09:00', openingHours?.sun?.[1] ?? '17:00'),
    },
    exceptions: [],
  };
}

function normalizeConfig(config: unknown, openingHours: OpeningHours | null): OpeningHoursConfig {
  if (!config || typeof config !== 'object') return createDefaultConfig(openingHours);
  const raw = config as {
    season_start?: unknown;
    season_end?: unknown;
    weekdays?: Partial<Record<WeekdayKey, unknown>>;
    exceptions?: unknown[];
  };

  return {
    season_start: typeof raw.season_start === 'string' && raw.season_start ? raw.season_start : null,
    season_end: typeof raw.season_end === 'string' && raw.season_end ? raw.season_end : null,
    weekdays: WEEKDAY_KEYS.reduce((acc, key) => {
      acc[key] = normalizeDay(raw.weekdays?.[key], openingHours?.[key] ?? null);
      return acc;
    }, {} as Record<WeekdayKey, ScheduleDayConfig>),
    exceptions: Array.isArray(raw.exceptions)
      ? raw.exceptions.map(normalizeException).filter(Boolean) as ScheduleException[]
      : [],
  };
}

function deriveOpeningHours(config: OpeningHoursConfig): OpeningHours {
  return WEEKDAY_KEYS.reduce((acc, key) => {
    const day = config.weekdays[key];
    acc[key] = day?.enabled ? [day.open, day.close] : null;
    return acc;
  }, {} as OpeningHours);
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const payload = req.method === 'GET' ? null : await req.json().catch(() => null);
  const parkId = typeof payload?.park_id === 'string' ? payload.park_id : url.searchParams.get('park_id');
  if (!parkId) return json({ error: 'park_id is required' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const { data: park, error: parkError } = await supabaseService
    .from('parks')
    .select('id, timezone, opening_hours, opening_hours_config')
    .eq('id', auth.parkId)
    .maybeSingle();

  if (parkError || !park) return json({ error: parkError?.message ?? 'Park not found' }, 404);

  const openingHours = (park.opening_hours as OpeningHours | null) ?? null;

  if (req.method === 'GET') {
    const config = normalizeConfig(park.opening_hours_config, openingHours);
    return json({
      timezone: park.timezone ?? 'Europe/Vienna',
      opening_hours: openingHours,
      opening_hours_config: config,
    });
  }

  if (req.method === 'POST') {
    const nextConfig = normalizeConfig(payload?.opening_hours_config, openingHours);
    const nextOpeningHours = deriveOpeningHours(nextConfig);

    const { error } = await supabaseService
      .from('parks')
      .update({
        opening_hours: nextOpeningHours,
        opening_hours_config: nextConfig,
      })
      .eq('id', auth.parkId);

    if (error) return json({ error: error.message }, 400);

    return json({
      ok: true,
      timezone: park.timezone ?? 'Europe/Vienna',
      opening_hours: nextOpeningHours,
      opening_hours_config: nextConfig,
    });
  }

  return json({ error: 'Method not allowed' }, 405);
});
