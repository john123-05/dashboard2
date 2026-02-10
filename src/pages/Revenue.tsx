import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, DollarSign, RefreshCw } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatCurrency, formatNumber, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';

interface AttractionRevenue {
  name: string;
  revenue: number;
  purchases: number;
}

export default function Revenue() {
  const [dailyRevenue, setDailyRevenue] = useState<{ date: string; amount: number }[]>([]);
  const [attractionRevenue, setAttractionRevenue] = useState<AttractionRevenue[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, refunds: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data, error: invokeError } = await invokeEdgeFunction('stripe-revenue');

      if (invokeError) {
        console.error('Failed to fetch Stripe revenue:', invokeError);
        setError(invokeError);
        setLoading(false);
        return;
      }

      const result = data;

      setTotals({
        revenue: Math.round(result.total_revenue * 100),
        refunds: 0,
        pending: 0,
      });

      const byDay = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        byDay.set(d.toISOString().split('T')[0], 0);
      }

      (result.revenue_by_day || []).forEach((item: { date: string; amount: number }) => {
        byDay.set(item.date, item.amount);
      });

      setDailyRevenue(
        Array.from(byDay.entries()).map(([date, amount]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          amount,
        }))
      );

      setAttractionRevenue([]);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Error loading revenue:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setLoading(false);
    }
  }

  function handleExport() {
    exportToCSV(
      dailyRevenue.map((d) => ({ date: d.date, revenue_usd: d.amount })),
      'revenue-report'
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Revenue</h2>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Revenue</h2>
          <p className="mt-1 text-sm text-slate-500">Financial performance and breakdown</p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <KPICard
          title="Total Revenue"
          value={formatCurrency(totals.revenue)}
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <KPICard
          title="Refunds"
          value={formatCurrency(totals.refunds)}
          icon={RefreshCw}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title="Pending"
          value={formatCurrency(totals.pending)}
          icon={DollarSign}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
      </div>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Daily Revenue (30 days)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyRevenue}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Revenue']}
              />
              <Area type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Revenue by Attraction</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attractionRevenue} layout="vertical">
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569' }} width={140} />
              <Tooltip
                contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {attractionRevenue.map((a) => (
            <div key={a.name} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-white/30">
              <span className="text-slate-700">{a.name}</span>
              <div className="flex items-center gap-4">
                <span className="text-slate-400">{formatNumber(a.purchases)} sales</span>
                <span className="font-semibold text-slate-800">${a.revenue.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
