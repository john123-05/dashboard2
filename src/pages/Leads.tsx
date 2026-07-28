import { useEffect, useMemo, useState } from 'react';
import { Download, Mail, Trash2, UserPlus } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { formatDate, formatNumber, exportToCSV } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable from '../components/ui/DataTable';
import KPICard from '../components/ui/KPICard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

function countryCodeToFlag(countryCode: string | null | undefined): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return '';
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

function leadLocaleBadge(item: Record<string, unknown>): string | null {
  const locale = typeof item.locale === 'string' ? item.locale.trim().toUpperCase() : '';
  const countryCode = typeof item.country_code === 'string' ? item.country_code.trim().toUpperCase() : '';
  const flag = countryCodeToFlag(countryCode);
  const parts = [flag, locale, countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export default function Leads() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const [leads, setLeads] = useState<Record<string, unknown>[]>([]);
  const [sourceData, setSourceData] = useState<{ source: string; count: number }[]>([]);
  const [stats, setStats] = useState({ total: 0, optedIn: 0 });
  const [filterOptIn, setFilterOptIn] = useState<boolean | null>(null);
  const [countryFilter, setCountryFilter] = useState('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, [parkId]);

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-leads', {
      query: { park_id: parkId || undefined },
    });

    if (invokeError) {
      console.error('Failed to fetch external leads:', invokeError);
      if (isEdgeSourceUnavailable(invokeError)) {
        setLeads([]);
        setStats({ total: 0, optedIn: 0 });
        setSourceData([]);
        setNotice(getOptionalSourceWarning('Lead feed', invokeError));
        setError(null);
        setLoading(false);
        return;
      }
      setError(invokeError);
      setLoading(false);
      return;
    }

    const leads = data?.leads || [];

    const rows: Record<string, unknown>[] = (leads || []).map((l: Record<string, unknown>) => {
      const park = l.park as Record<string, unknown> | null;
      return {
        ...l,
        park_name: (park?.name as string) || (l.park_name as string) || 'Unknown',
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

    setError(null);
    setNotice(null);
    setSelectedLeadIds([]);
    setLoading(false);
  }

  const filtered = leads.filter((lead) => {
    if (filterOptIn !== null && lead.opted_in !== filterOptIn) return false;
    if (countryFilter !== 'all') {
      const rowCountry = typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : '';
      if (rowCountry !== countryFilter) return false;
    }
    return true;
  });

  const countryOptions = useMemo(() => {
    return [...new Set(
      leads
        .map((lead) => (typeof lead.country_code === 'string' ? lead.country_code.trim().toUpperCase() : ''))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  function isDeletableLead(lead: Record<string, unknown>) {
    return lead.source === 'photo_claim' && typeof lead.id === 'string' && lead.id.length > 0;
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId],
    );
  }

  function toggleVisibleSelection() {
    const visibleIds = filtered
      .filter(isDeletableLead)
      .map((lead) => String(lead.id));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  }

  async function deleteLeadIds(ids: string[]) {
    if (!parkId || ids.length === 0) return;
    const plural = ids.length > 1;
    if (!confirm(plural ? `${ids.length} E-Mail-Leads wirklich löschen?` : 'Diesen E-Mail-Lead wirklich löschen?')) {
      return;
    }

    setDeleting(true);
    const { data, error: deleteError } = await invokeEdgeFunction<{ deletedIds?: string[] }>('external-leads', {
      method: 'DELETE',
      body: { park_id: parkId, ids },
      useSessionAuth: true,
    });

    if (deleteError) {
      setError(deleteError);
      setDeleting(false);
      return;
    }

    const deletedIds = Array.isArray(data?.deletedIds) ? data.deletedIds : ids;
    setLeads((current) => current.filter((lead) => !deletedIds.includes(String(lead.id ?? ''))));
    setSelectedLeadIds((current) => current.filter((id) => !deletedIds.includes(id)));
    setDeleting(false);
  }

  function handleExport() {
    exportToCSV(
        filtered.map((l) => ({
          email: l.email as string,
          name: (l.full_name as string) || '',
          source: l.source as string,
          opted_in: l.opted_in ? t('leads.opted_in') : t('leads.opted_out'),
          park: l.park_name as string,
          locale: typeof l.locale === 'string' ? l.locale : '',
          country_code: typeof l.country_code === 'string' ? l.country_code : '',
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

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('leads.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Leads</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const columns = [
    {
      key: 'select',
      label: (
        <input
          type="checkbox"
          checked={filtered.filter(isDeletableLead).length > 0 && filtered.filter(isDeletableLead).every((lead) => selectedLeadIds.includes(String(lead.id)))}
          onChange={toggleVisibleSelection}
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          aria-label="Alle sichtbaren Leads auswählen"
        />
      ),
      className: 'w-12',
      render: (item: Record<string, unknown>) => {
        if (!isDeletableLead(item)) return null;
        const leadId = String(item.id);
        return (
          <input
            type="checkbox"
            checked={selectedLeadIds.includes(leadId)}
            onChange={() => toggleLeadSelection(leadId)}
            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            aria-label={`Lead ${item.email as string} auswählen`}
          />
        );
      },
    },
    {
      key: 'email',
      label: t('leads.table.email'),
      render: (item: Record<string, unknown>) => {
        const localeBadge = leadLocaleBadge(item);
        return (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">{item.email as string}</span>
            {localeBadge && (
              <span className="inline-flex w-fit rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
                {localeBadge}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'full_name',
      label: t('leads.table.name'),
      render: (item: Record<string, unknown>) => (
        <span>{(item.full_name as string) || '-'}</span>
      ),
    },
    {
      key: 'park_name',
      label: t('leads.table.park'),
    },
    {
      key: 'source',
      label: t('leads.table.source'),
      render: (item: Record<string, unknown>) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.source as string}
        </span>
      ),
    },
    {
      key: 'opted_in',
      label: t('leads.table.opted_in'),
      render: (item: Record<string, unknown>) => (
        <span
          className={`status-badge ${
            item.opted_in
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-slate-50 text-slate-500 ring-slate-200'
          }`}
        >
          {item.opted_in ? t('leads.opted_in') : t('leads.opted_out')}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: t('leads.table.date'),
      render: (item: Record<string, unknown>) => (
        <span className="text-slate-500">{formatDate(item.created_at as string)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-14 text-right',
      render: (item: Record<string, unknown>) => {
        if (!isDeletableLead(item)) return null;
        return (
          <button
            type="button"
            onClick={() => deleteLeadIds([String(item.id)])}
            disabled={deleting}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            title="Lead löschen"
            aria-label={`Lead ${item.email as string} löschen`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('leads.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('leads.subtitle')}</p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          {t('leads.export')}
        </button>
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm text-sky-900">{t('leads.explainer')}</p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Lead data is currently unavailable.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <KPICard title={t('leads.total')} value={formatNumber(stats.total)} icon={UserPlus} iconColor="text-sky-600" iconBg="bg-sky-50" />
        <KPICard title={t('leads.optins')} value={formatNumber(stats.optedIn)} icon={Mail} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
      </div>

      <GlassCard className="p-6">
        <h3 className="mb-4 text-base font-semibold text-slate-800">{t('leads.by_source')}</h3>
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
        title={t('leads.title')}
        searchable
        searchKeys={['email', 'full_name', 'source', 'park_name', 'country_code', 'locale']}
        pageSize={10}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={filterOptIn === null ? 'all' : filterOptIn ? 'yes' : 'no'}
              onChange={(e) => {
                const v = e.target.value;
                setFilterOptIn(v === 'all' ? null : v === 'yes');
              }}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">{t('leads.all')}</option>
              <option value="yes">{t('leads.opted_in')}</option>
              <option value="no">{t('leads.opted_out')}</option>
            </select>
            <select
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">Alle Länder</option>
              {countryOptions.map((countryCode) => (
                <option key={countryCode} value={countryCode}>
                  {countryCodeToFlag(countryCode)} {countryCode}
                </option>
              ))}
            </select>
            {selectedLeadIds.length > 0 && (
              <button
                type="button"
                onClick={() => deleteLeadIds(selectedLeadIds)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {selectedLeadIds.length} löschen
              </button>
            )}
          </div>
        }
      />
    </div>
  );
}
