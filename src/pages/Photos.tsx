import { useEffect, useState } from 'react';
import { Camera, ShoppingBag, Eye, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatNumber, formatPercent, formatRelative } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';

interface AttractionPhotoStats {
  name: string;
  total: number;
  purchased: number;
  available: number;
  expired: number;
}

const CHART_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#94a3b8'];

export default function Photos() {
  const [stats, setStats] = useState({ total: 0, purchased: 0, available: 0, expired: 0 });
  const [attractionStats, setAttractionStats] = useState<AttractionPhotoStats[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<
    { id: string; image_url: string; thumbnail_url: string | null; status: string; taken_at: string; attraction_name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-photos');

    if (invokeError) {
      console.error('Failed to fetch external photos:', invokeError);
      setError(invokeError);
      setLoading(false);
      return;
    }

    const photos = data?.photos || [];
    const attractions = data?.attractions || [];
    const recent = data?.recent || [];

    setStats({
      total: photos.length,
      purchased: photos.filter((p) => p.status === 'purchased').length,
      available: photos.filter((p) => p.status === 'available').length,
      expired: photos.filter((p) => p.status === 'expired').length,
    });

    const attrMap = new Map<string, AttractionPhotoStats>();
    attractions.forEach((a) =>
      attrMap.set(a.id, { name: a.name, total: 0, purchased: 0, available: 0, expired: 0 })
    );
    photos.forEach((p) => {
      const entry = attrMap.get(p.attraction_id);
      if (entry) {
        entry.total += 1;
        if (p.status === 'purchased') entry.purchased += 1;
        else if (p.status === 'available') entry.available += 1;
        else entry.expired += 1;
      }
    });
    setAttractionStats(Array.from(attrMap.values()).sort((a, b) => b.total - a.total));

    setRecentPhotos(
      (recent || []).map((p: Record<string, unknown>) => {
        const attraction = p.attraction as Record<string, unknown> | null;
        return {
          id: p.id as string,
          image_url: p.image_url as string,
          thumbnail_url: p.thumbnail_url as string | null,
          status: p.status as string,
          taken_at: p.taken_at as string,
          attraction_name: (attraction?.name as string) || 'Unknown',
        };
      })
    );
    setError(null);
    setLoading(false);
  }

  const conversionRate = stats.total > 0 ? (stats.purchased / stats.total) * 100 : 0;
  const pieData = [
    { name: 'Purchased', value: stats.purchased },
    { name: 'Available', value: stats.available },
    { name: 'Expired', value: stats.expired },
  ].filter((d) => d.value > 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Photos</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Photos</h3>
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
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Photos</h2>
        <p className="mt-1 text-sm text-slate-500">Photo analytics and performance metrics</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard title="Total Photos" value={formatNumber(stats.total)} icon={Camera} />
        <KPICard title="Purchased" value={formatNumber(stats.purchased)} icon={ShoppingBag} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
        <KPICard title="Available" value={formatNumber(stats.available)} icon={Eye} iconColor="text-amber-600" iconBg="bg-amber-100" />
        <KPICard title="Conversion" value={formatPercent(conversionRate)} icon={Clock} iconColor="text-cyan-600" iconBg="bg-cyan-100" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Status Distribution</h3>
          <div className="flex items-center gap-8">
            <div className="h-48 w-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" strokeWidth={0}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i] }} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{d.name}</p>
                    <p className="text-xs text-slate-400">{formatNumber(d.value)} photos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">By Attraction</h3>
          <div className="space-y-3">
            {attractionStats.map((a) => {
              const pct = a.total > 0 ? (a.purchased / a.total) * 100 : 0;
              return (
                <div key={a.name} className="rounded-xl bg-white/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{a.name}</span>
                    <span className="text-xs text-slate-500">{formatNumber(a.total)} photos</span>
                  </div>
                  <div className="mb-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    {formatPercent(pct)} conversion ({formatNumber(a.purchased)} sold)
                  </p>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Recent Photos</h3>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {recentPhotos.map((p) => (
            <div key={p.id} className="group overflow-hidden rounded-xl bg-white/30 transition-all hover:bg-white/50 hover:shadow-md">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={p.thumbnail_url || p.image_url}
                  alt="Photo"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-medium text-slate-700">{p.attraction_name}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">{formatRelative(p.taken_at)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.status === 'purchased'
                        ? 'bg-emerald-50 text-emerald-700'
                        : p.status === 'available'
                          ? 'bg-sky-50 text-sky-700'
                          : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
