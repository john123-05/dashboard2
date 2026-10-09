import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, ChevronDown, ChevronLeft, ChevronRight, CreditCard, Download, Gauge, Percent, Receipt, Ticket, Wallet } from 'lucide-react';
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
  fetchMachineRevenue,
  fetchRideSnapshots,
  getOpeningHourRangeForDate,
  ridesByHour,
  sumDays,
  todayInTimezone,
  toChartSeries,
  type AggregatedDay,
  type KioskPurchaseRow,
  type MachineRevenue,
  type RideSnapshot,
} from '../lib/kioskSales';
import { formatCurrency as baseFormatCurrency, formatNumber as baseFormatNumber, formatPercent as baseFormatPercent, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import ZahlungsUebersicht from '../components/ZahlungsUebersicht';
import AutomatenUebersicht, { AUTOMATEN_ZEITRAEUME, type Zeitraum as AutomatenZeitraum } from '../components/AutomatenUebersicht';
import KPICard from '../components/ui/KPICard';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

function formatDateLabel(iso: string, locale: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

function formatSoldRideSubtitle(sold: number, expected: number | null, locale: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (expected !== null) {
    return t('revenue.sold_rides', { sold: baseFormatNumber(sold, locale), rides: baseFormatNumber(expected, locale) });
  }
  return t(sold === 1 ? 'revenue.photo_sold' : 'revenue.photos_sold', { count: baseFormatNumber(sold, locale) });
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

export default function Revenue({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const formatCurrency = (cents: number, currency = 'usd') => baseFormatCurrency(cents, currency, locale);
  const formatNumber = (value: number) => baseFormatNumber(value, locale);
  const formatPercent = (value: number) => baseFormatPercent(value, locale);
  const navigate = useNavigate();
  const {
    parkId,
    isKioskPark,
    kioskPriceCents,
    kioskTimezone,
    kioskOpeningHours,
    kioskOpeningHoursConfig,
    kioskCheckLoading,
  } = usePark();
  const [parkData, setParkData] = useState<ParkDashboardData | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<RevenueSeriesRow[]>([]);
  const [onlinePaymentCount, setOnlinePaymentCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [kioskDays, setKioskDays] = useState<AggregatedDay[]>([]);
  const [machineRevenue, setMachineRevenue] = useState<MachineRevenue[]>([]);
  const [automatZeitraum, setAutomatZeitraum] = useState<AutomatenZeitraum>('monat');

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
  const [isMobileChart, setIsMobileChart] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileChart(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

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
        const [kioskResult, machineRev] = await Promise.all([
          fetchKioskSales(parkId),
          fetchMachineRevenue(parkId).catch(() => [] as MachineRevenue[]),
        ]);
        setKioskDays(aggregateByDate(kioskResult.days, kioskResult.priceCents ?? 0));
        setMachineRevenue(machineRev);
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
      setError(loadError instanceof Error ? loadError.message : t('app.unknown_error'));
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
  const chartXAxisTick = useMemo(
    () => ({ fontSize: isMobileChart ? 10 : 11, fill: '#94a3b8' }),
    [isMobileChart],
  );
  const chartYAxisTick = useMemo(
    () => ({ fontSize: isMobileChart ? 10 : 11, fill: '#94a3b8' }),
    [isMobileChart],
  );
  const chartMargin = useMemo(
    () => ({
      top: 8,
      right: isMobileChart ? 4 : 12,
      left: isMobileChart ? -24 : -10,
      bottom: 0,
    }),
    [isMobileChart],
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
        setDayError(loadError instanceof Error ? loadError.message : t('app.unknown_error'));
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
    () => getOpeningHourRangeForDate(kioskOpeningHours, selectedDate, kioskOpeningHoursConfig),
    [kioskOpeningHours, kioskOpeningHoursConfig, selectedDate],
  );
  const hourlyBuckets = useMemo(() => {
    const buckets = bucketPurchasesByHour(dayPurchases, kioskPriceCents ?? 0, kioskTimezone, dayHourRange);
    const rideMap = ridesByHour(daySnapshots, kioskTimezone);
    return buckets.map((bucket) => ({ ...bucket, rides: rideMap.get(bucket.hour) ?? 0 }));
  }, [dayPurchases, daySnapshots, kioskPriceCents, kioskTimezone, dayHourRange]);
  const hasRideData = useMemo(() => hourlyBuckets.some((bucket) => (bucket.rides ?? 0) > 0), [hourlyBuckets]);
  const hasTrendRideData = useMemo(
    () => kioskChartData.some((day) => (day.expectedCount ?? 0) > 0),
    [kioskChartData],
  );
  const dayTotalRevenueCents = dayPurchases.length * (kioskPriceCents ?? 0);
  const selectedDateLabel = selectedDate ? formatDateLabel(selectedDate, locale) : '';

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
        ? t('revenue.detected', { amount: formatCurrency(detectedLocalRevenueCents) })
        : unknownLocalAmountCount > 0
          ? t('app.unknown')
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
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-revenue' : 'space-y-6'}>
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 sm:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !parkData) {
    return (
      <div className={embedded ? 'space-y-4 customer-embedded-root preview-revenue' : 'space-y-6'}>
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
    <div className={embedded ? 'space-y-4 customer-embedded-root preview-revenue' : 'space-y-6'}>
      <div className="customer-operator-pagehead flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('revenue.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('revenue.overview_desc')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isKioskPark && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/60 px-3 py-1.5 text-xs">
              <div>
                <p className="text-slate-400">{t('revenue.current_price')}</p>
                <p className="font-semibold text-slate-800">{formatCurrency(kioskPriceCents ?? 0, 'eur')}</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="rounded-lg px-2 py-1 font-medium text-sky-600 hover:bg-sky-50"
              >
                {t('revenue.edit')}
              </button>
            </div>
          )}
          <button onClick={handleExport} className="glass-button-secondary customer-operator-btn">
            <Download className="h-4 w-4" />
            {t('revenue.export')}
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{t('revenue.partial')}</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      {!parkData.features.stripe && !parkData.features.local_sales && !isKioskPark && (
        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-slate-800">{t('revenue.no_feed')}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {t('revenue.no_feed_desc')}
          </p>
        </GlassCard>
      )}

      {isKioskPark && kioskKpis && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
            <KPICard
              title={t('overview.today')}
              value={formatCurrency(kioskKpis.today.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.today.sold, kioskKpis.today.expected, locale, t)}
              icon={Ticket}
              iconColor="text-brand-600"
              iconBg="bg-brand-50"
            />
            <KPICard
              title={t('revenue.last_7_days')}
              value={formatCurrency(kioskKpis.week.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.week.sold, kioskKpis.week.expected, locale, t)}
              icon={Camera}
              iconColor="text-sky-600"
              iconBg="bg-sky-50"
            />
            <KPICard
              title={t('revenue.this_month')}
              value={formatCurrency(kioskKpis.month.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.month.sold, kioskKpis.month.expected, locale, t)}
              icon={Receipt}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <KPICard
              title={t('revenue.all_time')}
              value={formatCurrency(kioskKpis.total.revenueCents, 'eur')}
              subtitle={formatSoldRideSubtitle(kioskKpis.total.sold, kioskKpis.total.expected, locale, t)}
              icon={Wallet}
              iconColor="text-slate-700"
              iconBg="bg-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
            <KPICard
              title={t('overview.rides_today')}
              value={kioskKpis.today.expected !== null ? formatNumber(kioskKpis.today.expected) : '-'}
              subtitle={t('revenue.camera_shots_today')}
              icon={Gauge}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
            />
            <KPICard
              title={t('overview.conversion_today')}
              value={
                kioskKpis.today.expected && kioskKpis.today.expected > 0
                  ? formatPercent((kioskKpis.today.sold / kioskKpis.today.expected) * 100)
                  : '-'
              }
              subtitle={t('overview.sold_per_ride')}
              icon={Percent}
              iconColor="text-fuchsia-600"
              iconBg="bg-fuchsia-50"
            />
            {machineRevenue.length >= 2 && (
              <div className="col-span-2 hidden items-end justify-end sm:flex">
                <div className="inline-flex rounded-xl bg-white/50 p-1">
                  {AUTOMATEN_ZEITRAEUME.map((z) => (
                    <button
                      key={z.key}
                      type="button"
                      onClick={() => setAutomatZeitraum(z.key)}
                      className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                        automatZeitraum === z.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {t(`revenue.period.${z.key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Automaten im Vergleich: Ring + eine Karte je Automat. Nur bei mehr als
              einem Automaten; Quelle ist machine_sale_payments (mit machine_id). */}
          <AutomatenUebersicht machines={machineRevenue} zeitraum={automatZeitraum} />

          <GlassCard className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">{t('nav.revenue')}</h3>
                <p className="text-sm text-slate-500">
                  {chartMode === 'trend' ? t('overview.kiosk_daily_revenue') : t('revenue.hourly_revenue')}
                </p>
              </div>
              <div className="customer-operator-segment flex flex-wrap rounded-xl bg-white/40 p-1">
                <button
                  type="button"
                  onClick={() => setChartMode('trend')}
                  className={`customer-operator-segment-btn rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'trend' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('revenue.total_tab')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    selectDay(todayStr);
                  }}
                  className={`customer-operator-segment-btn rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'heute'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('overview.today')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    selectDay(yesterdayStr);
                  }}
                  className={`customer-operator-segment-btn rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'gestern'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('overview.yesterday')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChartMode('day');
                    setDayTab('other');
                  }}
                  className={`customer-operator-segment-btn rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    chartMode === 'day' && dayTab === 'other'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t('overview.other_day')}
                </button>
              </div>
            </div>

            {chartMode === 'trend' ? (
              <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
                <div className="h-[18rem] min-w-[320px] w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={kioskChartData} margin={chartMargin}>
                      <defs>
                        <linearGradient id="kioskRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={chartXAxisTick}
                        minTickGap={isMobileChart ? 22 : 8}
                        interval={isMobileChart ? 'preserveStartEnd' : 0}
                      />
                      <YAxis
                        yAxisId="rev"
                        axisLine={false}
                        tickLine={false}
                        tick={chartYAxisTick}
                        tickFormatter={(value) => formatCurrency(Math.round(Number(value) * 100), 'eur')}
                      />
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
                          name === t('overview.rides')
                            ? [formatNumber(Number(value ?? 0)), t('overview.rides')]
                            : [formatCurrency(Math.round(Number(value ?? 0) * 100), 'eur'), t('nav.revenue')]
                        }
                      />
                      {hasTrendRideData && <Legend wrapperStyle={{ fontSize: 12 }} />}
                      <Area
                        yAxisId="rev"
                        type="monotone"
                        dataKey="revenueEur"
                        name={t('nav.revenue')}
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        fill="url(#kioskRevenue)"
                      />
                      {hasTrendRideData && (
                        <Line
                          yAxisId="rides"
                          type="monotone"
                          dataKey="expectedCount"
                          name={t('overview.rides')}
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
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
                        className="customer-operator-icon-btn rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t('revenue.previous_day')}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <label className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
                          {t('revenue.select_day')}
                        </label>
                        <input
                          ref={dateInputRef}
                          type="date"
                          value={selectedDate}
                          min={minSelectableDate}
                          max={maxSelectableDate}
                          onChange={(event) => selectDay(event.target.value)}
                          className="glass-input customer-operator-input"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => stepDay(1)}
                        disabled={selectedDate >= maxSelectableDate}
                        className="customer-operator-icon-btn rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/60 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t('revenue.next_day')}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {t('revenue.earned_on', { date: selectedDateLabel })}
                    </p>
                    <p className="text-2xl font-bold text-slate-800">
                      {formatCurrency(dayTotalRevenueCents, 'eur')}
                    </p>
                    <p className="text-xs text-slate-500">{t('revenue.photos_sold', { count: dayPurchases.length })}</p>
                  </div>
                </div>

                {dayError && <p className="mb-3 text-sm text-red-600">{dayError}</p>}

                <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
                  {dayLoading ? (
                    <div className="flex h-[18rem] items-center justify-center text-sm text-slate-500 sm:h-80">
                      {t('app.loading')}
                    </div>
                  ) : dayPurchases.length === 0 && !dayError ? (
                    <div className="flex h-[18rem] items-center justify-center text-sm text-slate-500 sm:h-80">
                      {t('revenue.no_sales_day')}
                    </div>
                  ) : (
                    <div className="h-[18rem] min-w-[320px] w-full sm:h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={hourlyBuckets} margin={chartMargin}>
                          <defs>
                            <linearGradient id="kioskRevenueHourly" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.22} />
                              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={chartXAxisTick}
                            minTickGap={isMobileChart ? 20 : 8}
                            interval={isMobileChart ? 'preserveStartEnd' : 0}
                          />
                          <YAxis
                            yAxisId="rev"
                            axisLine={false}
                            tickLine={false}
                            tick={chartYAxisTick}
                            tickFormatter={(value) => formatCurrency(Math.round(Number(value) * 100), 'eur')}
                          />
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
                              name === t('overview.rides')
                                ? [formatNumber(Number(value ?? 0)), t('overview.rides')]
                                : [formatCurrency(Math.round(Number(value ?? 0) * 100), 'eur'), t('nav.revenue')]
                            }
                          />
                          {hasRideData && <Legend wrapperStyle={{ fontSize: 12 }} />}
                          <Area
                            yAxisId="rev"
                            type="monotone"
                            dataKey="revenueEur"
                            name={t('nav.revenue')}
                            stroke="#0ea5e9"
                            strokeWidth={2}
                            fill="url(#kioskRevenueHourly)"
                          />
                          {hasRideData && (
                            <Line
                              yAxisId="rides"
                              type="monotone"
                              dataKey="rides"
                              name={t('overview.rides')}
                              stroke="#10b981"
                              strokeWidth={2}
                              dot={false}
                            />
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">{t('revenue.daily_overview')}</h3>
            {kioskDays.length === 0 ? (
              <p className="text-sm text-slate-500">{t('revenue.no_sales_data')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-4">{t('revenue.day')}</th>
                      <th className="py-2 pr-4">{t('revenue.sold')}</th>
                      <th className="py-2 pr-4">{t('overview.rides')}</th>
                      <th className="py-2 pr-4">{t('revenue.rate')}</th>
                      <th className="py-2">{t('nav.revenue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(embedded ? kioskDays.slice(0, 3) : kioskDays).map((day) => (
                      <tr
                        key={day.businessDate}
                        onClick={() => {
                          selectDay(day.businessDate);
                          setChartMode('day');
                        }}
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-white/40"
                      >
                        <td className="py-2 pr-4 text-slate-700">{formatDateLabel(day.businessDate, locale)}</td>
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

          {/* Die Einzelheiten zu Bar/Karte, Kartenmarken, Wechselgeld und den
              letzten Käufen: wichtig, aber nichts, was man jeden Tag lesen muss. */}
          <details className="group rounded-2xl">
            <summary className="glass-panel flex cursor-pointer list-none items-center justify-between rounded-2xl px-5 py-4 [&::-webkit-details-marker]:hidden sm:px-6">
              <span>
                <span className="block text-base font-semibold text-slate-800">{t('revenue.payment_details')}</span>
                <span className="block text-sm text-slate-500">
                  {t('revenue.payment_details_desc')}
                </span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4">
              <ZahlungsUebersicht />
            </div>
          </details>
        </>
      )}

      {(parkData.features.stripe || parkData.features.local_sales) && (
      <>
      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        {parkData.features.stripe && (
          <KPICard
            title={t('overview.online_revenue')}
            value={formatCurrency(Math.round(totals.online * 100))}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
        )}
        {parkData.features.local_sales && (
          <KPICard
            title={t('overview.local_revenue')}
            value={localRevenueDisplay}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
        )}
        <KPICard
          title={t('revenue.total_revenue')}
          value={formatCurrency(totalConfirmedRevenueCents)}
          icon={Receipt}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />
        <KPICard
          title={t('revenue.total_transactions')}
          value={formatNumber(parkData.summary.local_transaction_count + onlinePaymentCount)}
          icon={Receipt}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
        />
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t('revenue.online_sales')}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {t('revenue.online_sales_desc')}
            </p>
            <div className="mt-4 space-y-2 rounded-2xl bg-white/30 p-4 text-sm text-slate-600">
              <p>{t('revenue.online_confirmed', { amount: formatCurrency(Math.round(totals.online * 100)) })}</p>
              <p>{t('revenue.online_payments', { count: formatNumber(onlinePaymentCount) })}</p>
            </div>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t('revenue.local_sales')}</h3>
            <p className="mt-2 text-sm text-slate-500">
              {t('revenue.local_sales_desc')}
            </p>
            <div className="mt-4 space-y-2 rounded-2xl bg-white/30 p-4 text-sm text-slate-600">
              <p>{t('revenue.local_confirmed', { amount: formatCurrency(parkData.summary.local_sales_cents) })}</p>
              <p>
                {t('revenue.local_detected')}{' '}
                {(parkData.summary.local_unconfirmed_amount_cents ?? 0) > 0
                  ? formatCurrency(parkData.summary.local_unconfirmed_amount_cents)
                  : '-'}
              </p>
              <p>
                {t('revenue.local_unknown')}{' '}
                {formatNumber(parkData.summary.local_unknown_amount_transaction_count)}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t('overview.revenue_trend')}</h3>
            <p className="text-sm text-slate-500">
              {t('revenue.trend_desc')}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>{t('revenue.cash_amount', { amount: formatCurrency(Math.round(totals.cash * 100)) })}</p>
            <p>{t('revenue.terminal_amount', { amount: formatCurrency(Math.round(totals.terminal * 100)) })}</p>
            {(parkData.summary.local_unconfirmed_amount_cents ?? 0) > 0 && (
              <p>{t('revenue.detected_amount', { amount: formatCurrency(parkData.summary.local_unconfirmed_amount_cents) })}</p>
            )}
          </div>
        </div>
        <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
          <div className="h-[18rem] min-w-[320px] w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenue} margin={chartMargin}>
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
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={chartXAxisTick}
                  minTickGap={isMobileChart ? 22 : 8}
                  interval={isMobileChart ? 'preserveStartEnd' : 0}
                />
                <YAxis axisLine={false} tickLine={false} tick={chartYAxisTick} tickFormatter={(value) => formatCurrency(Math.round(Number(value) * 100))} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(255,255,255,0.94)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.5)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                  }}
                    formatter={(value, name) => [formatCurrency(Math.round(Number(value ?? 0) * 100)), name === 'online' ? t('overview.online') : t('overview.local')]}
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
        </div>
      </GlassCard>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <GlassCard className="p-5 sm:p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('revenue.local_breakdown')}</h3>
          <p className="mb-4 text-sm text-slate-500">
            {t('revenue.local_breakdown_desc')}
          </p>
          <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="h-[16rem] min-w-[320px] w-full sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRevenue}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(value) => formatCurrency(Math.round(Number(value) * 100))} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255,255,255,0.94)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.5)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(15,23,42,0.08)',
                    }}
                    formatter={(value, name) => [formatCurrency(Math.round(Number(value ?? 0) * 100)), name === 'cash' ? t('revenue.cash_coin') : t('revenue.terminal')]}
                  />
                  <Bar dataKey="cash" stackId="local" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="terminal" stackId="local" fill="#22c55e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('revenue.sales_signals')}</h3>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.payment_attempts')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.payment_attempt_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.success_rate')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {parkData.summary.success_rate !== null
                  ? formatPercent(parkData.summary.success_rate)
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.cancel_rate')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {parkData.summary.cancel_rate !== null
                  ? formatPercent(parkData.summary.cancel_rate)
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.cash_transactions')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.cash_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.terminal_transactions')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.terminal_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.unconfirmed_sales')}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(parkData.summary.local_unconfirmed_transaction_count)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('revenue.unknown_amounts')}</p>
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
