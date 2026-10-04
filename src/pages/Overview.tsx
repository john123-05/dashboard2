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
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
  fetchKioskPurchases,
  fetchKioskSales,
  fetchRideSnapshots,
  getEffectiveScheduleForDate,
  getOpeningHourRangeForDate,
  ridesByHour,
  sumDays,
  todayInTimezone,
  toChartSeries,
  type AggregatedDay,
} from '../lib/kioskSales';
import {
  fetchSurveyConfig,
  fetchSurveyResults,
  fetchSocialResults,
  type UnlockMode,
  type SurveyResults,
  type SocialResults,
} from '../lib/surveyApi';
import { fetchRecentPhotos, type BrowsablePhoto } from '../lib/photoBrowser';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { useI18n } from '../lib/i18n';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRelative,
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
  source: 'ops' | 'support' | 'stripe' | 'kiosk' | 'insight';
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
  const {
    parkId,
    parkName,
    isKioskPark,
    kioskTimezone,
    kioskOpeningHours,
    kioskOpeningHoursConfig,
    kioskPriceCents,
    kioskCheckLoading,
  } = usePark();
  const { t } = useI18n();
  const [kioskDays, setKioskDays] = useState<AggregatedDay[]>([]);
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<BrowsablePhoto[]>([]);
  const [unlockMode, setUnlockMode] = useState<UnlockMode | null>(null);
  const [surveyToday, setSurveyToday] = useState<SurveyResults | null>(null);
  const [socialToday, setSocialToday] = useState<SocialResults | null>(null);
  const [peakDayFilter, setPeakDayFilter] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [peakCustomDate, setPeakCustomDate] = useState('');
  const [hourlyPoints, setHourlyPoints] = useState<{ hour: number; label: string; rides: number; sold: number }[]>([]);
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
  const [dismissedActivityLoaded, setDismissedActivityLoaded] = useState(false);

  useEffect(() => {
    if (kioskCheckLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, kioskCheckLoading]);

  useEffect(() => {
    if (!parkId) {
      setDismissedActivityIds([]);
      setDismissedActivityLoaded(true);
      return;
    }

    try {
      const stored = localStorage.getItem(`overview-dismissed-activity:${parkId}`);
      setDismissedActivityIds(stored ? JSON.parse(stored) : []);
    } catch {
      setDismissedActivityIds([]);
    } finally {
      setDismissedActivityLoaded(true);
    }
  }, [parkId]);

  useEffect(() => {
    if (!parkId || !dismissedActivityLoaded) return;
    localStorage.setItem(
      `overview-dismissed-activity:${parkId}`,
      JSON.stringify(dismissedActivityIds),
    );
  }, [dismissedActivityIds, dismissedActivityLoaded, parkId]);

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
      // Photo/attraction/user counts and real support tickets still apply
      // regardless of the sales model, so those are kept.
      if (isKioskPark) {
        const [
          kioskResult,
          kioskPurchasesResult,
          leadsResult,
          recentPhotosResult,
          parkDashboardResult,
          externalUsersResult,
          externalPhotosResult,
          attractionsResult,
          supportRepliesResult,
        ] =
          await Promise.all([
            fetchKioskSales(parkId),
            fetchKioskPurchases(parkId).catch(() => null),
            invokeEdgeFunction<{ leads: Record<string, unknown>[] }>('external-leads', { query: { park_id: parkId } }),
            fetchRecentPhotos(parkId, 4).catch(() => []),
            loadParkDashboardData(parkId).catch(() => ({ data: null, error: 'Operations feed unavailable' })),
            invokeEdgeFunction<{ customers: { id: string }[] }>('external-users', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ photos: { id: string }[] }>('external-photos', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ attractions: { is_active?: boolean }[] }>('external-attractions', { query: { park_id: parkId } }),
            invokeEdgeFunction<{ messages: RecentSupportMessage[] }>('support-tickets', {
              useSessionAuth: true,
              query: { park_id: parkId, recent_messages: '1' },
            }),
          ]);

        setKioskDays(aggregateByDate(kioskResult.days, kioskResult.priceCents ?? 0));
        setLeads(leadsResult.error ? [] : leadsResult.data?.leads ?? []);
        setRecentPhotos(recentPhotosResult);
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
            title: 'Foto am Automaten verkauft',
            description: purchase.email ? `Später abgeholt: ${purchase.email}` : 'Kein Abholstatus bekannt',
            created_at: purchase.capturedAt,
          }));
        setRecentTransactions(kioskActivity);

        const activities: ActivityItem[] = (supportRepliesResult.error ? [] : supportRepliesResult.data?.messages || [])
          .map((reply) => ({
            id: `support-reply-${reply.id}`,
            source: 'support' as const,
            title: reply.ticket_subject ? `Support-Antwort: ${reply.ticket_subject}` : 'Support-Antwort',
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
          label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
          label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
          label: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
            ? `${event.payment_method.toUpperCase()} sale`
            : 'Local transaction',
          description: event.description,
          created_at: event.occurred_at,
          severity: event.severity,
          status: event.status,
        })),
        ...succeededStripePayments.slice(0, 12).map((payment) => ({
          id: `stripe-${payment.id}`,
          source: 'stripe' as const,
          title: 'Online payment',
          description:
            payment.description ||
            payment.customer_email ||
            `Stripe payment ${payment.id.slice(0, 10)}`,
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
          title: reply.ticket_subject ? `Support-Antwort: ${reply.ticket_subject}` : 'Support-Antwort',
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
    };
  }, [isKioskPark, kioskDays, kioskTimezone]);

  const kioskChartData = useMemo(() => toChartSeries(kioskDays), [kioskDays]);

  function formatDurationShort(minutes: number): string {
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
  }

  const parkOpenStatus = useMemo(() => {
    if (!isKioskPark) return null;
    const today = todayInTimezone(kioskTimezone);
    const schedule = getEffectiveScheduleForDate(kioskOpeningHoursConfig ?? null, today, kioskOpeningHours);
    if (!schedule) return null;
    const [openHour, openMinute] = schedule.open.split(':').map(Number);
    const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
    if ([openHour, openMinute, closeHour, closeMinute].some(Number.isNaN)) return null;

    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: kioskTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const nowHour = Number(nowParts.find((p) => p.type === 'hour')?.value ?? 0);
    const nowMinute = Number(nowParts.find((p) => p.type === 'minute')?.value ?? 0);
    const nowMinutes = nowHour * 60 + nowMinute;
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    const label = isOpen
      ? `Park geöffnet · schließt in ${formatDurationShort(closeMinutes - nowMinutes)}`
      : nowMinutes < openMinutes
        ? `Park öffnet in ${formatDurationShort(openMinutes - nowMinutes)}`
        : 'Park heute bereits geschlossen';

    return { isOpen, label };
  }, [isKioskPark, kioskOpeningHours, kioskOpeningHoursConfig, kioskTimezone]);

  const greeting = useMemo(() => {
    const tz = isKioskPark && kioskTimezone ? kioskTimezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    if (hour < 11) return 'Guten Morgen';
    if (hour < 14) return 'Guten Mittag';
    if (hour < 18) return 'Guten Tag';
    if (hour < 22) return 'Guten Abend';
    return 'Gute Nacht';
  }, [isKioskPark, kioskTimezone]);

  const firstName = profile?.full_name?.split(' ')[0] ?? '';

  const selectedPeakDate = useMemo(() => {
    if (!isKioskPark) return '';
    if (peakDayFilter === 'today') return todayInTimezone(kioskTimezone);
    if (peakDayFilter === 'yesterday') return daysAgoInTimezone(kioskTimezone, 1);
    return peakCustomDate || todayInTimezone(kioskTimezone);
  }, [isKioskPark, kioskTimezone, peakDayFilter, peakCustomDate]);

  useEffect(() => {
    if (!isKioskPark || !parkId || !selectedPeakDate) return;
    let active = true;
    Promise.all([
      fetchKioskPhotosForDay(parkId, selectedPeakDate).catch(() => null),
      fetchRideSnapshots(parkId, selectedPeakDate).catch(() => []),
    ]).then(([photosResult, snapshots]) => {
      if (!active) return;
      const hourRange = getOpeningHourRangeForDate(kioskOpeningHours, selectedPeakDate, kioskOpeningHoursConfig);
      const soldBuckets = photosResult
        ? bucketPurchasesByHour(photosResult.purchases, kioskPriceCents ?? 0, kioskTimezone, hourRange)
        : [];
      const rideMap = ridesByHour(snapshots, kioskTimezone);
      const startHour = hourRange?.startHour ?? (soldBuckets[0]?.hour ?? 0);
      const endHour = hourRange?.endHour ?? (soldBuckets[soldBuckets.length - 1]?.hour ?? 23);
      const hours = Array.from({ length: Math.max(0, endHour - startHour + 1) }, (_, i) => startHour + i);
      const soldByHour = new Map(soldBuckets.map((b) => [b.hour, b.soldCount]));
      setHourlyPoints(
        hours.map((hour) => ({
          hour,
          label: `${String(hour).padStart(2, '0')}:00`,
          rides: rideMap.get(hour) ?? 0,
          sold: soldByHour.get(hour) ?? 0,
        })),
      );
    });
    return () => {
      active = false;
    };
  }, [isKioskPark, parkId, selectedPeakDate, kioskTimezone, kioskOpeningHours, kioskOpeningHoursConfig, kioskPriceCents]);

  useEffect(() => {
    if (!isKioskPark || !parkId) return;
    let active = true;
    fetchSurveyConfig(parkId).then((config) => {
      if (!active) return;
      const mode = config.settings.mode;
      setUnlockMode(mode);
      if (mode === 'survey') {
        fetchSurveyResults(parkId, 1).then((results) => active && setSurveyToday(results)).catch(() => {});
      } else if (mode === 'social') {
        fetchSocialResults(parkId, 1).then((results) => active && setSocialToday(results)).catch(() => {});
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [isKioskPark, parkId]);

  const emailLeadsToday = useMemo(() => {
    if (unlockMode !== 'email') return 0;
    const today = todayInTimezone(kioskTimezone);
    return leads.filter((lead) => {
      if (lead.source !== 'photo_claim') return false;
      const createdAt = lead.created_at as string;
      if (!createdAt) return false;
      return new Intl.DateTimeFormat('en-CA', { timeZone: kioskTimezone }).format(new Date(createdAt)) === today;
    }).length;
  }, [leads, unlockMode, kioskTimezone]);

  const peakHour = useMemo(() => {
    if (hourlyPoints.length === 0) return null;
    return hourlyPoints.reduce((best, current) => (current.sold > best.sold ? current : best));
  }, [hourlyPoints]);

  const userDataStats = useMemo(() => {
    const today = todayInTimezone(kioskTimezone);
    const dayLeads = leads.filter((lead) => {
      const source = lead.source as string;
      if (source !== 'photo_claim' && source !== 'social_media') return false;
      const createdAt = lead.created_at as string;
      if (!createdAt) return false;
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: kioskTimezone }).format(new Date(createdAt));
      return dateKey === today;
    });
    const optedIn = dayLeads.filter((lead) => lead.opted_in === true).length;
    return { total: dayLeads.length, optedIn, notOptedIn: dayLeads.length - optedIn };
  }, [leads, kioskTimezone]);

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
      ? 'Operational'
      : systemStatus === 'down'
        ? 'Offline'
        : 'Degraded';
  const revenueTrendItem = useMemo((): ActivityItem | null => {
    if (!isKioskPark || kioskDays.length < 14) return null;
    const sorted = [...kioskDays].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
    const last7 = sorted.slice(0, 7).reduce((sum, d) => sum + d.revenueCents, 0);
    const prev7 = sorted.slice(7, 14).reduce((sum, d) => sum + d.revenueCents, 0);
    if (prev7 === 0) return null;
    const changePercent = Math.round(((last7 - prev7) / prev7) * 100);
    if (changePercent === 0) return null;
    const isUp = changePercent > 0;
    return {
      id: 'insight-revenue-trend',
      source: 'insight',
      title: isUp ? 'Umsatz steigt' : 'Umsatz sinkt',
      description: `Dein Umsatz ist in den letzten 7 Tagen im Vergleich zu den 7 Tagen davor um ${Math.abs(changePercent)} % ${isUp ? 'gestiegen' : 'gefallen'}.`,
      created_at: new Date().toISOString(),
      severity: isUp ? undefined : 'warning',
    };
  }, [isKioskPark, kioskDays]);

  const visibleActivityItems = useMemo(() => {
    const items = revenueTrendItem ? [revenueTrendItem, ...activityItems] : activityItems;
    return items.filter((item) => !dismissedActivityIds.includes(item.id));
  }, [activityItems, revenueTrendItem, dismissedActivityIds]);
  const localRevenueDisplay =
    localRevenueCents > 0
      ? formatCurrency(localRevenueCents)
      : localUnconfirmedCents > 0
        ? `${formatCurrency(localUnconfirmedCents)} detected`
        : localUnknownAmountCount > 0
          ? 'Unknown'
          : formatCurrency(0);
  const localRevenueFootnote =
    localRevenueCents > 0
      ? 'Confirmed local revenue only'
      : localUnconfirmedCents > 0
        ? 'Detected in machine data, not confirmed as revenue'
        : localUnknownAmountCount > 0
          ? 'Local sales activity exists without a confirmed amount'
          : 'No confirmed local revenue yet';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-white/40" />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
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
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
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
            label: 'Last activity',
            value: parkData.summary.last_activity_at
              ? formatRelative(parkData.summary.last_activity_at)
              : '-',
            helper: 'Open system health',
            route: '/health',
            icon: Activity,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50',
          },
          {
            id: 'data-files',
            label: 'Data files scanned',
            value: formatNumber(parkData.sources.files_scanned || 0),
            helper: 'Open operations',
            route: '/operations',
            icon: Receipt,
            iconColor: 'text-sky-600',
            iconBg: 'bg-sky-50',
          },
          {
            id: 'recognized-ops',
            label: 'Recognized ops files',
            value: formatNumber(parkData.sources.recognized_files || 0),
            helper: 'Open operations',
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
            label: 'Users',
            value: formatNumber(totalUsers),
            helper: 'Open users',
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
            label: 'Photos',
            value: formatNumber(totalPhotos),
            helper: 'Open photos',
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
            label: 'Active attractions',
            value: formatNumber(activeAttractions),
            helper: 'Open photos',
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
            label: 'Conversion heute',
            value:
              kioskKpis.today.expected && kioskKpis.today.expected > 0
                ? formatPercent((kioskKpis.today.sold / kioskKpis.today.expected) * 100)
                : '-',
            helper: 'Verkauft je Fahrt',
            route: '/revenue',
            icon: Percent,
            iconColor: 'text-fuchsia-600',
            iconBg: 'bg-fuchsia-50',
          },
          {
            id: 'rides-today',
            label: 'Fahrten heute',
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
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t('overview.title')} · {parkName || parkData.park_name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-slate-800">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h2>
            {!isKioskPark && <span className={`status-badge ${statusTone}`}>{systemStatusLabel}</span>}
            {parkOpenStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  parkOpenStatus.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${parkOpenStatus.isOpen ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  aria-hidden="true"
                />
                {parkOpenStatus.label}
              </span>
            )}
          </div>
          {!isKioskPark && parkData.summary.last_data_at && (
            <p className="mt-1 text-sm text-slate-500">Last data {formatRelative(parkData.summary.last_data_at)}</p>
          )}
        </div>
        {!isKioskPark && (
        <div className="flex flex-wrap gap-2">
          {parkData.features.stripe && (
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              Stripe enabled
            </span>
          )}
          {parkData.features.local_sales && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Local sales active
            </span>
          )}
          {parkData.features.printer && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Printer telemetry
            </span>
          )}
        </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Some data sources are currently unavailable.</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      {isKioskPark && kioskKpis && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-6">
          <KPICard
            title="Umsatz heute"
            value={formatCurrency(kioskKpis.today.revenueCents, 'eur')}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
          <KPICard
            title="Fotos verkauft heute"
            value={formatNumber(kioskKpis.today.sold)}
            icon={Ticket}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <KPICard
            title="Fotopapier"
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
            title="Fotos verkauft (Monat)"
            value={formatNumber(kioskKpis.month.sold)}
            icon={Receipt}
            iconColor="text-slate-700"
            iconBg="bg-slate-100"
          />
          <KPICard
            title="Umsatz (Monat)"
            value={formatCurrency(kioskKpis.month.revenueCents, 'eur')}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
          <KPICard
            title="Fotos verkauft (gesamt)"
            value={formatNumber(kioskDays.reduce((sum, day) => sum + day.soldCount, 0))}
            icon={Camera}
            iconColor="text-violet-600"
            iconBg="bg-violet-50"
          />
        </div>
      )}

      {isKioskPark && (
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-800">Stoßzeiten</h3>
              <div className="inline-flex rounded-xl bg-white/50 p-1">
                {([
                  { key: 'today', label: 'Heute' },
                  { key: 'yesterday', label: 'Gestern' },
                  { key: 'custom', label: 'Anderer Tag' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPeakDayFilter(opt.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      peakDayFilter === opt.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {peakDayFilter === 'custom' && (
              <input
                type="date"
                value={peakCustomDate}
                max={todayInTimezone(kioskTimezone)}
                onChange={(event) => setPeakCustomDate(event.target.value)}
                className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-xs"
              />
            )}
            {peakHour && peakHour.sold > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Am meisten verkauft: <span className="font-medium text-slate-700">{peakHour.label}</span> ({formatNumber(peakHour.sold)} Fotos)
              </p>
            )}
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyPoints} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="rides" name="Fahrten" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="sold" name="Bildverkäufe" fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-base font-semibold text-slate-800">Erfassung von Nutzerdaten</h3>
            {unlockMode && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Aktiv: {unlockMode === 'email' ? 'E-Mail / Telefon' : unlockMode === 'survey' ? 'Umfrage' : 'Social Media'}
              </div>
            )}

            {unlockMode === 'email' && (
              <>
                <p className="mt-4 text-sm text-slate-500">Kontakte heute</p>
                <p className="text-2xl font-bold text-slate-800">{formatNumber(emailLeadsToday)}</p>
                {userDataStats.total > 0 && (
                  <div className="relative mx-auto mt-3 h-32 w-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Einwilligung erteilt', value: userDataStats.optedIn },
                            { name: 'Keine Einwilligung', value: userDataStats.notOptedIn },
                          ]}
                          dataKey="value"
                          innerRadius={38}
                          outerRadius={58}
                          paddingAngle={2}
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#cbd5e1" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-bold text-slate-800">
                        {Math.round((userDataStats.optedIn / userDataStats.total) * 100)}%
                      </span>
                      <span className="text-[10px] text-slate-400">Einwilligung</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {unlockMode === 'survey' && (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Antworten heute</dt>
                  <dd className="text-lg font-bold text-slate-800">{formatNumber(surveyToday?.total ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Ø Bewertung</dt>
                  <dd className="font-semibold text-slate-700">
                    {surveyToday?.average_score != null ? surveyToday.average_score.toFixed(1) : '–'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">NPS</dt>
                  <dd className="font-semibold text-slate-700">{surveyToday?.nps ?? '–'}</dd>
                </div>
              </dl>
            )}

            {unlockMode === 'social' && (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Freischaltungen heute</dt>
                  <dd className="text-lg font-bold text-slate-800">{formatNumber(socialToday?.unlocked ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Geteilt</dt>
                  <dd className="font-semibold text-slate-700">{formatNumber(socialToday?.posted ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Gewinnspiel-Teilnahmen</dt>
                  <dd className="font-semibold text-slate-700">{formatNumber(socialToday?.giveaway ?? 0)}</dd>
                </div>
              </dl>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden p-5 sm:p-6">
            <h3 className="text-base font-semibold text-slate-800">Benachrichtigungen und Aktivitäten</h3>
            <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {visibleActivityItems.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {activityItems.length === 0 ? 'Keine Benachrichtigungen oder Aktivitäten gefunden.' : 'Alle Benachrichtigungen wurden gelöscht.'}
                </p>
              ) : (
                visibleActivityItems.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl bg-white/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          {item.severity ? (
                            <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
                              {item.severity}
                            </span>
                          ) : (
                            <span className="status-badge bg-slate-50 text-slate-600 ring-slate-200">
                              {item.source === 'support' ? 'Support' : item.source === 'stripe' ? 'Stripe' : item.source === 'insight' ? 'Einblick' : 'System'}
                            </span>
                          )}
                          {item.status && (
                            <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
                          )}
                        </div>
                        <p className="break-words text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-1 break-words text-sm text-slate-500">{item.description}</p>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <span className="text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => dismissActivityItem(item.id)}
                          className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/60 hover:text-slate-500"
                          aria-label={`Entfernen ${item.title}`}
                          title="Entfernen"
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
      )}

      {!isKioskPark && (
      <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-6">
        {parkData.features.stripe && (
          <KPICard
            title="Online Revenue"
            value={formatCurrency(onlineRevenueCents)}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
        )}
        {parkData.features.local_sales && (
          <KPICard
            title="Local Revenue"
            value={localRevenueDisplay}
            subtitle={localRevenueFootnote}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
        )}
        <KPICard
          title="Transactions"
          value={formatNumber(totalTransactions)}
          icon={Receipt}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />
        <KPICard
          title="Errors"
          value={formatNumber(parkData.summary.error_count)}
          icon={FileWarning}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title="Warnings"
          value={formatNumber(parkData.summary.warning_count)}
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <KPICard
          title={
            parkData.features.printer && parkData.summary.printer_paper_remaining !== null
              ? 'Paper Remaining'
              : 'Print Count'
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

      <div className={`grid grid-cols-2 gap-4 ${isKioskPark ? 'xl:grid-cols-4' : 'xl:grid-cols-6'}`}>
        {liveStatusWidgets.map((widget) => (
          <button
            key={widget.id}
            type="button"
            onClick={() => handleWidgetNavigation(widget.route)}
            className="group rounded-2xl border border-white/40 bg-white/50 p-4 text-left shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/70 sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-xl p-2.5 ${widget.iconBg}`}>
                <widget.icon className={`h-4 w-4 ${widget.iconColor}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-slate-400 sm:mt-4 sm:text-xs">
              {widget.label}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-800 sm:text-lg">{widget.value}</p>
            <p className="mt-2 text-xs text-slate-500">{widget.helper}</p>
          </button>
        ))}
      </div>

      {isKioskPark ? (
      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-800">Umsatz</h3>
              <p className="text-sm text-slate-500">Tägliche Einnahmen am Automaten</p>
            </div>
          </div>
          <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="h-[17rem] min-w-[320px] w-full sm:h-80">
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
                    formatter={(value) => [`€${Number(value ?? 0).toFixed(2)}`, 'Umsatz']}
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
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800">Letzte Fotos</h3>
          {recentPhotos.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">Noch keine Fotos.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {recentPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                  {photo.imageUrl && (
                    <img src={photo.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {photo.speedKmh !== null && (
                    <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {Math.round(photo.speedKmh)} km/h
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => navigate('/photos')}
            className="glass-button-secondary mt-4 w-full justify-center"
          >
            Zu den Fotos
          </button>
        </GlassCard>
      </div>
      ) : (
      <div className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-800">Revenue Flow</h3>
              <p className="text-sm text-slate-500 break-words">
                Online and local sales combined over the last 30 days
              </p>
            </div>
            {(parkData.summary.success_rate ?? null) !== null && (
              <div className="shrink-0 text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Payment Success</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatPercent(parkData.summary.success_rate ?? 0)}
                </p>
              </div>
            )}
          </div>
          <div className="-mx-2 overflow-x-auto pb-2 sm:mx-0 sm:overflow-visible sm:pb-0">
            <div className="h-[17rem] min-w-[320px] w-full sm:h-80">
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
                    formatter={(value, name) => [`$${Number(value ?? 0).toFixed(2)}`, name === 'onlineRevenue' ? 'Online' : 'Local']}
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
          </div>
        </GlassCard>

        <GlassCard className="overflow-hidden p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-800">Benachrichtigungen und Aktivitäten</h3>
              <p className="mt-1 text-sm text-slate-500">
                Live warnings, support updates and recent operational signals
              </p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {visibleActivityItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                {activityItems.length === 0 ? 'Keine Benachrichtigungen oder Aktivitäten gefunden.' : 'Alle Benachrichtigungen wurden gelöscht.'}
              </p>
            ) : (
              visibleActivityItems.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-xl bg-white/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        {item.severity ? (
                          <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
                            {item.severity}
                          </span>
                        ) : (
                          <span className="status-badge bg-slate-50 text-slate-600 ring-slate-200">
                            {item.source === 'support' ? 'Support' : item.source === 'stripe' ? 'Stripe' : item.source === 'insight' ? 'Einblick' : 'System'}
                          </span>
                        )}
                        {item.status && (
                          <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
                        )}
                      </div>
                      <p className="break-words text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 break-words text-sm text-slate-500">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <span className="text-xs text-slate-400">{formatRelative(item.created_at)}</span>
                      <button
                        type="button"
                        onClick={() => dismissActivityItem(item.id)}
                        className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/60 hover:text-slate-500"
                        aria-label={`Entfernen ${item.title}`}
                        title="Entfernen"
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
      )}

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Recent Transactions</h3>
        <div className="space-y-3">
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-500">No recent transactions available.</p>
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
                        {item.source === 'stripe' ? 'Online' : item.source === 'kiosk' ? 'Automat' : 'Local'}
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
                Show less <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Show all {recentTransactions.length} <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </GlassCard>
    </div>
  );
}
