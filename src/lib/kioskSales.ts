import { invokeEdgeFunction } from './edgeFunctions';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import type {
  OpeningHoursConfig,
  ScheduleDayConfig,
  ScheduleException,
  SchedulePause,
  WeekdayKey,
} from './types';

export interface DailySalesRow {
  camera_code: string;
  business_date: string;
  photos_sold_count: number;
  photos_taken_count: number | null;
  min_file_code: number | null;
  max_file_code: number | null;
}

// Keyed by 3-letter weekday (mon..sun); each value is [open, close] as
// "HH:MM" local time, or null for a closed day. Matches the format written
// by 20260714090000_kiosk_photo_sales_rollup.sql / set by the
// set_imst_opening_hours migration.
export type OpeningHours = Record<string, [string, string] | null>;

export interface KioskSalesResponse {
  isKioskPark: boolean;
  priceCents: number | null;
  timezone: string | null;
  openingHours: OpeningHours | null;
  openingHoursConfig: OpeningHoursConfig | null;
  days: DailySalesRow[];
}

export interface AggregatedDay {
  businessDate: string;
  soldCount: number;
  expectedCount: number | null;
  conversionRate: number | null;
  revenueCents: number;
}

export async function fetchKioskSales(parkId: string): Promise<KioskSalesResponse> {
  const { data, error } = await invokeEdgeFunction<KioskSalesResponse>('kiosk-photo-sales', {
    useSessionAuth: true,
    query: { park_id: parkId },
  });

  if (error || !data) {
    throw new Error(error || 'Keine Antwort von kiosk-photo-sales');
  }

  return data;
}

export interface KioskPurchaseRow {
  id: string;
  capturedAt: string;
  cameraCode: string;
  // Die Bildnummer des Automaten ("0043"). Verbindet diesen Kauf mit dem
  // Zahlungseintrag, den der Automat lokal aufgezeichnet hat - über die
  // Uhrzeit ginge es nicht, denn capturedAt ist der Aufnahme- und nicht der
  // Kaufzeitpunkt. Fehlt bei der Tagesansicht, die über eine SQL-Funktion läuft.
  fileCode?: string | null;
  email: string | null;
  fullName: string | null;
}

export interface KioskPurchasesResponse {
  isKioskPark: boolean;
  priceCents: number | null;
  purchases: KioskPurchaseRow[];
}

// Individual, recent purchases (last ~30 days — photos are hard-deleted
// after that) for the Käufe/Purchases page, as opposed to fetchKioskSales'
// permanent daily rollup used for long-term revenue trends.
export async function fetchKioskPurchases(parkId: string): Promise<KioskPurchasesResponse> {
  const { data, error } = await invokeEdgeFunction<KioskPurchasesResponse>('kiosk-photo-purchases', {
    useSessionAuth: true,
    query: { park_id: parkId },
  });

  if (error || !data) {
    throw new Error(error || 'Keine Antwort von kiosk-photo-purchases');
  }

  return data;
}

// Einzelkäufe am Automaten aus machine_sale_payments (dauerhaft, Monate
// zurück) statt aus der ~30-Tage-photos-Tabelle. Zahlungsart + Kartenmarke
// stehen direkt drin; E-Mail/abgeholt kommt aus photos-Claims, soweit die
// Foto-Zeile noch existiert.
export interface KioskLedgerPurchase {
  machine_id: string | null;
  machine_label: string | null;
  sold_at: string;
  sold_local: string | null;
  bild_nr: string | null;
  print_count: number | null;
  method: 'karte' | 'bar' | 'unbekannt' | string;
  method_source: string | null;
  card_scheme: string | null;
  receipt_no: string | null;
  auth_code: string | null;
  amount_cents: number | null;
  claimed_email: string | null;
  claimed_name: string | null;
  photo_captured_at: string | null;
}

export interface KioskLedgerResponse {
  purchases: KioskLedgerPurchase[];
  machines: { machine_id: string; machine_label: string }[];
  priceCents: number | null;
  truncated: boolean;
  from: string;
  to: string;
}

export interface MachineRevenuePeriod {
  anzahl: number;
  cent: number;
}
export interface MachineRevenue {
  machine_id: string;
  machine_label: string;
  is_active: boolean;
  heute: MachineRevenuePeriod;
  woche: MachineRevenuePeriod;
  monat: MachineRevenuePeriod;
  gesamt: MachineRevenuePeriod;
  karte_anzahl: number;
  bar_anzahl: number;
  unbekannt_anzahl: number;
}

