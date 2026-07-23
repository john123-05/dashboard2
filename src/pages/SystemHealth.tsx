import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw, Printer, PlugZap, Download, Filter } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { exportToCSV, formatDateTime, formatRelative, severityColor, formatNumber } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

interface LegacySystemHealthResponse {
  generated_at: string;
  services: Array<{
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency?: number;
    detail?: string;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    created_at: string;
  }>;
  metrics: Record<string, unknown>;
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function mapLegacySystemHealth(
  parkId: string,
  legacy: LegacySystemHealthResponse,
): ParkDashboardData {
  const base = createEmptyParkDashboardData(parkId);
  const services = legacy.services || [];
  const events = legacy.events || [];
  const lastActivityAt = latestIso([
    legacy.metrics.last_photo_at as string | undefined,
    legacy.metrics.last_purchase_at as string | undefined,
    legacy.metrics.last_stripe_charge_at as string | undefined,
    legacy.generated_at,
  ]);

  const communicationStatus =
    services.some((service) => service.status === 'down')
      ? 'down'
      : services.some((service) => service.status === 'degraded')
        ? 'degraded'
        : 'operational';

  return {
    ...base,
    features: {
      ...base.features,
      stripe: true,
      health: true,
      errors: true,
    },
    summary: {
      ...base.summary,
      error_count: events.filter((event) => event.severity === 'error').length,
      warning_count: events.filter((event) => event.severity === 'warning').length,
      critical_count: events.filter((event) => event.severity === 'critical').length,
      last_activity_at: lastActivityAt,
      last_data_at: lastActivityAt,
    },
    health: {
      communication_status: communicationStatus,
      services: services.map((service) => ({
        name: service.name,
        status: service.status,
        detail: service.detail ?? (service.latency ? `${service.latency} ms` : null),
        last_seen_at: lastActivityAt,
      })),
      events: events.map((event) => ({
        id: event.id,
        occurred_at: event.created_at,
        severity: event.severity,
        category: event.event_type,
        payment_method: null,
        status: event.severity === 'critical' ? 'failed' : event.severity === 'warning' ? 'warning' : 'info',
        amount_cents: null,
        amount_kind: 'unknown',
        purchase_signal: 'none',
        description: event.message,
        source_file: 'system-health',
        raw_excerpt: event.message,
        device: null,
        tags: [event.event_type],
      })),
      devices: [],
      last_activity_at: lastActivityAt,
      last_data_at: lastActivityAt,
      printer: {
        paper_remaining: null,
        print_count: 0,
      },
    },
    errors: events.map((event) => ({
      id: event.id,
      occurred_at: event.created_at,
      severity: event.severity,
      category: event.event_type,
      payment_method: null,
      status: event.severity === 'critical' ? 'failed' : event.severity === 'warning' ? 'warning' : 'info',
      amount_cents: null,
      amount_kind: 'unknown',
      purchase_signal: 'none',
      description: event.message,
      source_file: 'system-health',
      raw_excerpt: event.message,
      device: null,
      tags: [event.event_type],
    })),
  };
}

export default function SystemHealth() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const [data, setData] = useState<ParkDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'error' | 'warning' | 'info'>('all');

  useEffect(() => {
    loadHealth();
  }, [parkId]);

