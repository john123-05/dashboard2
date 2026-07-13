import { invokeEdgeFunction } from './edgeFunctions';

export interface DailySalesRow {
  camera_code: string;
  business_date: string;
  photos_sold_count: number;
  min_file_code: number | null;
  max_file_code: number | null;
}

export interface KioskSalesResponse {
  isKioskPark: boolean;
  priceCents: number | null;
  timezone: string | null;
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

// Multiple cameras at one park have independent, non-overlapping sequence
// counters, so their per-day expected-ride-count (max-min+1) is summed
// across cameras rather than compared against each other.
export function aggregateByDate(rows: DailySalesRow[], priceCents: number): AggregatedDay[] {
  const byDate = new Map<string, { sold: number; expected: number; hasExpected: boolean }>();

  for (const row of rows) {
    const bucket = byDate.get(row.business_date) ?? { sold: 0, expected: 0, hasExpected: false };
    bucket.sold += row.photos_sold_count;
    if (row.min_file_code !== null && row.max_file_code !== null && row.max_file_code >= row.min_file_code) {
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