export async function fetchMachineRevenue(parkId: string): Promise<MachineRevenue[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return [];
  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-machine-revenue?park_id=${encodeURIComponent(parkId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return (body?.data?.machines ?? []) as MachineRevenue[];
}

export async function fetchKioskPurchasesLedger(
  parkId: string,
  opts: { from?: string; to?: string } = {},
): Promise<KioskLedgerResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { purchases: [], machines: [], priceCents: null, truncated: false, from: '', to: '' };
  }

  const params = new URLSearchParams({ park_id: parkId });
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);

  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-kiosk-purchases?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return (body?.data ?? { purchases: [], machines: [], priceCents: null, truncated: false, from: '', to: '' }) as KioskLedgerResponse;
}

// Every photo for one specific local calendar day (park timezone) — not
// recency-capped like fetchKioskPurchases, since a single busy day can
// exceed that endpoint's 300-row "last N" limit. Powers the Umsatz page's
// per-day hourly breakdown. Still only reaches back ~30 days (photos are
// hard-deleted after that).
export async function fetchKioskPhotosForDay(parkId: string, businessDate: string): Promise<KioskPurchasesResponse> {
  const { data, error } = await invokeEdgeFunction<KioskPurchasesResponse>('kiosk-photo-purchases', {
    useSessionAuth: true,
    query: { park_id: parkId, date: businessDate },
  });

  if (error || !data) {
    throw new Error(error || 'Keine Antwort von kiosk-photo-purchases');
  }

  return data;
}

export interface HourlyBucket {
  hour: number;
  label: string;
  soldCount: number;
  revenueCents: number;
  revenueEur: number;
  rides?: number;
}

export interface RideSnapshot {
  captured_at: string;
  rides_today: number;
}

// The running daily ride count with timestamps for one local day. Written
// server-side by the liftpic-status heartbeat, so no PC change is needed - but
// only from the day snapshot logging was switched on onward.
export async function fetchRideSnapshots(parkId: string, businessDate: string): Promise<RideSnapshot[]> {
  const { data, error } = await invokeEdgeFunction<{ snapshots: RideSnapshot[] }>('kiosk-ride-snapshots', {
    query: { park_id: parkId, date: businessDate },
  });
  if (error || !data) return [];
  return data.snapshots ?? [];
}

// Turn cumulative ride snapshots into rides-per-hour (park-local hour) by
// diffing consecutive readings. The FIRST snapshot is only a baseline (its
// count already includes everything before logging started that day), so we
// don't attribute it to any hour - otherwise a day where logging began
// mid-morning would dump all earlier rides into one false spike.
export function ridesByHour(snapshots: RideSnapshot[], timezone: string): Map<number, number> {
  const byHour = new Map<number, number>();
  const sorted = [...snapshots].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  let prev: number | null = null;
  for (const snap of sorted) {
    const current = Number(snap.rides_today) || 0;
    if (prev === null) {
      prev = current; // baseline only - never counted as an increment
      continue;
    }
    const delta = Math.max(0, current - prev); // guard against a midnight reset
    prev = current;
    if (delta === 0) continue;
    const hour = localHour(snap.captured_at, timezone);
    byHour.set(hour, (byHour.get(hour) ?? 0) + delta);
  }
  return byHour;
}

function localHour(isoString: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(isoString));
  const hourPart = parts.find((part) => part.type === 'hour');
  return hourPart ? Number(hourPart.value) : new Date(isoString).getHours();
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const; // index = Date#getUTCDay()
const WEEKDAY_CONFIG_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function normalizePause(pause: unknown): SchedulePause | null {
  if (!pause || typeof pause !== 'object') return null;
  const start = (pause as { start?: unknown }).start;
  const end = (pause as { end?: unknown }).end;
  if (!isValidTime(start) || !isValidTime(end)) return null;
  return { start, end };
}

