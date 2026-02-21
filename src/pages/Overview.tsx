import { useEffect, useRef, useState } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Zap, Users as UsersIcon, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { useI18n } from '../lib/i18n';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatCurrency, formatNumber, formatPercent, formatDateTime, formatRelative, statusColor } from '../lib/utils';
import KPICard from '../components/ui/KPICard';
import GlassCard from '../components/ui/GlassCard';
import type { Purchase, Photo } from '../lib/types';

interface DailyData {
  date: string;
  revenue: number;
  purchases: number;
}

export default function Overview() {
  const { profile } = useAuth();
  const { parkId } = usePark();
  const { t } = useI18n();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [activeAttractions, setActiveAttractions] = useState(0);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<(Purchase & { photo: Photo })[]>([]);
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [activityItems, setActivityItems] = useState<
    {
      id: string;
      kind: 'health' | 'support';
      title: string;
      message: string;
      created_at: string;
      severity?: 'info' | 'warning' | 'error' | 'critical';
      status?: string;
    }[]
  >([]);
  const [dismissedActivity, setDismissedActivity] = useState<Set<string>>(new Set());
  const kpiScrollRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  async function loadData() {
    if (!parkId) {
      setError('No park selected');
      setLoading(false);
      return;
    }

    try {
      const [
        revenueResult,
        paymentsResult,
        externalUsersResult,
        externalPhotosResult,
        attractionsResult,
        healthResult,
      ] = await Promise.all([
        invokeEdgeFunction('stripe-revenue'),
        invokeEdgeFunction('stripe-payments'),
        invokeEdgeFunction('external-users', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction('external-photos', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction('external-attractions', {
          query: { park_id: parkId },
        }),
        invokeEdgeFunction('system-health', {
          query: { park_id: parkId },
        }),
      ]);

      if (revenueResult.error) {
        console.error('Failed to fetch revenue data', revenueResult.error);
        setError(`Revenue: ${revenueResult.error}`);
        setLoading(false);
        return;
      }

      if (paymentsResult.error) {
        console.error('Failed to fetch payments data', paymentsResult.error);
        setError(`Payments: ${paymentsResult.error}`);
        setLoading(false);
        return;
      }

      if (externalUsersResult.error) {
        console.error('Failed to fetch user/purchase data', externalUsersResult.error);
        setError(`Users: ${externalUsersResult.error}`);
        setLoading(false);
        return;
      }

      if (externalPhotosResult.error) {
        console.error('Failed to fetch photos data', externalPhotosResult.error);
        setError(`Photos: ${externalPhotosResult.error}`);
        setLoading(false);
        return;
      }

      if (attractionsResult.error) {
        console.error('Failed to fetch attractions data', attractionsResult.error);
        setError(`Attractions: ${attractionsResult.error}`);
        setLoading(false);
        return;
      }

      const revenueData = revenueResult.data;
      const payments = (paymentsResult.data?.payments || []) as {
        id: string;
        amount: number;
        status: string;
        created_at: string;
      }[];
      const succeededPayments = payments.filter((p) => p.status === 'succeeded');

      const customers = (externalUsersResult.data?.customers || []) as { id: string }[];
      const photos = (externalPhotosResult.data?.photos || []) as { id: string }[];
      const attractions = (attractionsResult.data?.attractions || []) as { is_active?: boolean }[];
      setTotalRevenue(Math.round((revenueData?.total_revenue || 0) * 100));
      setTotalPurchases(succeededPayments.length);
      setTotalPhotos(photos.length);
      setActiveAttractions(attractions.filter((a) => a.is_active !== false).length);
      setTotalUsers(customers.length);

      const byDay = new Map<string, { revenue: number; purchases: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        byDay.set(key, { revenue: 0, purchases: 0 });
      }

      (revenueData?.revenue_by_day || []).forEach((item: { date: string; amount: number }) => {
        const entry = byDay.get(item.date);
        if (entry) {
          entry.revenue = item.amount;
        }
      });

      succeededPayments.forEach((p) => {
        const day = new Date(p.created_at).toISOString().split('T')[0];
        const entry = byDay.get(day);
        if (entry) {
          entry.purchases += 1;
        }
      });

      setDailyData(
        Array.from(byDay.entries()).map(([date, d]) => ({
          date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
          revenue: d.revenue,
          purchases: d.purchases,
        }))
      );

      const recentStripePurchases = succeededPayments.slice(0, 20).map((p) => ({
        id: p.id,
        amount_cents: Math.round(p.amount * 100),
        purchased_at: p.created_at,
        status: 'completed',
        photo: {} as Photo,
      }));

      setRecentPurchases(recentStripePurchases as (Purchase & { photo: Photo })[]);

      const [{ data: supportTickets }] = await Promise.all([
        supabase
          .from('support_tickets')
          .select('id, subject, status, updated_at, created_at')
          .order('updated_at', { ascending: false })
          .limit(10),
      ]);

      const healthItems = ((healthResult.data?.events || []) as any[]).map((e: any) => ({
        id: `health-${e.id || `${Date.now()}-${Math.random()}`}`,
        kind: 'health' as const,
        title: `System health: ${String(e.event_type || 'event')}`,
        message: String(e.message || ''),
        created_at: e.created_at,
        severity: e.severity,
      }));

      const ticketItems = (supportTickets || []).map((t: any) => ({
        id: `support-${t.id}`,
        kind: 'support' as const,
        title: `Support ticket updated`,
        message: `${t.subject} · ${String(t.status || '').replace('_', ' ')}`,
        created_at: t.updated_at || t.created_at,
        status: t.status,
      }));

      const merged = [...healthItems, ...ticketItems]
        .filter((i) => i.created_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 12);

      setActivityItems(merged);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Error loading overview data:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setLoading(false);
    }
  }

  const conversionRate = totalPhotos > 0 ? (totalPurchases / totalPhotos) * 100 : 0;
  const visiblePurchases = showAllPurchases ? recentPurchases : recentPurchases.slice(0, 4);
  const visibleActivity = activityItems.filter((a) => !dismissedActivity.has(a.id));
  const healthAlerts = visibleActivity.filter(
    (a) => a.kind === 'health' && (a.severity === 'error' || a.severity === 'critical')
  ).length;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">{t('overview.error_title')}</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('overview.title')}</h2>
          <span className="text-sm font-medium text-slate-500">
            {(() => {
              const hour = new Date().getHours();
              const greeting =
                hour < 12
                  ? t('greeting.morning')
                  : hour < 18
                    ? t('greeting.afternoon')
                    : t('greeting.evening');
              const name = profile?.full_name?.split(' ')[0];
              return name ? `${greeting}, ${name}` : greeting;
            })()}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{t('overview.subtitle')}</p>
      </div>

      <div className="relative max-w-full overflow-hidden">
        <button
          className="absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/70 p-1.5 text-slate-500 shadow-sm backdrop-blur hover:text-slate-700 xl:flex"
          onClick={() => kpiScrollRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/70 p-1.5 text-slate-500 shadow-sm backdrop-blur hover:text-slate-700 xl:flex"
          onClick={() => kpiScrollRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div
          ref={kpiScrollRef}
          className="flex w-full min-w-0 gap-4 overflow-x-auto pb-1 pr-2 scrollbar-thin snap-x snap-mandatory overscroll-x-contain"
        >
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.total_revenue')}
              value={formatCurrency(totalRevenue)}
              change={12.5}
              icon={DollarSign}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.monthly_revenue')}
              value={formatCurrency(Math.round((dailyData.reduce((s, d) => s + d.revenue, 0) || 0) * 100))}
              icon={DollarSign}
              iconColor="text-sky-600"
              iconBg="bg-sky-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.purchases')}
              value={formatNumber(totalPurchases)}
              change={8.2}
              icon={ShoppingCart}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.total_users')}
              value={totalUsers !== null ? formatNumber(totalUsers) : '—'}
              icon={UsersIcon}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.health_alerts')}
              value={formatNumber(healthAlerts)}
              icon={Activity}
              iconColor="text-rose-600"
              iconBg="bg-rose-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.conversion_rate')}
              value={formatPercent(conversionRate)}
              change={2.1}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
          </div>
          <div className="w-[240px] flex-none snap-start">
            <KPICard
              title={t('overview.kpi.active_attractions')}
              value={formatNumber(activeAttractions)}
              icon={Zap}
              iconColor="text-cyan-600"
              iconBg="bg-cyan-50"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <GlassCard className="p-6 xl:col-span-3">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('overview.revenue_trend')}</h3>
          <div className="h-64 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(255,255,255,0.9)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                  }}
                  formatter={(value, name) => {
                    if (name === 'purchases') {
                      return [Number(value ?? 0).toFixed(0), 'Purchases'];
                    }
                    return [`$${Number(value ?? 0).toFixed(2)}`, 'Revenue'];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  fill="url(#revenueGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8">
            <h4 className="mb-3 text-sm font-semibold text-slate-700">{t('overview.purchases_trend')}</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(255,255,255,0.9)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
                    }}
                    formatter={(value) => [Number(value ?? 0).toFixed(0), 'Purchases']}
                  />
                  <Line
                    type="monotone"
                    dataKey="purchases"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>

        <div className="xl:col-span-2 flex flex-col gap-6">
          <GlassCard className="p-6 h-[320px] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">{t('overview.news')}</h3>
            </div>
            <div className="space-y-3 overflow-y-auto pr-2 scrollbar-thin">
              {visibleActivity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-white/30 px-4 py-3 transition-all duration-300 hover:bg-white/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          item.severity === 'critical'
                            ? 'bg-rose-500'
                            : item.severity === 'error'
                              ? 'bg-orange-500'
                              : item.severity === 'warning'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                        }`}
                      />
                      <p className="text-sm font-semibold text-slate-700">{item.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatRelative(item.created_at)}
                    </p>
                  </div>
                  <button
                    aria-label={t('app.dismiss')}
                    onClick={() => {
                      setDismissedActivity((prev) => {
                        const next = new Set(prev);
                        next.add(item.id);
                        return next;
                      });
                    }}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                </div>
              ))}
              {visibleActivity.length === 0 && (
                <p className="py-6 text-center text-sm text-slate-400">
                  {t('overview.no_activity')}
                </p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6 xl:mt-6 h-[320px] flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">{t('overview.recent_purchases')}</h3>
              {recentPurchases.length > 4 && (
                <button
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  onClick={() => setShowAllPurchases((v) => !v)}
                >
                  {showAllPurchases ? t('app.collapse') : t('app.expand')}
                </button>
              )}
            </div>
            <div
              className={`space-y-3 overflow-y-auto pr-2 scrollbar-thin ${
                showAllPurchases ? '' : 'max-h-56'
              }`}
            >
              {(showAllPurchases ? recentPurchases : visiblePurchases).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-white/30 px-4 py-3 transition-colors hover:bg-white/50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {formatCurrency(p.amount_cents)}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(p.purchased_at)}</p>
                  </div>
                  <span className={`status-badge ${statusColor(p.status)}`}>
                    {p.status}
                  </span>
                </div>
              ))}
              {recentPurchases.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">{t('overview.no_recent_purchases')}</p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
