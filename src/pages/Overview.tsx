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
import { useI18n, useLocaleTag } from '../lib/i18n';
import { useNotifications } from '../contexts/NotificationsContext';
import {
  formatCurrency as baseFormatCurrency,
  formatNumber as baseFormatNumber,
  formatPercent as baseFormatPercent,
  formatRelative as baseFormatRelative,
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
  const feed = useNotifications();
  const locale = useLocaleTag();
  const formatCurrency = (cents: number, currency = 'usd') => baseFormatCurrency(cents, currency, locale);
  const formatNumber = (value: number) => baseFormatNumber(value, locale);
  const formatPercent = (value: number) => baseFormatPercent(value, locale);
  const formatRelative = (date: string) => baseFormatRelative(date, locale);
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
      setError(t('app.no_park_selected'));
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
            invokeEdgeFunction<{ leads: Record<string, unknown>[] }>('external-leads', {
              useSessionAuth: true,
              query: { park_id: parkId },
            }),
            fetchRecentPhotos(parkId, 4).catch(() => []),
            loadParkDashboardData(parkId).catch(() => ({ data: null, error: 'Operations feed unavailable' })),
            invokeEdgeFunction<{ customers: { id: string }[] }>('external-users', {
              useSessionAuth: true,
              query: { park_id: parkId },
            }),
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
          parkDashboardResult.data ?? createEmptyParkDashboardData(parkId, parkName || t('app.selected_park'));
        setParkData({
          ...kioskParkData,
          park_name: kioskParkData.park_name || parkName || t('app.selected_park'),
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
            title: t('overview.kiosk_sold'),
            description: purchase.email ? t('overview.picked_up_later', { email: purchase.email }) : t('overview.no_pickup_status'),
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
          useSessionAuth: true,
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
        createEmptyParkDashboardData(parkId, parkName || t('app.selected_park'));
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
        park_name: dashboardBase.park_name || parkName || t('app.selected_park'),
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
            ? t('overview.sale_method', { method: event.payment_method.toUpperCase() })
            : t('overview.local_sale'),
          description: event.description,
          created_at: event.occurred_at,
          severity: event.severity,
          status: event.status,
        })),
        ...succeededStripePayments.slice(0, 12).map((payment) => ({
          id: `stripe-${payment.id}`,
          source: 'stripe' as const,
          title: t('overview.online_payment'),
          description:
            payment.description ||
            payment.customer_email ||
            t('overview.stripe_payment', { id: payment.id.slice(0, 10) }),
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
    };
  }, [isKioskPark, kioskDays, kioskTimezone]);

  const kioskChartData = useMemo(() => toChartSeries(kioskDays), [kioskDays]);

  function formatDurationShort(minutes: number): string {
    if (minutes < 60) return t('overview.dur_min', { n: minutes });
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return t(days === 1 ? 'overview.dur_day' : 'overview.dur_days', { d: days, h: hours % 24 });
    }
    return rest === 0 ? t('overview.dur_hours', { h: hours }) : t('overview.dur_hours_min', { h: hours, m: rest });
  }

  // Re-render the open/closed line every minute so the countdown stays current.
  const [clockTick, setClockTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    }).formatToParts(new Date(clockTick));
    const nowHour = Number(nowParts.find((p) => p.type === 'hour')?.value ?? 0);
    const nowMinute = Number(nowParts.find((p) => p.type === 'minute')?.value ?? 0);
    const nowMinutes = nowHour * 60 + nowMinute;
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    // After closing: minutes until the next opening (skips closed days, looks two weeks ahead).
    function minutesUntilNextOpening(): number | null {
      for (let offset = 1; offset <= 14; offset += 1) {
        const date = new Date(`${today}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + offset);
        const next = getEffectiveScheduleForDate(kioskOpeningHoursConfig ?? null, date.toISOString().slice(0, 10), kioskOpeningHours);
        if (!next) continue;
        const [h, m] = next.open.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) continue;
        return 24 * 60 - nowMinutes + (offset - 1) * 24 * 60 + h * 60 + m;
      }
      return null;
    }

    const isOpen = nowMinutes >= openMinutes && nowMinutes < closeMinutes;
    let label: string;
    if (isOpen) {
      label = t('overview.park_open', { time: formatDurationShort(closeMinutes - nowMinutes) });
    } else if (nowMinutes < openMinutes) {
      label = t('overview.park_opens_in', { time: formatDurationShort(openMinutes - nowMinutes) });
    } else {
      const untilOpen = minutesUntilNextOpening();
      label = untilOpen === null
        ? t('overview.park_closed_today')
        : t('overview.park_closed_opens_in', { time: formatDurationShort(untilOpen) });
    }

    return { isOpen, label };
  }, [isKioskPark, kioskOpeningHours, kioskOpeningHoursConfig, kioskTimezone, t, clockTick]);

  const greeting = useMemo(() => {
    const tz = isKioskPark && kioskTimezone ? kioskTimezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    if (hour < 11) return t('greeting.morning');
    if (hour < 14) return t('greeting.noon');
    if (hour < 18) return t('greeting.afternoon');
    if (hour < 22) return t('greeting.evening');
    return t('greeting.night');
  }, [isKioskPark, kioskTimezone, t]);

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
      title: isUp ? t('overview.trend_up_title') : t('overview.trend_down_title'),
      description: t(isUp ? 'overview.trend_up_desc' : 'overview.trend_down_desc', { percent: Math.abs(changePercent) }),
      created_at: new Date().toISOString(),
      severity: isUp ? undefined : 'warning',
    };
  }, [isKioskPark, kioskDays, t]);

  // Meldungen aus dem gemeinsamen Feed (Glocke oben rechts): Automat offline,
  // Gerät ausgefallen, Papier knapp ... Support-Antworten bringt die Übersicht
  // schon selbst mit, daher hier ohne. Wegklicken = in den Papierkorb, wie in
  // der Glocke. Nur die letzten 7 Tage.
  const feedActivityItems = useMemo<ActivityItem[]>(() => {
    const cutoff = Date.now() - 7 * 86_400_000;
    return feed.all
      .filter((item) => item.kind !== 'support' && new Date(item.createdAt).getTime() >= cutoff)
      .map((item) => ({
        id: `feed-${item.id}`,
        source: 'ops' as const,
        title: item.title,
        description: item.text,
        created_at: item.createdAt,
        severity: item.severity === 'info' ? undefined : item.severity,
      }));
  }, [feed.all]);

  const visibleActivityItems = useMemo(() => {
    const items = [...feedActivityItems, ...(revenueTrendItem ? [revenueTrendItem] : []), ...activityItems]
      .filter((item) => !dismissedActivityIds.includes(item.id));
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [feedActivityItems, activityItems, revenueTrendItem, dismissedActivityIds]);
  const localRevenueDisplay =
    localRevenueCents > 0
      ? formatCurrency(localRevenueCents)
      : localUnconfirmedCents > 0
        ? t('overview.local_detected', { amount: formatCurrency(localUnconfirmedCents) })
        : localUnknownAmountCount > 0
          ? t('overview.local_unknown')
          : formatCurrency(0);
  const localRevenueFootnote =
    localRevenueCents > 0
      ? t('overview.local_note_confirmed')
      : localUnconfirmedCents > 0
        ? t('overview.local_note_detected')
        : localUnknownAmountCount > 0
          ? t('overview.local_note_unknown')
          : t('overview.local_note_none');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !parkData) {
    return (
      <div className="space-y-6">
        <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">
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
            label: t('overview.last_activity'),
            value: parkData.summary.last_activity_at
              ? formatRelative(parkData.summary.last_activity_at)
              : '-',
            helper: t('overview.open_health'),
            route: '/health',
            icon: Activity,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-50',
          },
          {
            id: 'data-files',
            label: t('overview.files_scanned'),
            value: formatNumber(parkData.sources.files_scanned || 0),
            helper: t('overview.open_operations'),
            route: '/operations',
            icon: Receipt,
            iconColor: 'text-sky-600',
            iconBg: 'bg-sky-50',
          },
          {
            id: 'recognized-ops',
            label: t('overview.recognized_files'),
            value: formatNumber(parkData.sources.recognized_files || 0),
            helper: t('overview.open_operations'),
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
            label: t('overview.users'),
            value: formatNumber(totalUsers),
            helper: t('overview.open_users'),
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
            label: t('nav.photos'),
            value: formatNumber(totalPhotos),
            helper: t('overview.open_photos'),
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
            label: t('overview.active_attractions'),
            value: formatNumber(activeAttractions),
            helper: t('overview.open_photos'),
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
            label: t('overview.conversion_today'),
            value:
              kioskKpis.today.expected && kioskKpis.today.expected > 0
                ? formatPercent((kioskKpis.today.sold / kioskKpis.today.expected) * 100)
                : '-',
            helper: t('overview.sold_per_ride'),
            route: '/revenue',
            icon: Percent,
            iconColor: 'text-fuchsia-600',
            iconBg: 'bg-fuchsia-50',
          },
          {
            id: 'rides-today',
            label: t('overview.rides_today'),
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
    if (itemId.startsWith('feed-')) {
      feed.moveToTrash(itemId.slice(5));
      return;
    }
    setDismissedActivityIds((current) =>
      current.includes(itemId) ? current : [...current, itemId],
    );
  }

  return (
    <div className="space-y-6 overflow-x-clip">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {t('overview.title')} · {parkName || parkData.park_name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h2>
            {!isKioskPark && <span className={`status-badge ${statusTone}`}>{systemStatusLabel}</span>}
            {parkOpenStatus && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${parkOpenStatus.isOpen ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  aria-hidden="true"
                />
                {parkOpenStatus.label}
              </span>
            )}
          </div>
          {!isKioskPark && parkData.summary.last_data_at && (
            <p className="mt-1 text-sm text-slate-500">{t('overview.last_data', { time: formatRelative(parkData.summary.last_data_at) })}</p>
          )}
        </div>
        {!isKioskPark && (
        <div className="flex flex-wrap gap-2">
          {parkData.features.stripe && (
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              {t('overview.stripe_enabled')}
            </span>
          )}
          {parkData.features.local_sales && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {t('overview.local_active')}
            </span>
          )}
          {parkData.features.printer && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              {t('overview.printer_telemetry')}
            </span>
          )}
        </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{t('overview.sources_unavailable')}</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      {isKioskPark && kioskKpis && (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-6">
          <KPICard
            title={t('overview.revenue_today')}
            value={formatCurrency(kioskKpis.today.revenueCents, 'eur')}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
          <KPICard
            title={t('overview.photos_sold_today')}
            value={formatNumber(kioskKpis.today.sold)}
            icon={Ticket}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <KPICard
            title={t('config.photo_paper')}
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
            title={t('overview.photos_sold_month')}
            value={formatNumber(kioskKpis.month.sold)}
            icon={Receipt}
            iconColor="text-slate-700"
            iconBg="bg-slate-100"
          />
          <KPICard
            title={t('overview.revenue_month')}
            value={formatCurrency(kioskKpis.month.revenueCents, 'eur')}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
          <KPICard
            title={t('overview.photos_sold_total')}
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
              <h3 className="text-base font-semibold text-slate-800">{t('overview.peak_hours')}</h3>
              <div className="inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5">
                {([
                  { key: 'today', label: t('overview.today') },
                  { key: 'yesterday', label: t('overview.yesterday') },
                  { key: 'custom', label: t('overview.other_day') },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPeakDayFilter(opt.key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      peakDayFilter === opt.key ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
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
                {t('overview.peak_sales', { hour: peakHour.label, count: formatNumber(peakHour.sold) })}
              </p>
            )}
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyPoints} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="rides" name={t('overview.rides')} fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="sold" name={t('overview.photo_sales')} fill="#f97316" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h3 className="text-base font-semibold text-slate-800">{t('overview.visitor_data')}</h3>
            {unlockMode && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                {t('overview.active_mode', { mode: unlockMode === 'email' ? t('overview.email_phone') : unlockMode === 'survey' ? t('crm.tab_survey') : t('crm.tab_social') })}
              </div>
            )}

            {unlockMode === 'email' && (
              <>
                <p className="mt-4 text-sm text-slate-500">{t('overview.contacts_today')}</p>
                <p className="text-2xl font-light text-[color:var(--ink)]">{formatNumber(emailLeadsToday)}</p>
                {userDataStats.total > 0 && (
                  <div className="relative mx-auto mt-3 h-32 w-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: t('overview.consent_given'), value: userDataStats.optedIn },
                            { name: t('overview.no_consent'), value: userDataStats.notOptedIn },
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
                      <span className="text-sm font-semibold text-[color:var(--ink)]">
                        {Math.round((userDataStats.optedIn / userDataStats.total) * 100)}%
                      </span>
                      <span className="text-[10px] text-slate-400">{t('overview.consent')}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {unlockMode === 'survey' && (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">{t('overview.answers_today')}</dt>
                  <dd className="text-lg font-semibold text-[color:var(--ink)]">{formatNumber(surveyToday?.total ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">{t('overview.avg_rating')}</dt>
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
                  <dt className="text-slate-500">{t('overview.unlocks_today')}</dt>
                  <dd className="text-lg font-semibold text-[color:var(--ink)]">{formatNumber(socialToday?.unlocked ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">{t('overview.shared')}</dt>
                  <dd className="font-semibold text-slate-700">{formatNumber(socialToday?.posted ?? 0)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">{t('overview.giveaway_entries')}</dt>
                  <dd className="font-semibold text-slate-700">{formatNumber(socialToday?.giveaway ?? 0)}</dd>
                </div>
              </dl>
            )}
          </GlassCard>

          <GlassCard className="overflow-hidden p-5 sm:p-6">
            <h3 className="text-base font-semibold text-slate-800">{t('overview.notifications_activity')}</h3>
            <div className="mt-3 max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {visibleActivityItems.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {activityItems.length === 0 ? t('overview.no_activity_items') : t('overview.all_dismissed')}
                </p>
              ) : (
                visibleActivityItems.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          {item.severity ? (
                            <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
                              {t(`health.sev_${item.severity}`)}
                            </span>
                          ) : (
                            <span className="status-badge bg-slate-50 text-slate-600 ring-slate-200">
                              {item.source === 'support' ? t('nav.support') : item.source === 'stripe' ? 'Stripe' : item.source === 'insight' ? t('overview.insight') : t('overview.system')}
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
                          className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                          aria-label={t('overview.dismiss_item', { title: item.title })}
                          title={t('overview.dismiss')}
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
            title={t('overview.online_revenue')}
            value={formatCurrency(onlineRevenueCents)}
            icon={CreditCard}
            iconColor="text-sky-600"
            iconBg="bg-sky-50"
          />
        )}
        {parkData.features.local_sales && (
          <KPICard
            title={t('overview.local_revenue')}
            value={localRevenueDisplay}
            subtitle={localRevenueFootnote}
            icon={Wallet}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-50"
          />
        )}
        <KPICard
          title={t('overview.transactions')}
          value={formatNumber(totalTransactions)}
          icon={Receipt}
          iconColor="text-slate-700"
          iconBg="bg-slate-100"
        />
        <KPICard
          title={t('health.errors')}
          value={formatNumber(parkData.summary.error_count)}
          icon={FileWarning}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title={t('health.warnings')}
          value={formatNumber(parkData.summary.warning_count)}
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <KPICard
          title={
            parkData.features.printer && parkData.summary.printer_paper_remaining !== null
              ? t('overview.paper_remaining')
              : t('overview.print_count')
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
            className="group rounded-xl border border-[color:var(--line)] bg-white p-4 text-left transition-colors duration-150 hover:border-brand-300 sm:p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-xl p-2.5 ${widget.iconBg}`}>
                <widget.icon className={`h-4 w-4 ${widget.iconColor}`} />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-500" />
            </div>
            <p className="mt-3 text-[11px] text-slate-400 sm:mt-4 sm:text-xs">
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
              <h3 className="text-base font-semibold text-slate-800">{t('nav.revenue')}</h3>
              <p className="text-sm text-slate-500">{t('overview.kiosk_daily_revenue')}</p>
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
          <h3 className="text-base font-semibold text-slate-800">{t('overview.latest_photos')}</h3>
          {recentPhotos.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">{t('overview.no_photos_yet')}</p>
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
              <h3 className="text-base font-semibold text-slate-800">{t('overview.revenue_flow')}</h3>
              <p className="text-sm text-slate-500 break-words">
                {t('overview.revenue_flow_sub')}
              </p>
            </div>
            {(parkData.summary.success_rate ?? null) !== null && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-400">{t('overview.payment_success')}</p>
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
              <h3 className="text-base font-semibold text-slate-800">{t('overview.notifications_activity')}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('overview.activity_desc')}
              </p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {visibleActivityItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                {activityItems.length === 0 ? t('overview.no_activity_items') : t('overview.all_dismissed')}
              </p>
            ) : (
              visibleActivityItems.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        {item.severity ? (
                          <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
                            {t(`health.sev_${item.severity}`)}
                          </span>
                        ) : (
                          <span className="status-badge bg-slate-50 text-slate-600 ring-slate-200">
                            {item.source === 'support' ? t('nav.support') : item.source === 'stripe' ? 'Stripe' : item.source === 'insight' ? t('overview.insight') : t('overview.system')}
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
                        className="rounded-lg p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
                        aria-label={t('overview.dismiss_item', { title: item.title })}
                        title={t('overview.dismiss')}
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
        <h3 className="mb-4 text-base font-semibold text-slate-800">{t('overview.recent_transactions')}</h3>
        <div className="space-y-3">
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-500">{t('overview.no_transactions')}</p>
          ) : (
            (showAllTransactions ? recentTransactions : recentTransactions.slice(0, 3)).map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-4">
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
                        {item.source === 'stripe' ? t('overview.online') : item.source === 'kiosk' ? t('config.kiosk') : t('overview.local')}
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
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            {showAllTransactions ? (
              <>
                {t('overview.show_less')} <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                {t('overview.show_all', { count: recentTransactions.length })} <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </GlassCard>
    </div>
  );
}
