import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Camera,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileWarning,
  Gauge,
  Percent,
  Receipt,
  Ticket,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getOptionalSourceWarning, invokeEdgeFunction } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
} from '../lib/parkDashboard';
import {
  aggregateByDate,
  daysAgoInTimezone,
  fetchKioskPurchases,
  fetchKioskSales,
  sumDays,
  todayInTimezone,
  toChartSeries,
  type AggregatedDay,
} from '../lib/kioskSales';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { useI18n } from '../lib/i18n';
import { getOperatorUiText } from '../lib/operatorUiText';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRelative,
  getFormatterLocale,
  severityColor,
  statusColor,
} from '../lib/utils';
import KPICard from '../components/ui/KPICard';
import GlassCard from '../components/ui/GlassCard';

interface StripeRevenuePoint {
  date: string;
  amount: number;
}

interface StripePayment {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  customer_email: string | null;
  description: string | null;
}

interface CombinedDailyPoint {
  date: string;
  label: string;
  onlineRevenue: number;
  localRevenue: number;
  totalRevenue: number;
  onlineTransactions: number;
  localTransactions: number;
}

interface ActivityItem {
  id: string;
  source: 'ops' | 'support' | 'stripe' | 'kiosk';
  title: string;
  description: string;
  created_at: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  status?: string;
}

interface RecentSupportMessage {
  id: string;
  ticket_id: string;
  author_role: 'operator' | 'support';
  message: string;
  created_at: string;
  ticket_subject: string | null;
}