  async function loadHealth(refresh = false) {
    if (!parkId) {
      setError('No park selected');
      setLoading(false);
      return;
    }

    const result = await loadParkDashboardData(parkId, refresh);
    if (result.error || !result.data) {
      const legacyResult = await invokeEdgeFunction<LegacySystemHealthResponse>('system-health', {
        query: { park_id: parkId },
      });

      if (!legacyResult.error && legacyResult.data) {
        setData(mapLegacySystemHealth(parkId, legacyResult.data));
        setNotice(
          isEdgeSourceUnavailable(result.error)
            ? 'The new operations health feed is not deployed yet. Showing the previous live system health view instead.'
            : null,
        );
        setError(null);
        setLoading(false);
        return;
      }

      setData(createEmptyParkDashboardData(parkId));
      setNotice(
        getOptionalSourceWarning('System health feed', result.error) ||
          getOptionalSourceWarning('Legacy health feed', legacyResult.error) ||
          'System health feed is currently unavailable.',
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

  async function handleRefresh() {
    setRefreshing(true);
    await loadHealth(true);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
          <button onClick={() => loadHealth(true)} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const services = data.health.services || [];
  const events = data.health.events || [];
  const devices = data.health.devices || [];
  const errorItems = data.errors || [];
  const communicationStatus = data.health.communication_status;

  const filteredErrors =
    severityFilter === 'all'
      ? errorItems
      : errorItems.filter((item) => item.severity === severityFilter);

  function handleExport() {
    exportToCSV(
      filteredErrors.map((item) => ({
        occurred_at: item.occurred_at,
        severity: item.severity,
        category: item.category,
        device: item.device || '',
        source_file: item.source_file,
        status: item.status,
        payment_method: item.payment_method || '',
        description: item.description,
      })),
      'system-health-errors',
    );
  }

  const severityCounts = {
    critical: events.filter((event) => event.severity === 'critical').length,
    error: events.filter((event) => event.severity === 'error').length,
    warning: events.filter((event) => event.severity === 'warning').length,
    info: events.filter((event) => event.severity === 'info').length,
  };

  const errorColumns: DataTableColumn<ParkDashboardEvent>[] = [
    {
      key: 'occurred_at',
      label: 'Time',
      render: (item) => <span className="text-slate-600">{formatDateTime(item.occurred_at)}</span>,
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
      render: (item) => <span>{item.device || '-'}</span>,
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Live operational health based on uploaded machine and system files
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="glass-button-secondary">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('app.refresh')}
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Health data is currently limited.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center gap-2">
          {communicationStatus === 'down' ? (
            <XCircle className="h-5 w-5 text-rose-500" />
          ) : communicationStatus === 'degraded' ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          )}
          <h3 className="text-base font-semibold text-slate-800">
            {communicationStatus === 'down'
              ? 'Data source offline'
              : communicationStatus === 'degraded'
                ? 'Data source degraded'
                : 'Data source operational'}
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Last data</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.health.last_data_at ? formatRelative(data.health.last_data_at) : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Last activity</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.health.last_activity_at ? formatRelative(data.health.last_activity_at) : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Paper remaining</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.health.printer.paper_remaining !== null
                ? formatNumber(data.health.printer.paper_remaining)
                : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Print count</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {formatNumber(data.health.printer.print_count)}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Fahrten gesamt</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.summary.rides_total !== null && data.summary.rides_total !== undefined
                ? formatNumber(data.summary.rides_total)
                : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Verkauft gesamt</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.summary.photos_sold_total !== null && data.summary.photos_sold_total !== undefined
                ? formatNumber(data.summary.photos_sold_total)
                : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-white/30 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Conversion gesamt</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">
              {data.summary.photo_conversion_total !== null && data.summary.photo_conversion_total !== undefined
                ? `${(data.summary.photo_conversion_total * 100).toFixed(1)}%`
                : '-'}
            </p>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            { label: t('health.critical'), count: severityCounts.critical, color: 'text-rose-600', bg: 'bg-rose-100', icon: XCircle },
            { label: t('health.errors'), count: severityCounts.error, color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
            { label: t('health.warnings'), count: severityCounts.warning, color: 'text-amber-600', bg: 'bg-amber-100', icon: AlertTriangle },
            { label: t('health.info'), count: severityCounts.info, color: 'text-sky-600', bg: 'bg-sky-100', icon: Activity },
          ] as const
        ).map((item) => (
          <GlassCard key={item.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${item.bg}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{formatNumber(item.count)}</p>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Services</h3>
          <div className="space-y-3">
            {services.length === 0 ? (
              <p className="text-sm text-slate-500">No service health signals available.</p>
            ) : (
              services.map((service) => (
                <div key={service.name} className="flex items-center justify-between rounded-xl bg-white/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        service.status === 'operational'
                          ? 'bg-emerald-500'
                          : service.status === 'degraded'
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{service.name}</p>
                      {service.detail && (
                        <p className="text-xs text-slate-500">{service.detail}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`status-badge ${
                      service.status === 'operational'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : service.status === 'degraded'
                          ? 'bg-amber-50 text-amber-700 ring-amber-200'
                          : 'bg-rose-50 text-rose-700 ring-rose-200'
                    }`}
                  >
                    {service.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Devices</h3>
          <div className="space-y-3">
            {devices.length === 0 ? (
              <p className="text-sm text-slate-500">No device-level telemetry available.</p>
            ) : (
              devices.map((device) => (
                <div key={device.name} className="rounded-xl bg-white/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {device.name.toLowerCase().includes('printer') ? (
                        <Printer className="h-4 w-4 text-cyan-600" />
                      ) : (
                        <PlugZap className="h-4 w-4 text-sky-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-800">{device.name}</p>
                        {device.detail && (
                          <p className="text-xs text-slate-500">{device.detail}</p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`status-badge ${
                        device.status === 'operational'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : device.status === 'degraded'
                            ? 'bg-amber-50 text-amber-700 ring-amber-200'
                            : 'bg-rose-50 text-rose-700 ring-rose-200'
                      }`}
                    >
                      {device.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-slate-100/80 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Recent health events</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {events.slice(0, 25).map((event) => (
            <div key={event.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-white/40">
              <div className={`mt-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(event.severity)}`}>
                {event.severity}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {event.category}
                  </span>
                  {event.device && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {event.device}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{formatRelative(event.occurred_at)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{event.description}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-slate-400">
              {t('health.no_events')}
            </div>
          )}
        </div>
      </GlassCard>

      <DataTable
        data={filteredErrors}
        columns={errorColumns}
        title="Errors & Logs"
        searchable
        searchKeys={['category', 'device', 'description', 'source_file', 'severity']}
        pageSize={14}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="glass-button-secondary">
              <Download className="h-4 w-4" />
              Export CSV
            </button>
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
          </div>
        }
      />
    </div>
  );
}
