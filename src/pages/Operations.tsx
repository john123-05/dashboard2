import { useEffect, useMemo, useState } from 'react';
import { Cpu, Printer, Receipt, Wallet } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import KPICard from '../components/ui/KPICard';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import { getOptionalSourceWarning } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { formatCurrency, formatDateTime, formatNumber, statusColor } from '../lib/utils';
import { usePark } from '../contexts/ParkContext';

export default function Operations() {
  const { parkId } = usePark();
  const [data, setData] = useState<ParkDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        getOptionalSourceWarning('Operations feed', result.error) ||
          'Operations feed is currently unavailable.',
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

  const activityRows = useMemo(() => data?.operations.activity || [], [data]);
  const terminalRevenueCents = data?.operations.terminal.amount_cents ?? 0;
  const detectedTerminalRevenueCents = data?.operations.payments.detected_but_unconfirmed_cents ?? 0;
  const unknownTerminalAmountCount = data?.operations.payments.unknown_amounts ?? 0;
  const terminalRevenueDisplay =
    terminalRevenueCents > 0
      ? formatCurrency(terminalRevenueCents)
      : detectedTerminalRevenueCents > 0
        ? `${formatCurrency(detectedTerminalRevenueCents)} detected`
        : unknownTerminalAmountCount > 0
          ? 'Unknown'
          : formatCurrency(0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-white/40" />
        <div className="grid gap-6 sm:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/30" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Operations</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">Error loading operations</h3>
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
          <button onClick={loadData} className="glass-button-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activityColumns: DataTableColumn<ParkDashboardEvent>[] = [
    {
      key: 'occurred_at',
      label: 'Time',
      render: (item) => <span className="text-slate-600">{formatDateTime(item.occurred_at)}</span>,
    },
    {
      key: 'device',
      label: 'Device',
      render: (item) => (
        <span>{item.device || '-'}</span>
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
      key: 'payment_method',
      label: 'Payment',
      render: (item) => (
        <span>{item.payment_method || '-'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item) => (
        <span className={`status-badge ${statusColor(item.status || 'open')}`}>
          {item.status}
        </span>
      ),
    },
    {
      key: 'amount_cents',
      label: 'Amount',
      render: (item) => (
        <div>
          <span className="font-medium text-slate-700">
            {item.amount_cents === null
              ? 'Unknown'
              : item.amount_kind === 'detected'
                ? `${formatCurrency(item.amount_cents)} detected`
                : item.amount_cents > 0
                  ? formatCurrency(item.amount_cents)
                  : '-'}
          </span>
          {item.amount_cents === null && item.purchase_signal !== 'none' && (
            <p className="mt-0.5 text-xs text-slate-500">No confirmed amount</p>
          )}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Description',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Operations</h2>
        <p className="mt-1 text-sm text-slate-500">
          Terminal, coin, printer and machine activity derived from uploaded files
        </p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Operational telemetry is currently limited.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Payment Attempts"
          value={formatNumber(data.operations.payments.attempts)}
          icon={Receipt}
          iconColor="text-sky-600"
          iconBg="bg-sky-50"
        />
        <KPICard
          title="Cash / Coin"
          value={formatCurrency(data.operations.cash.amount_cents)}
          icon={Wallet}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <KPICard
          title="Terminal Sales"
          value={terminalRevenueDisplay}
          subtitle="Confirmed terminal revenue only"
          icon={Cpu}
          iconColor="text-cyan-600"
          iconBg="bg-cyan-50"
        />
        <KPICard
          title="Print Count"
          value={formatNumber(data.operations.printer.print_count)}
          icon={Printer}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Payments</h3>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Succeeded</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.operations.payments.succeeded)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Failed</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.operations.payments.failed)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Cancelled</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.operations.payments.cancelled)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unconfirmed sales</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.operations.payments.unconfirmed_sales ?? 0)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unknown amounts</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.operations.payments.unknown_amounts ?? 0)}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Printer & Consumables</h3>
          <div className="space-y-3">
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Paper remaining</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {data.operations.printer.paper_remaining !== null
                  ? formatNumber(data.operations.printer.paper_remaining)
                  : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Files recognized</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {formatNumber(data.sources.recognized_files)}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Latest object</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {data.sources.latest_object_at ? formatDateTime(data.sources.latest_object_at) : '-'}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Devices</h3>
          <div className="space-y-3">
            {data.operations.devices.length === 0 ? (
              <p className="text-sm text-slate-500">No device telemetry available.</p>
            ) : (
              data.operations.devices.map((device) => (
                <div key={device.name} className="rounded-xl bg-white/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{device.name}</p>
                      {device.detail && (
                        <p className="mt-1 text-xs text-slate-500">{device.detail}</p>
                      )}
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

      <DataTable
        data={activityRows}
        columns={activityColumns}
        title="Recent Operational Activity"
        searchable
        searchKeys={['device', 'category', 'payment_method', 'description', 'source_file']}
        pageSize={12}
      />

      {!notice && activityRows.length === 0 && (
        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-slate-800">No operational events yet</h3>
          <p className="mt-2 text-sm text-slate-500">
            This park has no parsed terminal, cash, printer or machine events in the current feed yet.
          </p>
        </GlassCard>
      )}
    </div>
  );
}
