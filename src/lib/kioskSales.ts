import { invokeEdgeFunction } from './edgeFunctions';

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
// diffing consecutive readings. The first snapshot's whole count lands in its
// hour (the rides before the first reading of the day).
export function ridesByHour(snapshots: RideSnapshot[], timezone: string): Map<number, number> {
  const byHour = new Map<number, number>();
  const sorted = [...snapshots].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  let prev = 0;
  for (const snap of sorted) {
    const current = Number(snap.rides_today) || 0;
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

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // index = Date#getUTCDay()

// Which [openHour, closeHour] to chart for a given local business date -
// looked up by weekday, matching the same opening_hours column the
// check_park_inactivity() cron job reads. Weekday is derived from the date
// string's own calendar value (via an explicit UTC construction/extraction,
// same fix as Revenue.tsx's stepDay) rather than the browser's local time,
// so it can't shift by a day depending on where the browser happens to be.
export function getOpeningHourRangeForDate(
  openingHours: OpeningHours | null,
  businessDate: string,
): { startHour: number; endHour: number } | null {
  if (!openingHours || !businessDate) return null;
  const dow = new Date(`${businessDate}T00:00:00Z`).getUTCDay();
  const hours = openingHours[WEEKDAY_KEYS[dow]];
  if (!Array.isArray(hours) || hours.length < 2) return null;

  const startHour = Number(hours[0].split(':')[0]);
  const endHour = Number(hours[1].split(':')[0]);
  if (Number.isNaN(startHour) || Number.isNaN(endHour) || endHour < startHour) return null;

  return { startHour, endHour };
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
