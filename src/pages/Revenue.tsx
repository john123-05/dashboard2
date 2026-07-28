import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, ChevronLeft, ChevronRight, CreditCard, Download, Gauge, Percent, Receipt, Ticket, Wallet } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
} from '../lib/parkDashboard';
import {
  aggregateByDate,
  bucketPurchasesByHour,
  daysAgoInTimezone,
  fetchKioskPhotosForDay,
  fetchKioskSales,
  fetchRideSnapshots,
  getOpeningHourRangeForDate,
  ridesByHour,
  sumDays,
  todayInTimezone,
  toChartSeries,
  type AggregatedDay,
  type KioskPurchaseRow,
  type RideSnapshot,
} from '../lib/kioskSales';
import { formatCurrency, formatNumber, formatPercent, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

function formatDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

function formatSoldRideSubtitle(sold: number, expected: number | null): string {
  if (expected !== null) {
    return `${formatNumber(sold)} verkauft / ${formatNumber(expected)} Fahrten`;
  }
  return `${formatNumber(sold)} Foto${sold === 1 ? '' : 's'} verkauft`;
}

interface StripeRevenuePoint {
  date: string;
  amount: number;
}

interface StripePayment {
  id: string;
  status: string;
}

interface RevenueSeriesRow {
  date: string;
  label: string;
  online: number;
  local: number;
  total: number;
  cash: number;
  terminal: number;
}

export default function Revenue() {
  const { t } = useI18n();
  const { parkId, isKioskPark, kioskPriceCents, kioskTimezone, kioskOpeningHours, kioskCheckLoading } = usePark();
  const [parkData, setParkData] = useState<ParkDashboardData | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<RevenueSeriesRow[]>([]);
  const [onlinePaymentCount, setOnlinePaymentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [kioskDays, setKioskDays] = useState<AggregatedDay[]>([]);

  const [chartMode, setChartMode] = useState<'trend' | 'day'>('trend');
  // Explicit, not purely derived from selectedDate — "Anderer Tag" needs to
  // be a real, distinctly-clickable state (it's what reveals the date
  // picker), not just whatever the date happens to currently equal.
  const [dayTab, setDayTab] = useState<'heute' | 'gestern' | 'other'>('heute');
  const [selectedDate, setSelectedDate] = useState('');
  const [dayPurchases, setDayPurchases] = useState<KioskPurchaseRow[]>([]);
  const [daySnapshots, setDaySnapshots] = useState<RideSnapshot[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // Clicking "Anderer Tag" should open the calendar immediately rather than
  // just revealing an inert input - showPicker() needs the input actually
  // mounted first, which only happens after this state change re-renders,
  // so it's triggered here instead of directly in the button's onClick.
  useEffect(() => {
    if (chartMode !== 'day' || dayTab !== 'other') return;
    const raf = window.requestAnimationFrame(() => {
      const input = dateInputRef.current;
      if (input && typeof input.showPicker === 'function') {
        try {
          input.showPicker();
        } catch {
          // Browsers that refuse this outside a stricter gesture window
          // still leave a perfectly usable, visible date input behind.
        }
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [chartMode, dayTab]);

  useEffect(() => {
    if (kioskCheckLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, kioskCheckLoading]);

  async function loadData() {
    if (!parkId) {
      setError('No park selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setIssues([]);

    try {
      // Kiosk parks (no webshop) have no Stripe/local-sales data to speak
      // of — skip those fetches entirely instead of surfacing "temporarily
      // unavailable" warnings for feeds that were never going to apply.
      if (isKioskPark) {
        const kioskResult = await fetchKioskSales(parkId);
        setKioskDays(aggregateByDate(kioskResult.days, kioskResult.priceCents ?? 0));
        setParkData(createEmptyParkDashboardData(parkId));
        setError(null);
        setLoading(false);
        return;
      }

      const [parkDashboardResult, stripeRevenueResult, stripePaymentsResult] = await Promise.all([
        loadParkDashboardData(parkId),
        invokeEdgeFunction<{
          total_revenue: number;
          revenue_by_day: StripeRevenuePoint[];
        }>('stripe-revenue', { useSessionAuth: true }),
        invokeEdgeFunction<{ payments: StripePayment[] }>('stripe-payments', { useSessionAuth: true }),
      ]);

      setKioskDays([]);

      const nextIssues: string[] = [];
      const operationsWarning = getOptionalSourceWarning(
        'Local sales feed',
        parkDashboardResult.error,
      );
      if (operationsWarning) nextIssues.push(operationsWarning);
      const stripeWarning =
        stripeRevenueResult.error && stripePaymentsResult.error
          ? getOptionalSourceWarning('Stripe data', stripeRevenueResult.error || stripePaymentsResult.error)
          : null;
      if (stripeWarning) nextIssues.push(stripeWarning);

      const dashboardBase =
        parkDashboardResult.data ?? createEmptyParkDashboardData(parkId);
      const dashboard: ParkDashboardData = {
        ...dashboardBase,
        features: {
          ...dashboardBase.features,
          stripe:
            !stripeWarning &&
            (dashboardBase.features.stripe || !stripeRevenueResult.error || !stripePaymentsResult.error),
          local_sales: Boolean(parkDashboardResult.data && dashboardBase.features.local_sales),
          operations: Boolean(parkDashboardResult.data && dashboardBase.features.operations),
          health: Boolean(parkDashboardResult.data && dashboardBase.features.health),
          errors: Boolean(parkDashboardResult.data && dashboardBase.features.errors),
          printer: Boolean(parkDashboardResult.data && dashboardBase.features.printer),
          cash: Boolean(parkDashboardResult.data && dashboardBase.features.cash),
          terminal: Boolean(parkDashboardResult.data && dashboardBase.features.terminal),
        },
      };
      setParkData(dashboard);
      setIssues(Array.from(new Set(nextIssues)));

      const stripeRevenue = stripeRevenueResult.error ? [] : stripeRevenueResult.data?.revenue_by_day || [];
      const stripeSucceededCount = stripePaymentsResult.error
        ? 0
        : (stripePaymentsResult.data?.payments || []).filter((payment) => payment.status === 'succeeded').length;
      setOnlinePaymentCount(stripeSucceededCount);
      const days = new Map<string, RevenueSeriesRow>();

      for (let i = 29; i >= 0; i -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        days.set(key, {
          date: key,
          label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          online: 0,
          local: 0,
          total: 0,
          cash: 0,
          terminal: 0,
        });
      }

      for (const point of dashboard.sales.daily || []) {
        const entry = days.get(point.date) || {
          date: point.date,
          label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          online: 0,
          local: 0,
          total: 0,
          cash: 0,
          terminal: 0,
        };
        entry.local = point.local_cents / 100;
        entry.cash = point.cash_cents / 100;
        entry.terminal = point.terminal_cents / 100;
        days.set(point.date, entry);
      }

      for (const point of stripeRevenue) {
        const entry = days.get(point.date) || {
          date: point.date,
          label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          online: 0,
          local: 0,
          total: 0,
          cash: 0,
          terminal: 0,
        };
        entry.online = point.amount;
        days.set(point.date, entry);
      }

      setDailyRevenue(
        Array.from(days.values())
          .map((entry) => ({
            ...entry,
            total: entry.online + entry.local,
          }))
          .sort((left, right) => left.date.localeCompare(right.date)),
      );

      setError(null);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
      setLoading(false);
    }
  }

  const kioskKpis = useMemo(() => {
    if (!isKioskPark) return null;
    const today = todayInTimezone(kioskTimezone);
    const weekStart = daysAgoInTimezone(kioskTimezone, 6);
    const monthPrefix = today.slice(0, 7);

    return {
      today: sumDays(kioskDays.filter((d) => d.businessDate === today)),
      week: sumDays(kioskDays.filter((d) => d.businessDate >= weekStart)),
      month: sumDays(kioskDays.filter((d) => d.businessDate.startsWith(monthPrefix))),
      total: sumDays(kioskDays),
    };
  }, [isKioskPark, kioskDays, kioskTimezone]);

  const kioskChartData = useMemo(() => toChartSeries(kioskDays), [kioskDays]);

  // photos (and therefore the hourly breakdown) only reach back ~30 days -
  // bound the date picker to that window instead of letting someone pick an
  // older date that will always come back empty.
  const maxSelectableDate = useMemo(
    () => (isKioskPark ? todayInTimezone(kioskTimezone) : ''),
    [isKioskPark, kioskTimezone],
  );
  const minSelectableDate = useMemo(
    () => (isKioskPark ? daysAgoInTimezone(kioskTimezone, 29) : ''),
    [isKioskPark, kioskTimezone],
  );

  useEffect(() => {
    if (!isKioskPark || selectedDate) return;
    setSelectedDate(todayInTimezone(kioskTimezone));
  }, [isKioskPark, kioskTimezone, selectedDate]);

  useEffect(() => {
    if (chartMode !== 'day' || !parkId || !selectedDate) return;

    let cancelled = false;
    setDayLoading(true);
    setDayError(null);

    fetchKioskPhotosForDay(parkId, selectedDate)
      .then((result) => {
        if (cancelled) return;
        setDayPurchases(result.purchases);
        setDayLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setDayError(loadError instanceof Error ? loadError.message : 'Unknown error');
        setDayLoading(false);
      });

    // Ride snapshots (rides-per-hour line). Optional - only populated from the
    // day snapshot logging started, and must never block the revenue chart.
    fetchRideSnapshots(parkId, selectedDate)
      .then((snaps) => {
        if (!cancelled) setDaySnapshots(snaps);
      })
      .catch(() => {
        if (!cancelled) setDaySnapshots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [chartMode, parkId, selectedDate]);

  const dayHourRange = useMemo(
    () => getOpeningHourRangeForDate(kioskOpeningHours, selectedDate),
    [kioskOpeningHours, selectedDate],
  );
  const hourlyBuckets = useMemo(() => {
    const buckets = bucketPurchasesByHour(dayPurchases, kioskPriceCents ?? 0, kioskTimezone, dayHourRange);
    const rideMap = ridesByHour(daySnapshots, kioskTimezone);
    return buckets.map((bucket) => ({ ...bucket, rides: rideMap.get(bucket.hour) ?? 0 }));
  }, [dayPurchases, daySnapshots, kioskPriceCents, kioskTimezone, dayHourRange]);
  const hasRideData = useMemo(() => hourlyBuckets.some((bucket) => (bucket.rides ?? 0) > 0), [hourlyBuckets]);
  const dayTotalRevenueCents = dayPurchases.length * (kioskPriceCents ?? 0);
  const selectedDateLabel = selectedDate ? formatDateLabel(selectedDate) : '';

  const todayStr = useMemo(() => (isKioskPark ? todayInTimezone(kioskTimezone) : ''), [isKioskPark, kioskTimezone]);
  const yesterdayStr = useMemo(
    () => (isKioskPark ? daysAgoInTimezone(kioskTimezone, 1) : ''),
    [isKioskPark, kioskTimezone],
  );

  function selectDay(dateStr: string) {
    setSelectedDate(dateStr);
    setDayTab(dateStr === todayStr ? 'heute' : dateStr === yesterdayStr ? 'gestern' : 'other');
  }

  function stepDay(delta: number) {
    if (!selectedDate) return;
    // Pure calendar-date arithmetic on the YYYY-MM-DD string, done entirely
    // in UTC so it can't shift by a day depending on the browser's own
    // timezone (mixing local-time construction with toISOString(), which is
    // always UTC, would do exactly that for anyone browsing from a
    // timezone ahead of UTC).
    const next = new Date(`${selectedDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + delta);
    const nextStr = next.toISOString().slice(0, 10);
    if (nextStr < minSelectableDate || nextStr > maxSelectableDate) return;
    selectDay(nextStr);
  }

  const totals = useMemo(() => {
    return dailyRevenue.reduce(
      (sum, row) => ({
        online: sum.online + row.online,
        local: sum.local + row.local,
        total: sum.total + row.total,
        cash: sum.cash + row.cash,
        terminal: sum.terminal + row.terminal,
      }),
      { online: 0, local: 0, total: 0, cash: 0, terminal: 0 },
    );
  }, [dailyRevenue]);
  const totalConfirmedRevenueCents = useMemo(
    () => Math.round((totals.online + totals.local) * 100),
    [totals.local, totals.online],
  );
  const confirmedLocalRevenueCents = parkData?.summary.local_sales_cents ?? 0;
  const detectedLocalRevenueCents = parkData?.summary.local_unconfirmed_terminal_cents ?? 0;
  const unknownLocalAmountCount = parkData?.summary.local_unknown_amount_transaction_count ?? 0;
  const localRevenueDisplay =
    confirmedLocalRevenueCents > 0
      ? formatCurrency(confirmedLocalRevenueCents)
      : detectedLocalRevenueCents > 0
        ? `${formatCurrency(detectedLocalRevenueCents)} detected`
        : unknownLocalAmountCount > 0
          ? 'Unknown'
          : formatCurrency(0);

  function handleExport() {
    exportToCSV(
      dailyRevenue.map((row) => ({
        date: row.date,
        online_revenue: row.online.toFixed(2),
        local_revenue: row.local.toFixed(2),
        cash_revenue: row.cash.toFixed(2),
        terminal_revenue: row.terminal.toFixed(2),
        total_revenue: row.total.toFixed(2),
      })),
      'revenue-report',
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !parkData) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('revenue.title')}</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('revenue.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Unified revenue view for online and local sales
          </p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          {t('revenue.export')}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Revenue is partially available.</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      {!parkData.features.stripe && !parkData.features.local_sales && !isKioskPark && (
        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-slate-800">No active revenue feed</h3>
          <p className="mt-2 text-sm text-slate-500">
            This park currently has no reachable Stripe or local sales source. The page will populate automatically as soon as one of the feeds is available.
          </p>
        </GlassCard>
      )}

      {isKioskPark && kioskKpis && (
        <>
          <GlassCard className="p-6">
            <h3 className="text-base font-semibold text-slate-800">Selbstbedienungs-Automat</h3>
            <p className="mt-2 text-sm text-slate-500">
              Kein eigener Webshop hier — jedes gespeicherte Foto ist bereits ein bezahlter Kauf am Automaten
              ({formatCurrency(kioskPriceCents ?? 0, 'eur')} pro Foto).
            </p>
          </GlassCard>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              title="Heute"
              value={formatCurrency(kioskKpis.today.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.today.sold, kioskKpis.today.expected)}
              icon={Ticket}
              iconColor="text-brand-600"
              iconBg="bg-brand-50"
            />
            <KPICard
              title="Letzte 7 Tage"
              value={formatCurrency(kioskKpis.week.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.week.sold, kioskKpis.week.expected)}
              icon={Camera}
              iconColor="text-sky-600"
              iconBg="bg-sky-50"
            />
            <KPICard
              title="Dieser Monat"
              value={formatCurrency(kioskKpis.month.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.month.sold, kioskKpis.month.expected)}
              icon={Receipt}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <KPICard
              title="Gesamt (seit Aufzeichnung)"
              value={formatCurrency(kioskKpis.total.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.total.sold, kioskKpis.total.expected)}
              icon={Wallet}
              iconColor="text-slate-700"
              iconBg="bg-slate-100"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <KPICard
              title="Fahrten heute"
              value={kioskKpis.today.expected !== null ? formatNumber(kioskKpis.today.expected) : '-'}
              subtitle="Kamera-Aufnahmen heute"
              icon={Gauge}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
            />
            <KPICard
              title="Conversion heute"
              value={
                kioskKpis.today.expected && kioskKpis.today.expected > 0
                  ? formatPercent((kioskKpis.today.sold / kioskKpis.today.expected) * 100)
                  : '-'
              }
              subtitle="Verkauft je Fahrt"
              icon={Percent}
              iconColor="text-fuchsia-600"
              iconBg="bg-fuchsia-50"
            />
          </div>

          <GlassCard className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Umsatz</h3>
                <p className="text-sm text-slate-500">
                  {chartMode === 'trend' ? 'Tägliche Einnahmen am Automaten' : 'Einnahmen nach Uhrzeit'}
                </p>
              </div>
              <div className="flex flex-wrap rounded-xl bg-white/40 p-1">
                <button
                  type="button"
                  onClick={() => setChartMode('trend')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'trend' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Gesamt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    selectDay(todayStr);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'heute'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Heute
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    selectDay(yesterdayStr);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'gestern'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Gestern
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    setDayTab('other');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'other'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Anderer Tag
                </button>
              </div>
            </div>

            {chartMode === 'trend' ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kioskChartData}>
                    <defs>
                      <linearGradient id="kioskRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(value) => `€${value}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(255,255,255,0.94)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.5)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                      }}
                      formatter={(value) => [`€${Number(value ?? 0).toFixed(2)}`, 'Umsatz']}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenueEur"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fill="url(#kioskRevenue)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <>
                <div
                  className={`mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-white/30 p-4 ${
                    dayTab === 'other' ? 'justify-between' : 'justify-end'
                  }`}
                >
                  {dayTab === 'other' && (
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => stepDay(-1)}
                        disabled={selectedDate <= minSelectableDate}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Vorheriger Tag"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                          Tag auswählen
                        </label>
                        <input
                          ref={dateInputRef}
                          type="date"
                          value={selectedDate}
                          min={minSelectableDate}
                          max={maxSelectableDate}
                          onChange={(event) => selectDay(event.target.value)}
                          className="glass-input"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => stepDay(1)}
                        disabled={selectedDate >= maxSelectableDate}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label="Nächster Tag"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Am {selectedDateLabel} eingenommen
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {formatCurrency(dayTotalRevenueCents, 'eur')}
                    </p>
                    <p className="text-xs text-slate-500">{dayPurchases.length} Fotos verkauft</p>
                  </div>
                </div>

                {dayError && <p className="mb-3 text-sm text-red-600">{dayError}</p>}

                <div className="h-80">
                  {dayLoading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Lädt...
                    </div>
                  ) : dayPurchases.length === 0 && !dayError ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Keine Verkäufe an diesem Tag.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={hourlyBuckets}>
                        <defs>
                          <linearGradient id="kioskRevenueHourly" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.22} />
                            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis
                          yAxisId="rev"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: '#94a3b8' }}
                          tickFormatter={(value) => `€${value}`}
                        />
                        {/* Rides on their own hidden, auto-scaled axis so the two
                            curves are comparable in shape, not absolute scale. */}
                        <YAxis yAxisId="rides" orientation="right" hide domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{
                            background: 'rgba(255,255,255,0.94)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.5)',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                          }}
                          formatter={(value, name) =>
                            name === 'Fahrten'
                              ? [formatNumber(Number(value ?? 0)), 'Fahrten']
                              : [`€${Number(value ?? 0).toFixed(2)}`, 'Umsatz']
                          }
                        />
                        {hasRideData && <Legend wrapperStyle={{ fontSize: 12 }} />}
                        <Area
                          yAxisId="rev"
                          type="monotone"
                          dataKey="revenueEur"
                          name="Umsatz"
                          stroke="#0ea5e9"
                          strokeWidth={2}
                          fill="url(#kioskRevenueHourly)"
                        />
                        {hasRideData && (
                          <Line
                            yAxisId="rides"
                            type="monotone"
                            dataKey="rides"
                            name="Fahrten"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={false}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Tagesübersicht</h3>
            {kioskDays.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Verkaufsdaten erfasst.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4">Tag</th>
                      <th className="py-2 pr-4">Verkauft</th>
                      <th className="py-2 pr-4">Fahrten</th>
                      <th className="py-2 pr-4">Quote</th>
                      <th className="py-2">Umsatz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kioskDays.map((day) => (
                      <tr
                        key={day.businessDate}
                        onClick={() => {
                          selectDay(day.businessDate);
                          setChartMode('day');
                        }}
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-white/40"
                      >
                        <td className="py-2 pr-4 text-slate-700">{formatDateLabel(day.businessDate)}</td>
                        <td className="py-2 pr-4 text-slate-700">{formatNumber(day.soldCount)}</td>
                        <td className="py-2 pr-4 text-slate-700">
                          {day.expectedCount !== null ? formatNumber(day.expectedCount) : '-'}
                        </td>
                        <td className="py-2 pr-4 text-slate-700">
                          {day.conversionRate !== null ? formatPercent(day.conversionRate * 100) : '-'}
                        </td>
                        <td className="py-2 font-medium text-slate-800">{formatCurrency(day.revenueCents, 'eur')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}

      {(parkData.features.stripe || parkData.features.local_sales) && (
      <>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {parkData.features.stripe && (
          <KPICard
            title="Online Revenue"
            value={formatCurrency(Math.round(totals.online * 100))}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
        )}
        {parkData.features.local_sales && (
          <KPICard
            title="Local Revenue"
            value={localRevenueDisplay}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
        )}
        <KPICard
          title="Total Revenue"
          value={formatCurrency(totalConfirmedRevenueCents)}
          icon={Receipt}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />
        <KPICard
          title="Total Transactions"
          value={formatNumber(parkData.summary.local_transaction_count + onlinePaymentCount)}
          icon={Receipt}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
        />
      </div>

      <GlassCard className="p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Online Commerce Domain</h3>
            <p className="mt-2 text-sm text-slate-500">
              Stripe revenue and online purchase counts stay separate from machine-side telemetry.
            </p>
            <div className="mt-4 space-y-2 rounded-2xl bg-white/30 p-4 text-sm text-slate-600">
              <p>Confirmed online revenue: {formatCurrency(Math.round(totals.online * 100))}</p>
              <p>Online successful payments: {formatNumber(onlinePaymentCount)}</p>
            </div>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">Local Operations Domain</h3>
            <p className="mt-2 text-sm text-slate-500">
              Only confirmed local amounts count as revenue. Detected or unknown amounts stay outside totals.
            </p>
            <div className="mt-4 space-y-2 rounded-2xl bg-white/30 p-4 text-sm text-slate-600">
              <p>Confirmed local revenue: {formatCurrency(parkData.summary.local_sales_cents)}</p>
              <p>
                Detected but unconfirmed local amount:{' '}
                {(parkData.summary.local_unconfirmed_amount_cents ?? 0) > 0
                  ? formatCurrency(parkData.summary.local_unconfirmed_amount_cents)
                  : '-'}
              </p>
              <p>
                Unknown local amount signals:{' '}
                {formatNumber(parkData.summary.local_unknown_amount_transaction_count)}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Revenue Trend</h3>
            <p className="text-sm text-slate-500">
              Last 30 days, confirmed online and confirmed local revenue only
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Cash: {formatCurrency(Math.round(totals.cash * 100))}</p>
            <p>Terminal: {formatCurrency(Math.round(totals.terminal * 100))}</p>
            {(parkData.summary.local_unconfirmed_amount_cents ?? 0) > 0 && (
              <p>Detected, unconfirmed: {formatCurrency(parkData.summary.local_unconfirmed_amount_cents)}</p>
            )}
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyRevenue}>
              <defs>
                <linearGradient id="revOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="revLocal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => `$${value}`} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.94)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                }}
                formatter={(value, name) => [`$${Number(value ?? 0).toFixed(2)}`, name === 'online' ? 'Online' : 'Local']}
              />
              {parkData.features.stripe && (
                <Area type="monotone" dataKey="online" stroke="#0ea5e9" strokeWidth={2} fill="url(#revOnline)" />
              )}
              {parkData.features.local_sales && (
                <Area type="monotone" dataKey="local" stroke="#10b981" strokeWidth={2} fill="url(#revLocal)" />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Local Sales Breakdown</h3>
          <p className="mb-4 text-sm text-slate-500">
            Only confirmed local cash and terminal amounts are charted here.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRevenue}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => `$${value}`} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(255,255,255,0.94)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                  }}
                  formatter={(value, name) => [`$${Number(value ?? 0).toFixed(2)}`, name === 'cash' ? 'Cash / Coin' : 'Terminal']}
                />
                <Bar dataKey="cash" stackId="local" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="terminal" stackId="local" fill="#22c55e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Sales Signals</h3>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Payment attempts</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.payment_attempt_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Success rate</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {parkData.summary.success_rate !== null
                  ? formatPercent(parkData.summary.success_rate)
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Cancel rate</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {parkData.summary.cancel_rate !== null
                  ? formatPercent(parkData.summary.cancel_rate)
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Cash / Coin transactions</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.cash_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Terminal transactions</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.terminal_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unconfirmed local sales</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.local_unconfirmed_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unknown local amounts</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.local_unknown_amount_transaction_count)}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
      </>
      )}
    </div>
  );
}
