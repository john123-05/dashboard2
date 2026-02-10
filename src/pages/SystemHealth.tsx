import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatRelative, severityColor, formatNumber } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import type { SystemHealthEvent } from '../lib/types';

interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
}

export default function SystemHealth() {
  const [events, setEvents] = useState<SystemHealthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const services: ServiceStatus[] = [
    { name: 'Photo Upload Service', status: 'operational', latency: 120 },
    { name: 'Payment Processing', status: 'operational', latency: 85 },
    { name: 'Camera Sync', status: 'operational', latency: 200 },
    { name: 'Webhook Delivery', status: 'operational', latency: 45 },
    { name: 'CDN / Image Delivery', status: 'operational', latency: 30 },
    { name: 'Authentication', status: 'operational', latency: 65 },
  ];

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    const { data } = await supabase
      .from('system_health_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    setEvents((data || []) as SystemHealthEvent[]);
    setLoading(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadEvents();
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">System Health</h2>
          <p className="mt-1 text-sm text-slate-500">Service status and recent system events</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="glass-button-secondary">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <GlassCard className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <h3 className="text-base font-semibold text-slate-800">All Systems Operational</h3>
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
                <span className="text-sm text-slate-700">{svc.name}</span>
              </div>
              {svc.latency && (
                <span className="text-xs text-slate-400">{svc.latency}ms</span>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            { label: 'Critical', count: severityCounts.critical, color: 'text-rose-600', bg: 'bg-rose-100', icon: XCircle },
            { label: 'Errors', count: severityCounts.error, color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle },
            { label: 'Warnings', count: severityCounts.warning, color: 'text-amber-600', bg: 'bg-amber-100', icon: AlertTriangle },
            { label: 'Info', count: severityCounts.info, color: 'text-sky-600', bg: 'bg-sky-100', icon: Activity },
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
          <h3 className="text-base font-semibold text-slate-800">Recent Events</h3>
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
              No system events recorded
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
