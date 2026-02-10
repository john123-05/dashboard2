import { useEffect, useState } from 'react';
import { Download, Mail, UserPlus, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatDate, formatNumber, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable from '../components/ui/DataTable';
import KPICard from '../components/ui/KPICard';

export default function Leads() {
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [sourceData, setSourceData] = useState<{ source: string; count: number }[]>([]);
  const [stats, setStats] = useState({ total: 0, optedIn: 0 });
  const [filterOptIn, setFilterOptIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data } = await supabase
      .from('leads')
      .select('*, park:parks(name)')
      .order('created_at', { ascending: false });

    const rows: Record<string, unknown>[] = (data || []).map((l: Record<string, unknown>) => {
      const park = l.park as Record<string, unknown> | null;
      return {
        ...l,
        park_name: (park?.name as string) || 'Unknown',
      };
    });

    setLeads(rows);
    setStats({
      total: rows.length,
      optedIn: rows.filter((l) => l.opted_in === true).length,
    });

    const bySource = new Map<string, number>();
    rows.forEach((l) => {
      const src = String(l.source || 'unknown');
      bySource.set(src, (bySource.get(src) || 0) + 1);
    });
    setSourceData(
      Array.from(bySource.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
    );

    setLoading(false);
  }

  const filtered = filterOptIn === null ? leads : leads.filter((l) => l.opted_in === filterOptIn);

  function handleExport() {
    exportToCSV(
      filtered.map((l) => ({
        email: l.email as string,
        name: (l.full_name as string) || '',
        source: l.source as string,
        opted_in: l.opted_in ? 'Yes' : 'No',
        park: l.park_name as string,
        date: l.created_at as string,
      })),
      'leads-export'
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  const columns = [
    {
      key: 'email',
      label: 'Email',
      render: (item: Record<string, unknown>) => (
        <span className="font-medium text-slate-700">{item.email as string}</span>
      ),
    },
    {
      key: 'full_name',
      label: 'Name',
      render: (item: Record<string, unknown>) => (
        <span>{(item.full_name as string) || '-'}</span>
      ),
    },
    {
      key: 'park_name',
      label: 'Park',
    },
    {
      key: 'source',
      label: 'Source',
      render: (item: Record<string, unknown>) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.source as string}
        </span>
      ),
    },
    {
      key: 'opted_in',
      label: 'Opt-in',
      render: (item: Record<string, unknown>) => (
        <span
          className={`status-badge ${
            item.opted_in
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-50 text-slate-500 ring-slate-200'
          }`}
        >
          {item.opted_in ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (item: Record<string, unknown>) => (
        <span className="text-slate-500">{formatDate(item.created_at as string)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Leads & Marketing</h2>
          <p className="mt-1 text-sm text-slate-500">Email lists, lead sources, and opt-in management</p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <KPICard title="Total Leads" value={formatNumber(stats.total)} icon={UserPlus} iconColor="text-sky-600" iconBg="bg-sky-50" />
        <KPICard title="Marketing Opt-ins" value={formatNumber(stats.optedIn)} icon={Mail} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
      </div>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Leads by Source</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sourceData}>
              <XAxis dataKey="source" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <DataTable
        data={filtered}
        columns={columns}
        title="Lead List"
        searchable
        searchKeys={['email', 'full_name', 'source', 'park_name']}
        pageSize={10}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterOptIn === null ? 'all' : filterOptIn ? 'yes' : 'no'}
              onChange={(e) => {
                const v = e.target.value;
                setFilterOptIn(v === 'all' ? null : v === 'yes');
              }}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">All leads</option>
              <option value="yes">Opted in</option>
              <option value="no">Not opted in</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