export default function Overview() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { parkId, parkName, isKioskPark, kioskTimezone, kioskCheckLoading } = usePark();
  const { t, language } = useI18n();
  const [kioskDays, setKioskDays] = useState<AggregatedDay[]>([]);
  const [parkData, setParkData] = useState<ParkDashboardData | null>(null);
  const [combinedDaily, setCombinedDaily] = useState<CombinedDailyPoint[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<ActivityItem[]>([]);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [totalPhotos, setTotalPhotos] = useState<number | null>(null);
  const [activeAttractions, setActiveAttractions] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [dismissedActivityIds, setDismissedActivityIds] = useState<string[]>([]);

  useEffect(() => {
    if (kioskCheckLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, kioskCheckLoading]);

  useEffect(() => {
    if (!parkId) {
      setDismissedActivityIds([]);
      return;
    }

    try {
      const stored = localStorage.getItem(`overview-dismissed-activity:${parkId}`);
      setDismissedActivityIds(stored ? JSON.parse(stored) : []);
    } catch {
      setDismissedActivityIds([]);
    }
  }, [parkId]);

  useEffect(() => {
    if (!parkId) return;
    localStorage.setItem(
      `overview-dismissed-activity:${parkId}`,
      JSON.stringify(dismissedActivityIds),
    );
  }, [dismissedActivityIds, parkId]);

  async function loadData() {
    if (!parkId) {
      setError(t('app.unknown'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setIssues([]);

    try {
      // Kiosk parks (no webshop) have no Stripe/local-sales data to speak
      // of — skip those fetches entirely instead of surfacing "temporarily
      // unavailable" warnings for feeds that were never going to apply.
      // Photo/attraction/user counts and real support tickets still apply
      // regardless of the sales model, so those are kept.
      if (isKioskPark) {
        const [
          kioskResult,
          kioskPurchasesResult,
          parkDashboardResult,
          externalUsersResult,
          externalPhotosResult,
          attractionsResult,
          supportRepliesResult,
        ] =
          await Promise.all([
            fetchKioskSales(parkId),
            fetchKioskPurchases(parkId).catch(() => null),
            loadParkDashboardData(parkId).catch(() => ({ data: null, error: 'Operations feed unavailable' })),
            invokeEdgeFunction<{ customers: { id: string }[] }>('external-users', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ photos: { id: string }[] }>('external-photos', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ attractions: { is_active?: boolean }[] }>('external-attractions', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ messages: RecentSupportMessage[] }>('support-tickets', {
              useSessionAuth: true,
              query: { park_id: parkId, recent_messages: '1' },
            }),
          ]);

        setKioskDays(
          aggregateByDate(
            kioskResult.days,
            kioskResult.priceCents ?? 0,
            kioskResult.priceHistory ?? [],
            kioskResult.timezone ?? kioskTimezone,
          ),
        );
        const kioskParkData =
          parkDashboardResult.data ?? createEmptyParkDashboardData(parkId, parkName || 'Selected park');
        setParkData({
          ...kioskParkData,
          park_name: kioskParkData.park_name || parkName || 'Selected park',
        });
        setTotalUsers(externalUsersResult.error ? null : externalUsersResult.data?.customers?.length ?? null);
        setTotalPhotos(externalPhotosResult.error ? null : externalPhotosResult.data?.photos?.length ?? null);
        setActiveAttractions(
          attractionsResult.error
            ? null
            : (attractionsResult.data?.attractions || []).filter((item) => item.is_active !== false).length,
        );
        setCombinedDaily([]);

        const kioskActivity: ActivityItem[] = (kioskPurchasesResult?.purchases ?? [])
          .slice(0, 10)
          .map((purchase) => ({
            id: `kiosk-${purchase.id}`,
            source: 'kiosk' as const,
            title: getOperatorUiText(language, 'overview.kiosk.sale_title'),
            description: purchase.email
              ? getOperatorUiText(language, 'overview.kiosk.sale_claimed', { email: purchase.email })
              : getOperatorUiText(language, 'overview.kiosk.sale_unknown'),
            created_at: purchase.capturedAt,
          }));
        setRecentTransactions(kioskActivity);

        const activities: ActivityItem[] = (supportRepliesResult.error ? [] : supportRepliesResult.data?.messages || [])
          .map((reply) => ({
            id: `support-reply-${reply.id}`,
            source: 'support' as const,
            title: reply.ticket_subject
              ? getOperatorUiText(language, 'overview.support_reply', { subject: reply.ticket_subject })
              : getOperatorUiText(language, 'overview.activity.support'),
            description: reply.message,
            created_at: reply.created_at,
          }))
          .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
          .slice(0, 12);
        setActivityItems(activities);

        setError(null);
        setLoading(false);
        return;
      }

      const [
        parkDashboardResult,
        revenueResult,
        paymentsResult,
        externalUsersResult,
        externalPhotosResult,
        attractionsResult,
        supportRepliesResult,
      ] = await Promise.all([
        loadParkDashboardData(parkId),
        invokeEdgeFunction<{
          total_revenue: number;
          revenue_by_day: StripeRevenuePoint[];
        }>('stripe-revenue'),
        invokeEdgeFunction<{ payments: StripePayment[] }>('stripe-payments'),
        invokeEdgeFunction<{ customers: { id: string }[] }>('external-users', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction<{ photos: { id: string }[] }>('external-photos', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction<{ attractions: { is_active?: boolean }[] }>('external-attractions', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction<{ messages: RecentSupportMessage[] }>('support-tickets', {
          useSessionAuth: true,
          query: { park_id: parkId, recent_messages: '1' },
        }),
      ]);

      const nextIssues: string[] = [];
      const operationsWarning = getOptionalSourceWarning(
        'Operations feed',
        parkDashboardResult.error,
      );
      if (operationsWarning) nextIssues.push(operationsWarning);

      const dashboardBase =
        parkDashboardResult.data ??
        createEmptyParkDashboardData(parkId, parkName || 'Selected park');
      const stripeRevenue = revenueResult.error ? { revenue_by_day: [], total_revenue: 0 } : revenueResult.data;
      const stripePayments = paymentsResult.error ? [] : paymentsResult.data?.payments || [];
      const succeededStripePayments = stripePayments.filter((payment) => payment.status === 'succeeded');
      const stripeWarning =
        revenueResult.error && paymentsResult.error
          ? getOptionalSourceWarning(
              'Stripe data',
              paymentsResult.error || revenueResult.error,
            )
          : null;
      if (stripeWarning) nextIssues.push(stripeWarning);

      const dashboard: ParkDashboardData = {
        ...dashboardBase,
        park_name: dashboardBase.park_name || parkName || 'Selected park',
        features: {
          ...dashboardBase.features,
          stripe:
            (dashboardBase.features.stripe || !revenueResult.error || !paymentsResult.error) &&
            !stripeWarning,
          local_sales: parkDashboardResult.data ? dashboardBase.features.local_sales : false,
          operations: parkDashboardResult.data ? dashboardBase.features.operations : false,
          health: parkDashboardResult.data ? dashboardBase.features.health : false,
          errors: parkDashboardResult.data ? dashboardBase.features.errors : false,
          printer: parkDashboardResult.data ? dashboardBase.features.printer : false,
          cash: parkDashboardResult.data ? dashboardBase.features.cash : false,
          terminal: parkDashboardResult.data ? dashboardBase.features.terminal : false,
        },
      };

      setParkData(dashboard);
      setIssues(Array.from(new Set(nextIssues)));
      setTotalUsers(externalUsersResult.error ? null : externalUsersResult.data?.customers?.length ?? null);
      setTotalPhotos(externalPhotosResult.error ? null : externalPhotosResult.data?.photos?.length ?? null);
      setActiveAttractions(
        attractionsResult.error
          ? null
          : (attractionsResult.data?.attractions || []).filter((item) => item.is_active !== false).length,
      );

      const days = new Map<string, CombinedDailyPoint>();
      for (let i = 29; i >= 0; i -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        days.set(key, {
          date: key,
          label: date.toLocaleDateString(getFormatterLocale(), { month: 'short', day: 'numeric' }),
          onlineRevenue: 0,
          localRevenue: 0,
          totalRevenue: 0,
          onlineTransactions: 0,
          localTransactions: 0,
        });
      }

      for (const point of dashboard.sales.daily || []) {
        const entry = days.get(point.date) || {
          date: point.date,
          label: new Date(point.date).toLocaleDateString(getFormatterLocale(), { month: 'short', day: 'numeric' }),
          onlineRevenue: 0,
          localRevenue: 0,
          totalRevenue: 0,
          onlineTransactions: 0,
          localTransactions: 0,
        };
        entry.localRevenue = point.local_cents / 100;
        entry.localTransactions = point.transactions;
        days.set(point.date, entry);
      }

      for (const point of stripeRevenue?.revenue_by_day || []) {
        const entry = days.get(point.date) || {
          date: point.date,
          label: new Date(point.date).toLocaleDateString(getFormatterLocale(), { month: 'short', day: 'numeric' }),
          onlineRevenue: 0,
          localRevenue: 0,
          totalRevenue: 0,
          onlineTransactions: 0,
          localTransactions: 0,
        };
        entry.onlineRevenue = point.amount;
        days.set(point.date, entry);
      }

      for (const payment of succeededStripePayments) {
        const key = new Date(payment.created_at).toISOString().slice(0, 10);
        const entry = days.get(key);
        if (!entry) continue;
        entry.onlineTransactions += 1;
      }

      const mergedDaily = Array.from(days.values())
        .map((item) => ({
          ...item,
          totalRevenue: item.onlineRevenue + item.localRevenue,
        }))
        .sort((left, right) => left.date.localeCompare(right.date));
      setCombinedDaily(mergedDaily);

      const combinedTransactions: ActivityItem[] = [
        ...dashboard.sales.recent_transactions.map((event) => ({
          id: `local-${event.id}`,
          source: 'ops' as const,
          title: event.payment_method
            ? getOperatorUiText(language, 'overview.local_sale', { method: event.payment_method.toUpperCase() })
            : getOperatorUiText(language, 'overview.local_transaction'),
          description: event.description,
          created_at: event.occurred_at,
          severity: event.severity,
          status: event.status,
        })),
        ...succeededStripePayments.slice(0, 12).map((payment) => ({
          id: `stripe-${payment.id}`,
          source: 'stripe' as const,
          title: getOperatorUiText(language, 'overview.online_payment'),
          description:
            payment.description ||
            payment.customer_email ||
            getOperatorUiText(language, 'overview.stripe_payment_fallback', { id: payment.id.slice(0, 10) }),
          created_at: payment.created_at,
          status: 'completed',
        })),
      ]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 10);
      setRecentTransactions(combinedTransactions);

      const activities: ActivityItem[] = [
        ...dashboard.errors.slice(0, 10).map((event) => ({
          id: `ops-${event.id}`,
          source: 'ops' as const,
          title: event.device || event.category,
          description: event.description,
          created_at: event.occurred_at,
          severity: event.severity,
          status: event.status,
        })),
        ...(supportRepliesResult.error ? [] : supportRepliesResult.data?.messages || []).map((reply) => ({
          id: `support-reply-${reply.id}`,
          source: 'support' as const,
          title: reply.ticket_subject
            ? getOperatorUiText(language, 'overview.support_reply', { subject: reply.ticket_subject })
            : getOperatorUiText(language, 'overview.activity.support'),
          description: reply.message,
          created_at: reply.created_at,
        })),
      ]
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
        .slice(0, 12);
      setActivityItems(activities);

      setError(null);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('app.unknown'));
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
    };
  }, [isKioskPark, kioskDays, kioskTimezone]);

  const kioskChartData = useMemo(() => toChartSeries(kioskDays), [kioskDays]);

  const onlineRevenueCents = useMemo(
    () => Math.round(
      combinedDaily.reduce((sum, item) => sum + item.onlineRevenue, 0) * 100,
    ),
    [combinedDaily],
  );
  const onlineTransactions = useMemo(
    () => combinedDaily.reduce((sum, item) => sum + item.onlineTransactions, 0),
    [combinedDaily],
  );
  const localRevenueCents = parkData?.summary.local_sales_cents ?? 0;
  const localUnconfirmedCents = parkData?.summary.local_unconfirmed_amount_cents ?? 0;
  const localUnknownAmountCount = parkData?.summary.local_unknown_amount_transaction_count ?? 0;
  const totalTransactions =
    (parkData?.summary.local_transaction_count ?? 0) + onlineTransactions;
  const systemStatus = parkData?.health.communication_status ?? 'degraded';
  const systemStatusLabel =
    systemStatus === 'operational'
      ? t('status.operational')
      : systemStatus === 'down'
        ? t('status.down')
        : t('status.degraded');
  const visibleActivityItems = useMemo(
    () => activityItems.filter((item) => !dismissedActivityIds.includes(item.id)),
    [activityItems, dismissedActivityIds],
  );
  const localRevenueDisplay =
    localRevenueCents > 0
      ? formatCurrency(localRevenueCents)
      : localUnconfirmedCents > 0
        ? getOperatorUiText(language, 'revenue.local_display.detected', { value: formatCurrency(localUnconfirmedCents) })
        : localUnknownAmountCount > 0
          ? getOperatorUiText(language, 'revenue.local_display.unknown')
          : formatCurrency(0);
  const localRevenueFootnote =
    localRevenueCents > 0
      ? getOperatorUiText(language, 'revenue.local_display.confirmed_only')
      : localUnconfirmedCents > 0
        ? getOperatorUiText(language, 'revenue.local_display.detected_only')
        : localUnknownAmountCount > 0
          ? getOperatorUiText(language, 'revenue.local_display.unknown_only')
          : getOperatorUiText(language, 'revenue.local_display.none_yet');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  if (error || !parkData) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">
          {t('overview.title')}
        </h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || t('app.unknown')}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const statusTone =
    systemStatus === 'operational'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : systemStatus === 'down'
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';

  const liveStatusWidgets = [
    ...(isKioskPark
      ? []
      : [
          {
            id: 'last-activity',
            label: getOperatorUiText(language, 'overview.widget.last_activity'),
            value: parkData.summary.last_activity_at
              ? formatRelative(parkData.summary.last_activity_at)
              : '-',
            helper: getOperatorUiText(language, 'overview.widget.open_system_health'),
            route: '/health',
            icon: Activity,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50',
          },
          {
            id: 'data-files',
            label: getOperatorUiText(language, 'overview.widget.data_files_scanned'),
            value: formatNumber(parkData.sources.files_scanned || 0),
            helper: getOperatorUiText(language, 'overview.widget.open_operations'),
            route: '/operations',
            icon: Receipt,
            iconColor: 'text-sky-600',
            iconBg: 'bg-sky-50',
          },
          {
            id: 'recognized-ops',
            label: getOperatorUiText(language, 'overview.widget.recognized_ops_files'),
            value: formatNumber(parkData.sources.recognized_files || 0),
            helper: getOperatorUiText(language, 'overview.widget.open_operations'),
            route: '/operations',
            icon: FileWarning,
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-50',
          },
        ]),
    ...(totalUsers !== null
      ? [
          {
            id: 'users',
            label: getOperatorUiText(language, 'overview.widget.users'),
            value: formatNumber(totalUsers),
            helper: getOperatorUiText(language, 'overview.widget.open_users'),
            route: '/users',
            icon: Users,
            iconColor: 'text-cyan-600',
            iconBg: 'bg-cyan-50',
          },
        ]
      : []),
    ...(totalPhotos !== null && !isKioskPark
      ? [
          {
            id: 'photos',
            label: getOperatorUiText(language, 'overview.widget.photos'),
            value: formatNumber(totalPhotos),
            helper: getOperatorUiText(language, 'overview.widget.open_photos'),
            route: '/photos',
            icon: Camera,
            iconColor: 'text-violet-600',
            iconBg: 'bg-violet-50',
          },
        ]
      : []),
    ...(activeAttractions !== null
      ? [
          {
            id: 'attractions',
            label: getOperatorUiText(language, 'overview.widget.active_attractions'),
            value: formatNumber(activeAttractions),
            helper: getOperatorUiText(language, 'overview.widget.open_photos'),
            route: '/photos',
            icon: Activity,
            iconColor: 'text-rose-600',
            iconBg: 'bg-rose-50',
          },
        ]
      : []),
    ...(isKioskPark && kioskKpis
      ? [
          {
            id: 'conversion-today',
            label: getOperatorUiText(language, 'overview.widget.conversion_today'),
            value:
              kioskKpis.today.expected && kioskKpis.today.expected > 0
                ? formatPercent((kioskKpis.today.sold / kioskKpis.today.expected) * 100)
                : '-',
            helper: getOperatorUiText(language, 'overview.widget.sold_per_ride'),
            route: '/revenue',
            icon: Percent,
            iconColor: 'text-fuchsia-600',
            iconBg: 'bg-fuchsia-50',
          },
          {
            id: 'rides-today',
            label: getOperatorUiText(language, 'overview.widget.rides_today'),
            value: kioskKpis.today.expected !== null ? formatNumber(kioskKpis.today.expected) : '-',
            helper: '',
            route: '/revenue',
            icon: Gauge,
            iconColor: 'text-indigo-600',
            iconBg: 'bg-indigo-50',
          },
        ]
      : []),
  ];

  function handleWidgetNavigation(path: string) {
    navigate(path);
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  }

  function dismissActivityItem(itemId: string) {
    setDismissedActivityIds((current) =>
      current.includes(itemId) ? current : [...current, itemId],
    );
  }

  return (
    <div className="space-y-6 overflow-x-clip">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">
              {t('overview.title')}
            </h2>
            {!isKioskPark && <span className={`status-badge ${statusTone}`}>{systemStatusLabel}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {parkName || parkData.park_name}
            {profile ? ` · ${profile.full_name}` : ''}
            {!isKioskPark && parkData.summary.last_data_at
              ? ` · ${getOperatorUiText(language, 'overview.last_data', { time: formatRelative(parkData.summary.last_data_at) })}`
              : ''}
          </p>
        </div>
        {!isKioskPark && (
        <div className="flex flex-wrap gap-2">
          {parkData.features.stripe && (
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              {getOperatorUiText(language, 'overview.badge.stripe_enabled')}
            </span>
          )}
          {parkData.features.local_sales && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {getOperatorUiText(language, 'overview.badge.local_sales_active')}
            </span>
          )}
          {parkData.features.printer && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {getOperatorUiText(language, 'overview.badge.printer_telemetry')}
            </span>
          )}
        </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{getOperatorUiText(language, 'overview.partial_data')}</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      {isKioskPark && kioskKpis && (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-6">
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.revenue_today')}
            value={formatCurrency(kioskKpis.today.revenueCents, 'eur')}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.photos_sold_today')}
            value={formatNumber(kioskKpis.today.sold)}
            icon={Ticket}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.photo_paper')}
            value={
              parkData.summary.printer_paper_remaining !== null
                ? formatNumber(parkData.summary.printer_paper_remaining)
                : '-'
            }
            icon={Activity}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-50"
          />
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.photos_sold_month')}
            value={formatNumber(kioskKpis.month.sold)}
            icon={Receipt}
            iconColor="text-slate-700"
            iconBg="bg-slate-100"
          />
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.revenue_month')}
            value={formatCurrency(kioskKpis.month.revenueCents, 'eur')}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
          <KPICard
            title={getOperatorUiText(language, 'overview.kiosk.photos_sold_total')}
            value={formatNumber(kioskDays.reduce((sum, day) => sum + day.soldCount, 0))}
            icon={Camera}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </div>
      )}

      {!isKioskPark && (
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-6">
        {parkData.features.stripe && (
          <KPICard
            title={getOperatorUiText(language, 'overview.online_revenue')}
            value={formatCurrency(onlineRevenueCents)}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
        )}
        {parkData.features.local_sales && (
          <KPICard
            title={getOperatorUiText(language, 'overview.local_revenue')}
            value={localRevenueDisplay}
            subtitle={localRevenueFootnote}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
        )}
        <KPICard
          title={getOperatorUiText(language, 'overview.transactions')}
          value={formatNumber(totalTransactions)}
          icon={Receipt}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />
        <KPICard
          title={getOperatorUiText(language, 'overview.errors')}
          value={formatNumber(parkData.summary.error_count)}
          icon={FileWarning}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title={getOperatorUiText(language, 'overview.warnings')}
          value={formatNumber(parkData.summary.warning_count)}
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <KPICard
          title={
            parkData.features.printer && parkData.summary.printer_paper_remaining !== null
              ? getOperatorUiText(language, 'overview.paper_remaining')
              : getOperatorUiText(language, 'overview.print_count')
          }
          value={
            parkData.features.printer && parkData.summary.printer_paper_remaining !== null
              ? formatNumber(parkData.summary.printer_paper_remaining)
              : formatNumber(parkData.summary.print_count)
          }
          icon={Activity}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
        />
      </div>
      )}

      <div className={`grid gap-4 sm:grid-cols-2 ${isKioskPark ? 'xl:grid-cols-4' : 'xl:grid-cols-6'}`}>
        {liveStatusWidgets.map((widget) => (
          <button
            key={widget.id}
            type="button"
            onClick={() => handleWidgetNavigation(widget.route)}
            className="group rounded-2xl border border-white/40 bg-white/50 p-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/70"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-xl p-2.5 ${widget.iconBg}`}>
                <widget.icon className={`h-4 w-4 ${widget.iconColor}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">{widget.label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{widget.value}</p>
            <p className="mt-2 text-xs text-slate-500">{widget.helper}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        {isKioskPark && (
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{getOperatorUiText(language, 'overview.kiosk.chart_title')}</h3>
              <p className="text-sm text-slate-500">{getOperatorUiText(language, 'overview.kiosk.chart_subtitle')}</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={kioskChartData}>
                <defs>
                  <linearGradient id="kioskRevenueOverview" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.24} />
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
                  formatter={(value) => [`€${Number(value ?? 0).toFixed(2)}`, getOperatorUiText(language, 'overview.kiosk.chart_revenue')]}
                />
                <Area
                  type="monotone"
                  dataKey="revenueEur"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#kioskRevenueOverview)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        )}

        {!isKioskPark && (
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{getOperatorUiText(language, 'overview.flow.title')}</h3>
              <p className="text-sm text-slate-500">
                {getOperatorUiText(language, 'overview.flow.subtitle')}
              </p>
            </div>
            {(parkData.summary.success_rate ?? null) !== null && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">{getOperatorUiText(language, 'overview.flow.payment_success')}</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatPercent(parkData.summary.success_rate ?? 0)}
                </p>
              </div>
            )}
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={combinedDaily}>
                <defs>
                  <linearGradient id="onlineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="localGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.24} />
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
                  formatter={(value, name) => [
                    `$${Number(value ?? 0).toFixed(2)}`,
                    name === 'onlineRevenue'
                      ? getOperatorUiText(language, 'revenue.legend.online')
                      : getOperatorUiText(language, 'revenue.legend.local'),
                  ]}
                />
                {parkData.features.stripe && (
                  <Area
                    type="monotone"
                    dataKey="onlineRevenue"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    fill="url(#onlineGradient)"
                  />
                )}
                {parkData.features.local_sales && (
                  <Area
                    type="monotone"
                    dataKey="localRevenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#localGradient)"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        )}

        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{getOperatorUiText(language, 'overview.activity.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {getOperatorUiText(language, 'overview.activity.subtitle')}
              </p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {visibleActivityItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                {activityItems.length === 0
                  ? getOperatorUiText(language, 'overview.activity.none')
                  : getOperatorUiText(language, 'overview.activity.cleared')}
              </p>
            ) : (
              visibleActivityItems.map((item) => (
                <div key={item.id} className="rounded-xl bg-white/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        {item.severity ? (
                          <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
                            {item.severity}
                          </span>
                        ) : (
                          <span className="status-badge bg-slate-50 text-slate-600 ring-slate-200">
                            {item.source === 'support'
                              ? getOperatorUiText(language, 'overview.activity.support')
                              : item.source === 'stripe'
                                ? getOperatorUiText(language, 'overview.activity.stripe')
                                : getOperatorUiText(language, 'overview.activity.ops')}
                          </span>
                        )}
                        {item.status && (
                          <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <span className="text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => dismissActivityItem(item.id)}
                        className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/60 hover:text-slate-500"
                        aria-label={`${getOperatorUiText(language, 'overview.activity.clear')} ${item.title}`}
                        title={getOperatorUiText(language, 'overview.activity.clear')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">{getOperatorUiText(language, 'overview.recent_transactions')}</h3>
        <div className="space-y-3">
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-500">{getOperatorUiText(language, 'overview.recent_transactions.none')}</p>
          ) : (
            (showAllTransactions ? recentTransactions : recentTransactions.slice(0, 3)).map((item) => (
              <div key={item.id} className="rounded-xl bg-white/30 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`status-badge ${
                          item.source === 'stripe'
                            ? 'bg-sky-50 text-sky-700 ring-sky-200'
                            : item.source === 'kiosk'
                              ? 'bg-brand-50 text-brand-700 ring-brand-200'
                              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        }`}
                      >
                        {item.source === 'stripe'
                          ? getOperatorUiText(language, 'purchases.source.online')
                          : item.source === 'kiosk'
                            ? getOperatorUiText(language, 'purchases.source.automaton')
                            : getOperatorUiText(language, 'purchases.source.local')}
                      </span>
                      {item.status && (
                        <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatRelative(item.created_at)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        {recentTransactions.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllTransactions((current) => !current)}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-white/40 hover:text-slate-700"
          >
            {showAllTransactions ? (
              <>
                {getOperatorUiText(language, 'overview.recent_transactions.show_less')} <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                {getOperatorUiText(language, 'overview.recent_transactions.show_all', { count: recentTransactions.length })} <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </GlassCard>
    </div>
  );
}
