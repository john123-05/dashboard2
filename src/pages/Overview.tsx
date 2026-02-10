import { useEffect, useState } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatCurrency, formatNumber, formatPercent, formatDateTime, statusColor } from '../lib/utils';
import KPICard from '../components/ui/KPICard';
import GlassCard from '../components/ui/GlassCard';
import type { Purchase, Photo } from '../lib/types';

interface DailyData {
  date: string;
  revenue: number;
  purchases: number;
}

export default function Overview() {
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [activeAttractions, setActiveAttractions] = useState(0);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<(Purchase & { photo: Photo })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [revenueResult, paymentsResult] = await Promise.all([
        invokeEdgeFunction('stripe-revenue'),
        invokeEdgeFunction('stripe-payments'),
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

      const revenueData = revenueResult.data;
      const paymentsData = paymentsResult.data;

      const payments = paymentsData.payments || [];
      const succeededPayments = payments.filter((p: { status: string }) => p.status === 'succeeded');

      setTotalRevenue(Math.round(revenueData.total_revenue * 100));
      setTotalPurchases(succeededPayments.length);
      setTotalPhotos(0);
      setActiveAttractions(0);

      const byDay = new Map<string, { revenue: number; purchases: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        byDay.set(key, { revenue: 0, purchases: 0 });
      }

      (revenueData.revenue_by_day || []).forEach((item: { date: string; amount: number }) => {
        const entry = byDay.get(item.date);
        if (entry) {
          entry.revenue = item.amount;
        }
      });

      succeededPayments.forEach((p: { created_at: string }) => {
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

      const recentPayments = succeededPayments
        .slice(0, 8)
        .map((p: { id: string; amount: number; created_at: string; status: string }) => ({
          id: p.id,
          amount_cents: Math.round(p.amount * 100),
          purchased_at: p.created_at,
          status: p.status,
          photo: {} as Photo,
        }));

      setRecentPurchases(recentPayments);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Error loading overview data:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setLoading(false);
    }
  }

  const conversionRate = totalPhotos > 0 ? (totalPurchases / totalPhotos) * 100 : 0;

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
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Stripe Data</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-500">Your park performance at a glance</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          change={12.5}
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <KPICard
          title="Purchases"
          value={formatNumber(totalPurchases)}
          change={8.2}
          icon={ShoppingCart}
          iconColor="text-sky-600"
          iconBg="bg-sky-50"
        />
        <KPICard
          title="Conversion Rate"
          value={formatPercent(conversionRate)}
          change={2.1}
          icon={TrendingUp}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <KPICard
          title="Active Attractions"
          value={formatNumber(activeAttractions)}
          icon={Zap}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <GlassCard className="p-6 xl:col-span-3">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Revenue Trend</h3>
          <div className="h-64">
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
                  formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Revenue']}
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
        </GlassCard>

        <GlassCard className="p-6 xl:col-span-2">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Recent Purchases</h3>
          <div className="space-y-3">
            {recentPurchases.map((p) => (
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
              <p className="py-8 text-center text-sm text-slate-400">No recent purchases</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
