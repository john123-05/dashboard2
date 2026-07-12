import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Filter } from 'lucide-react';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import KPICard from '../components/ui/KPICard';
import { getOptionalSourceWarning } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { exportToCSV, formatDateTime, formatNumber, severityColor } from '../lib/utils';
import { usePark } from '../contexts/ParkContext';

export default function Errors() {
  const { parkId } = usePark();
  const [data, setData] = useState<ParkDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'error' | 'warning' | 'info'>('all');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  async function loadData() {
    if (!parkId) {
      setError('No park selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    const result = await loadParkDashboardData(parkId);
    if (result.error || !result.data) {
      setData(createEmptyParkDashboardData(parkId));
      setNotice(
        getOptionalSourceWarning('Error log feed', result.error) ||
          'Error log feed is currently unavailable.',
      );
      setError(null);
      setLoading(false);
      return;
    }

    setData(result.data);
    setNotice(null);
    setError(null);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const items = data?.errors || [];
    if (severityFilter === 'all') return items;
    return items.filter((item) => item.severity === severityFilter);
  }, [data, severityFilter]);

  function handleExport() {
    exportToCSV(
      filtered.map((item) => ({
        occurred_at: item.occurred_at,
        severity: item.severity,
        category: item.category,
        device: item.device || '',
        source_file: item.source_file,
        status: item.status,
        payment_method: item.payment_method || '',
        description: item.description,
      })),
      'park-errors',
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-36 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Errors & Logs</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">Error loading logs</h3>
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
          <button onClick={loadData} className="glass-button-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<ParkDashboardEvent>[] = [
    {
      key: 'occurred_at',
      label: 'Time',
      render: (item) => (
        <span className="text-slate-600">{formatDateTime(item.occurred_at)}</span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (item) => (
        <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(item.severity)}`}>
          {item.severity}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (item) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.category}
        </span>
      ),
    },
    {
      key: 'device',
      label: 'Device',
      render: (item) => (
        <span>{item.device || '-'}</span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
    },
    {
      key: 'source_file',
      label: 'Source file',
      render: (item) => (
        <span className="font-mono text-xs text-slate-500">{item.source_file}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Errors & Logs</h2>
          <p className="mt-1 text-sm text-slate-500">
            Searchable operational issues derived from uploaded error and debug files
          </p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Error logs are currently limited.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <KPICard
          title="Critical"
          value={formatNumber(data.summary.critical_count)}
          icon={AlertTriangle}
          iconColor="text-rose-600"
          iconBg="bg-rose-50"
        />
        <KPICard
          title="Errors"
          value={formatNumber(data.summary.error_count)}
          icon={AlertTriangle}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
        <KPICard
          title="Warnings"
          value={formatNumber(data.summary.warning_count)}
          icon={AlertTriangle}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        title="Operational Error Log"
        searchable
        searchKeys={['category', 'device', 'description', 'source_file', 'severity']}
        pageSize={14}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={severityFilter}
              onChange={(event) => {
                setSeverityFilter(
                  event.target.value as 'all' | 'critical' | 'error' | 'warning' | 'info',
                );
              }}
              className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
