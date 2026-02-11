import { useEffect, useState } from 'react';
import { Users as UsersIcon, Search } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatDate, formatCurrency } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';

interface CustomerRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  opted_in_marketing: boolean;
  created_at: string;
  purchase_count: number;
  total_spent: number;
}

export default function Users() {
  const { t } = useI18n();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-users');

    if (invokeError) {
      console.error('Failed to fetch external users:', invokeError);
      setError(invokeError);
      setLoading(false);
      return;
    }

    const customersRes = { data: data?.customers ?? [] } as { data: any[] };
    const purchasesRes = { data: data?.purchases ?? [] } as { data: any[] };

    const purchasesByCustomer = new Map<string, { count: number; total: number }>();
    (purchasesRes.data || [])
      .filter((p) => p.status === 'completed')
      .forEach((p) => {
        const entry = purchasesByCustomer.get(p.customer_id) || { count: 0, total: 0 };
        entry.count += 1;
        entry.total += p.amount_cents;
        purchasesByCustomer.set(p.customer_id, entry);
      });

    const rows: CustomerRow[] = (customersRes.data || []).map((c) => {
      const stats = purchasesByCustomer.get(c.id) || { count: 0, total: 0 };
      return {
        ...c,
        purchase_count: stats.count,
        total_spent: stats.total,
      };
    });

    rows.sort((a, b) => b.total_spent - a.total_spent);
    setCustomers(rows);
    setError(null);
    setLoading(false);
  }

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(s) ||
      c.full_name?.toLowerCase().includes(s) ||
      c.phone?.includes(s)
    );
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="h-96 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('users.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Users</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('users.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('users.subtitle')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{customers.length}</p>
              <p className="text-xs text-slate-500">{t('users.total')}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {customers.filter((c) => c.purchase_count > 0).length}
              </p>
              <p className="text-xs text-slate-500">{t('users.paying')}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {customers.filter((c) => c.opted_in_marketing).length}
              </p>
              <p className="text-xs text-slate-500">{t('users.optins')}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-slate-100/80 px-6 py-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('users.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input py-2 pl-9 pr-4 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100/80">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.customer')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.contact')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.purchases')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.total_spent')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.joined')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.marketing')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 20).map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-white/40">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {(c.full_name || 'A')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-800">{c.full_name || t('app.unknown')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600">{c.email || c.phone || '-'}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-700">{c.purchase_count}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-slate-800">
                    {c.total_spent > 0 ? formatCurrency(c.total_spent) : '-'}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-500">{formatDate(c.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`status-badge ${
                        c.opted_in_marketing
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-50 text-slate-500 ring-slate-200'
                      }`}
                    >
                      {c.opted_in_marketing ? t('leads.opted_in') : t('leads.opted_out')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 20 && (
          <div className="border-t border-slate-100/80 px-6 py-3 text-center text-xs text-slate-400">
            Showing 20 of {filtered.length} customers
          </div>
        )}
      </GlassCard>
    </div>
  );
}
