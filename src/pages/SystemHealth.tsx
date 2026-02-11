import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatRelative, severityColor, formatNumber } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  detail?: string;
}

export default function SystemHealth() {
  const { t } = useI18n();
  const [events, setEvents] = useState<
    { id: string; event_type: string; severity: 'info' | 'warning' | 'error' | 'critical'; message: string; created_at: string }[]
  >([]);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHealth();
  }, []);

  async function loadHealth() {
    const { data, error } = await invokeEdgeFunction('system-health');
    if (error) {
      setEvents([
        {
          id: 'health-error',
          event_type: 'system_health',
          severity: 'critical',
          message: error,
          created_at: new Date().toISOString(),
        },
      ]);
      setServices([]);
      setMetrics({});
      setLoading(false);
      return;
    }

    setServices(data?.services || []);
    setEvents(data?.events || []);
    setMetrics(data?.metrics || {});
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadHealth();
    setRefreshing(false);
  }

  const severityCounts = {
    critical: events.filter((e) => e.severity === 'critical').length,
    error: events.filter((e) => e.severity === 'error').length,
    warning: events.filter((e) => e.severity === 'warning').length,
    info: events.filter((e) => e.severity === 'info').length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('health.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('health.subtitle')}</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="glass-button-secondary">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {t('app.refresh')}
        </button>
      </div>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center gap-2">
          {services.some((s) => s.status === 'down') ? (
            <XCircle className="h-5 w-5 text-rose-500" />
          ) : services.some((s) => s.status === 'degraded') ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          )}
          <h3 className="text-base font-semibold text-slate-800">
            {services.some((s) => s.status === 'down')
              ? t('health.some_down')
              : services.some((s) => s.status === 'degraded')
                ? t('health.degraded')
                : t('health.all_ok')}
          </h3>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 text-xs text-slate-600"
            >
              <span
                className={`h-2 w-2 rounded-full animate-pulse ${
                  svc.status === 'operational'
                    ? 'bg-emerald-500'
                    : svc.status === 'degraded'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
              />
              <span>
                {svc.name}{' '}
                {svc.status === 'operational'
                  ? t('status.operational')
                  : svc.status === 'degraded'
                    ? t('status.degraded')
                    : t('status.down')}
              </span>
            </div>
          ))}
          {services.length === 0 && (
            <div className="rounded-full bg-white/40 px-3 py-1 text-xs text-slate-500">
              {t('app.none')}
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between rounded-xl bg-white/30 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    svc.status === 'operational'
                      ? 'bg-emerald-500'
                      : svc.status === 'degraded'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                />
                <div>
                  <span className="text-sm text-slate-700">{svc.name}</span>
                  {svc.detail && (
                    <p className="text-xs text-slate-400">{svc.detail}</p>
                  )}
                </div>
              </div>
              {svc.latency && (
                <span className="text-xs text-slate-400">{svc.latency}ms</span>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {Object.keys(metrics).length > 0 && (
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('health.live_metrics')}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(metrics).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-white/30 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">{key.replace(/_/g, ' ')}</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{String(value ?? '-')}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

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

      <GlassCard className="overflow-hidden">
        <div className="border-b border-slate-100/80 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{t('health.recent_events')}</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {events.slice(0, 20).map((event) => (
            <div key={event.id} className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-white/40">
              <div className={`mt-0.5 rounded-lg px-2 py-1 text-xs font-semibold ${severityColor(event.severity)}`}>
                {event.severity}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {event.event_type}
                  </span>
                  <span className="text-xs text-slate-400">{formatRelative(event.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{event.message}</p>
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
    </div>
  );
}