function normalizeDayConfig(
  day: unknown,
  fallback: [string, string] | null,
): ScheduleDayConfig {
  const fallbackOpen = fallback?.[0] ?? '09:00';
  const fallbackClose = fallback?.[1] ?? '17:00';
  if (!day || typeof day !== 'object') {
    return {
      enabled: Array.isArray(fallback),
      open: fallbackOpen,
      close: fallbackClose,
      pauses: [],
    };
  }

  const raw = day as {
    enabled?: unknown;
    open?: unknown;
    close?: unknown;
    pauses?: unknown[];
  };

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
  if (typeof raw.id !== 'string') return null;
  if (typeof raw.label !== 'string') return null;
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

export function createDefaultOpeningHoursConfig(openingHours: OpeningHours | null): OpeningHoursConfig {
  return {
    season_start: null,
    season_end: null,
    weekdays: {
      mon: normalizeDayConfig(null, openingHours?.mon ?? null),
      tue: normalizeDayConfig(null, openingHours?.tue ?? null),
      wed: normalizeDayConfig(null, openingHours?.wed ?? null),
      thu: normalizeDayConfig(null, openingHours?.thu ?? null),
      fri: normalizeDayConfig(null, openingHours?.fri ?? null),
      sat: normalizeDayConfig(null, openingHours?.sat ?? null),
      sun: normalizeDayConfig(null, openingHours?.sun ?? null),
    },
    exceptions: [],
  };
}

export function normalizeOpeningHoursConfig(
  config: unknown,
  fallbackOpeningHours: OpeningHours | null,
): OpeningHoursConfig {
  if (!config || typeof config !== 'object') {
    return createDefaultOpeningHoursConfig(fallbackOpeningHours);
  }

  const raw = config as {
    season_start?: unknown;
    season_end?: unknown;
    weekdays?: Partial<Record<WeekdayKey, unknown>>;
    exceptions?: unknown[];
  };

  const base = createDefaultOpeningHoursConfig(fallbackOpeningHours);

  return {
    season_start: typeof raw.season_start === 'string' ? raw.season_start : null,
    season_end: typeof raw.season_end === 'string' ? raw.season_end : null,
    weekdays: WEEKDAY_CONFIG_KEYS.reduce((acc, key) => {
      const legacyFallback = fallbackOpeningHours?.[key] ?? null;
      acc[key] = normalizeDayConfig(raw.weekdays?.[key], legacyFallback);
      return acc;
    }, {} as Record<WeekdayKey, ScheduleDayConfig>),
    exceptions: Array.isArray(raw.exceptions)
      ? raw.exceptions.map(normalizeException).filter(Boolean) as ScheduleException[]
      : [],
  };
}

export function deriveLegacyOpeningHoursFromConfig(config: OpeningHoursConfig): OpeningHours {
  return WEEKDAY_CONFIG_KEYS.reduce((acc, key) => {
    const day = config.weekdays[key];
    acc[key] = day?.enabled ? [day.open, day.close] : null;
    return acc;
  }, {} as OpeningHours);
}

function weekdayKeyForDate(dateKey: string): WeekdayKey {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const key = WEEKDAY_KEYS[dow];
  return key === 'sun' ? 'sun' : key;
}

function isWithinSeason(dateKey: string, config: OpeningHoursConfig): boolean {
  if (config.season_start && dateKey < config.season_start) return false;
  if (config.season_end && dateKey > config.season_end) return false;
  return true;
}

export function getEffectiveScheduleForDate(
  config: OpeningHoursConfig | null,
  businessDate: string,
  fallbackOpeningHours?: OpeningHours | null,
): ScheduleDayConfig | null {
  const normalized = normalizeOpeningHoursConfig(config, fallbackOpeningHours ?? null);
  if (!isWithinSeason(businessDate, normalized)) return null;

  const matchingException = normalized.exceptions.find(
    (entry) => businessDate >= entry.start_date && businessDate <= entry.end_date,
  );

  if (matchingException) {
    if (matchingException.is_closed) return null;
    if (matchingException.open && matchingException.close) {
      return {
        enabled: true,
        open: matchingException.open,
        close: matchingException.close,
        pauses: matchingException.pauses,
      };
    }
  }

  const weekdayKey = weekdayKeyForDate(businessDate);
  const day = normalized.weekdays[weekdayKey];
  if (!day?.enabled) return null;
  return day;
}

// Which [openHour, closeHour] to chart for a given local business date -
// looked up by weekday, matching the same opening_hours column the
// check_park_inactivity() cron job reads. Weekday is derived from the date
// string's own calendar value (via an explicit UTC construction/extraction,
// same fix as Revenue.tsx's stepDay) rather than the browser's local time,
// so it can't shift by a day depending on where the browser happens to be.
export function getOpeningHourRangeForDate(
  openingHours: OpeningHours | null,
  businessDate: string,
  openingHoursConfig?: OpeningHoursConfig | null,
): { startHour: number; endHour: number } | null {
  if (!businessDate) return null;
  const effective = getEffectiveScheduleForDate(openingHoursConfig ?? null, businessDate, openingHours);
  if (!effective) return null;

  const startHour = Number(effective.open.split(':')[0]);
  const endHour = Number(effective.close.split(':')[0]);
  if (Number.isNaN(startHour) || Number.isNaN(endHour) || endHour < startHour) return null;

  return { startHour, endHour };
}

export function getClosingMinutesForDate(
  date: Date,
  timezone: string,
  openingHours: OpeningHours | null,
  openingHoursConfig?: OpeningHoursConfig | null,
): number | null {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const effective = getEffectiveScheduleForDate(openingHoursConfig ?? null, dateKey, openingHours);
  if (!effective) return null;
  const [closeHour, closeMinute] = effective.close.split(':').map(Number);
  if (Number.isNaN(closeHour) || Number.isNaN(closeMinute)) return null;
  return closeHour * 60 + closeMinute;
}

// Hourly buckets across [hourRange.startHour, hourRange.endHour] (inclusive
// of both ends), or the full 00:00-23:00 day if no range is given (e.g. no
// opening_hours configured for this park/day) - always all present within
// that span so the chart shows the full shape, including silent hours, not
// just the hours with activity. Purchases outside the range (a stray very
// early/late capture) aren't dropped from the day's total elsewhere, only
// from this narrowed timeline.
export function bucketPurchasesByHour(
  purchases: KioskPurchaseRow[],
  priceCents: number,
  timezone: string,
  hourRange?: { startHour: number; endHour: number } | null,
): HourlyBucket[] {
  const startHour = hourRange?.startHour ?? 0;
  const endHour = hourRange?.endHour ?? 23;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const counts = new Map<number, number>(hours.map((hour) => [hour, 0]));
  for (const purchase of purchases) {
    const hour = localHour(purchase.capturedAt, timezone);
    if (counts.has(hour)) counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  return hours.map((hour) => {
    const soldCount = counts.get(hour) ?? 0;
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      soldCount,
      revenueCents: soldCount * priceCents,
      revenueEur: (soldCount * priceCents) / 100,
    };
  });
}

// Multiple cameras at one park have independent sequence counters. Prefer the
// uploader's real ride/photo-taken telemetry; fall back to the old max-min+1
// estimate when older parks have not rolled out liftpic-sync counters yet.
export function aggregateByDate(rows: DailySalesRow[], priceCents: number): AggregatedDay[] {
  const byDate = new Map<string, { sold: number; expected: number; hasExpected: boolean }>();

  for (const row of rows) {
    const bucket = byDate.get(row.business_date) ?? { sold: 0, expected: 0, hasExpected: false };
    bucket.sold += row.photos_sold_count;
    if (typeof row.photos_taken_count === 'number' && row.photos_taken_count >= 0) {
      bucket.expected += row.photos_taken_count;
      bucket.hasExpected = true;
    } else if (row.min_file_code !== null && row.max_file_code !== null && row.max_file_code >= row.min_file_code) {
      bucket.expected += row.max_file_code - row.min_file_code + 1;
      bucket.hasExpected = true;
    }
    byDate.set(row.business_date, bucket);
  }

  return Array.from(byDate.entries())
    .map(([businessDate, v]) => ({
      businessDate,
      soldCount: v.sold,
      expectedCount: v.hasExpected ? v.expected : null,
      conversionRate: v.hasExpected && v.expected > 0 ? v.sold / v.expected : null,
      revenueCents: v.sold * priceCents,
    }))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

export function daysAgoInTimezone(timezone: string, daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(d);
}

export interface KioskChartPoint {
  date: string;
  label: string;
  revenueEur: number;
  soldCount: number;
  expectedCount: number | null;
}

// Chronological (oldest-first) view of the same days aggregateByDate
// returns newest-first for tables — the trend chart reads left-to-right.
export function toChartSeries(days: AggregatedDay[], limitDays = 30): KioskChartPoint[] {
  return [...days]
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
    .slice(-limitDays)
    .map((day) => {
      const date = new Date(`${day.businessDate}T00:00:00`);
      const label = Number.isNaN(date.getTime())
        ? day.businessDate
        : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(date);
      return {
        date: day.businessDate,
        label,
        revenueEur: day.revenueCents / 100,
        soldCount: day.soldCount,
        expectedCount: day.expectedCount,
      };
    });
}

export function sumDays(days: AggregatedDay[]): { sold: number; expected: number | null; revenueCents: number } {
  let sold = 0;
  let expected = 0;
  let hasExpected = false;
  let revenueCents = 0;
  for (const day of days) {
    sold += day.soldCount;
    revenueCents += day.revenueCents;
    if (day.expectedCount !== null) {
      expected += day.expectedCount;
      hasExpected = true;
    }
  }
  return { sold, expected: hasExpected ? expected : null, revenueCents };
}
