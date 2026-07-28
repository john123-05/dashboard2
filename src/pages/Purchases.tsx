import { useEffect, useMemo, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { fetchKioskPurchases, getPriceCentsForTimestamp } from '../lib/kioskSales';
import { formatCurrency, formatDateTime, statusColor, exportToCSV } from '../lib/utils';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import { useI18n } from '../lib/i18n';
import { getOperatorUiText } from '../lib/operatorUiText';
import { usePark } from '../contexts/ParkContext';

interface PurchaseRow {
  id: string;
  source: 'online' | 'local' | 'kiosk';
  amount_cents: number | null;
  amount_kind: 'confirmed' | 'detected' | 'unknown';
  currency: string;
  status: string;
  payment_method: string;
  reference: string;
  purchased_at: string;
  customer_or_device: string;
  description: string;
}

interface StripePayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  customer_email: string | null;
  customer_name?: string | null;
  description: string | null;
}

export default function Purchases() {
  const { t, language } = useI18n();
  const { parkId, isKioskPark, kioskCheckLoading } = usePark();
  const [parkData, setParkData] = useState<ParkDashboardData | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'local' | 'kiosk'>('all');
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    if (kioskCheckLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, kioskCheckLoading]);

  async function loadData() {
    if (!parkId) {
      setError(t('app.none'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setIssues([]);

    try {
      // Kiosk parks (no webshop) have no Stripe/local-sales data — skip
      // those fetches entirely instead of surfacing "temporarily
      // unavailable" warnings for feeds that were never going to apply.
      // Each row here is one actual photo taken, not a daily aggregate —
      // this only covers the last ~30 days (photos are hard-deleted after
      // that), which is the right tradeoff for a recent-activity log.
      if (isKioskPark) {
        const kioskResult = await fetchKioskPurchases(parkId);
        const priceCents = kioskResult.priceCents ?? 0;
        const priceHistory = kioskResult.priceHistory ?? [];
        const kioskRows: PurchaseRow[] = kioskResult.purchases.map((purchase) => ({
          id: purchase.id,
          source: 'kiosk' as const,
          amount_cents: getPriceCentsForTimestamp(purchase.capturedAt, priceCents, priceHistory),
          amount_kind: 'confirmed' as const,
          currency: 'EUR',
          status: purchase.email ? 'claimed' : 'unknown',
          payment_method: 'kiosk',
          reference: purchase.cameraCode,
          purchased_at: purchase.capturedAt,
          customer_or_device: purchase.email || purchase.fullName || t('app.unknown'),
          description: purchase.email
            ? getOperatorUiText(language, 'purchases.description.kiosk_claimed', { email: purchase.email })
            : getOperatorUiText(language, 'purchases.description.kiosk_bought'),
        }));
        setPurchases(kioskRows);
        setParkData(createEmptyParkDashboardData(parkId));
        setError(null);
        setLoading(false);
        return;
      }

      const [parkDashboardResult, paymentsResult] = await Promise.all([
        loadParkDashboardData(parkId),
        invokeEdgeFunction<{ payments: StripePayment[] }>('stripe-payments', { useSessionAuth: true }),
      ]);

      const nextIssues: string[] = [];
      const localWarning = getOptionalSourceWarning(
        'Local sales feed',
        parkDashboardResult.error,
      );
      if (localWarning) nextIssues.push(localWarning);
      const stripeWarning = getOptionalSourceWarning('Stripe data', paymentsResult.error);
      if (stripeWarning) nextIssues.push(stripeWarning);

      const dashboardBase =
        parkDashboardResult.data ?? createEmptyParkDashboardData(parkId);
      const dashboard: ParkDashboardData = {
        ...dashboardBase,
        features: {
          ...dashboardBase.features,
          stripe: !stripeWarning && (dashboardBase.features.stripe || !paymentsResult.error),
          local_sales: Boolean(parkDashboardResult.data && dashboardBase.features.local_sales),
          operations: Boolean(parkDashboardResult.data && dashboardBase.features.operations),
          health: Boolean(parkDashboardResult.data && dashboardBase.features.health),
          errors: Boolean(parkDashboardResult.data && dashboardBase.features.errors),
          printer: Boolean(parkDashboardResult.data && dashboardBase.features.printer),
          cash: Boolean(parkDashboardResult.data && dashboardBase.features.cash),
          terminal: Boolean(parkDashboardResult.data && dashboardBase.features.terminal),
        },
      };
      setParkData(dashboard);
      setIssues(Array.from(new Set(nextIssues)));

      const localRows: PurchaseRow[] = dashboard.sales.recent_transactions
        .filter((event) =>
          event.purchase_signal === 'confirmed_sale' ||
          event.purchase_signal === 'unconfirmed_sale' ||
          event.purchase_signal === 'manual_print',
        )
        .map((event) => mapLocalEventToRow(event));
      const onlineRows: PurchaseRow[] = (paymentsResult.error ? [] : paymentsResult.data?.payments || [])
        .map((payment) => ({
          id: payment.id,
          source: 'online' as const,
          amount_cents: Math.round(payment.amount * 100),
          amount_kind: 'confirmed' as const,
          currency: payment.currency,
          status: payment.status,
          payment_method: 'stripe',
          reference: payment.id,
          purchased_at: payment.created_at,
          customer_or_device: payment.customer_email || payment.customer_name || getOperatorUiText(language, 'purchases.customer.stripe'),
          description: payment.description || 'Stripe payment',
        }))
        .sort((left, right) => new Date(right.purchased_at).getTime() - new Date(left.purchased_at).getTime());

      const merged = [...localRows, ...onlineRows]
        .sort((left, right) => new Date(right.purchased_at).getTime() - new Date(left.purchased_at).getTime());

      setPurchases(merged);
      setError(null);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('app.unknown'));
      setLoading(false);
    }
  }

  function mapLocalEventToRow(event: ParkDashboardEvent): PurchaseRow {
    return {
      id: event.id,
      source: 'local',
      amount_cents: event.amount_cents,
      amount_kind: event.amount_kind,
      currency: 'EUR',
      status: event.purchase_signal === 'manual_print' ? 'manual' : event.status || 'completed',
      payment_method:
        event.payment_method ||
        (event.purchase_signal === 'manual_print' ? 'local_unknown' : 'local'),
      reference: event.source_file,
      purchased_at: event.occurred_at,
      customer_or_device: event.device || getOperatorUiText(language, 'purchases.customer.local_device'),
      description: event.description,
    };
  }

  const filtered = useMemo(() => {
    if (sourceFilter === 'all') return purchases;
    return purchases.filter((item) => item.source === sourceFilter);
  }, [purchases, sourceFilter]);

  function handleExport() {
    exportToCSV(
      filtered.map((purchase) => ({
        source: purchase.source,
        amount:
          purchase.amount_cents === null
            ? 'unknown'
            : (purchase.amount_cents / 100).toFixed(2),
        amount_kind: purchase.amount_kind,
        currency: purchase.currency,
        status: purchase.status,
        payment_method: purchase.payment_method,
        reference: purchase.reference,
        customer_or_device: purchase.customer_or_device,
        description: purchase.description,
        date: purchase.purchased_at,
      })),
      'purchases-export',
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="h-96 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  if (error || !parkData) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('purchases.title')}</h2>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-semibold text-red-800">{t('overview.error_title')}</h3>
          <p className="mb-4 text-sm text-red-600">{error || t('app.unknown')}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  const columns: DataTableColumn<PurchaseRow>[] = [
    {
      key: 'purchased_at',
      label: t('purchases.table.date'),
      render: (item: PurchaseRow) => (
        <span className="text-slate-600">{formatDateTime(item.purchased_at)}</span>
      ),
    },
    {
      key: 'source',
      label: getOperatorUiText(language, 'purchases.table.source'),
      render: (item: PurchaseRow) => (
        <span
          className={`status-badge ${
            item.source === 'online'
              ? 'bg-sky-50 text-sky-700 ring-sky-200'
              : item.source === 'kiosk'
                ? 'bg-brand-50 text-brand-700 ring-brand-200'
                : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          }`}
        >
          {item.source === 'online'
            ? getOperatorUiText(language, 'purchases.source.online')
            : item.source === 'kiosk'
              ? getOperatorUiText(language, 'purchases.source.automaton')
              : getOperatorUiText(language, 'purchases.source.local')}
        </span>
      ),
    },
    {
      key: 'customer_or_device',
      label: getOperatorUiText(language, 'purchases.table.customer_device'),
      render: (item: PurchaseRow) => (
        <span className="font-medium text-slate-700">{item.customer_or_device}</span>
      ),
    },
    {
      key: 'payment_method',
      label: getOperatorUiText(language, 'purchases.table.payment'),
      render: (item: PurchaseRow) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.payment_method === 'kiosk'
            ? getOperatorUiText(language, 'purchases.source.kiosk')
            : item.payment_method === 'local'
              ? getOperatorUiText(language, 'purchases.source.local')
              : item.payment_method}
        </span>
      ),
    },
    {
      key: 'amount_cents',
      label: t('purchases.table.amount'),
      render: (item: PurchaseRow) => (
        <div>
          <span className="font-semibold text-slate-800">
            {item.amount_cents === null ? t('app.unknown') : formatCurrency(item.amount_cents, item.currency)}
          </span>
          {item.amount_cents !== null && item.amount_kind === 'detected' && (
            <p className="mt-0.5 text-xs text-amber-600">{getOperatorUiText(language, 'purchases.amount.detected')}</p>
          )}
          {item.amount_cents === null && (
            <p className="mt-0.5 text-xs text-slate-500">{getOperatorUiText(language, 'purchases.amount.none')}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: t('purchases.table.status'),
      render: (item: PurchaseRow) => (
        <span className={`status-badge ${statusColor(item.status)}`}>
          {item.status === 'unknown'
            ? t('app.unknown')
            : item.status === 'claimed'
              ? getOperatorUiText(language, 'purchases.status.claimed')
              : item.status}
        </span>
      ),
    },
    {
      key: 'description',
      label: getOperatorUiText(language, 'purchases.table.description'),
      render: (item: PurchaseRow) => (
        <span className="text-slate-600">{item.description}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('purchases.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isKioskPark
              ? getOperatorUiText(language, 'purchases.subtitle_kiosk')
              : getOperatorUiText(language, 'purchases.subtitle_unified')}
          </p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          {t('revenue.export')}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">{getOperatorUiText(language, 'purchases.partial_available')}</p>
          <p className="mt-1 text-sm text-amber-700">{issues.join(' ')}</p>
        </div>
      )}

      <DataTable
        data={filtered}
        columns={columns}
        searchable
        searchKeys={['customer_or_device', 'payment_method', 'description', 'reference']}
        pageSize={12}
        actions={
          isKioskPark ? undefined : (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={sourceFilter}
                onChange={(event) => {
                  setSourceFilter(event.target.value as 'all' | 'online' | 'local' | 'kiosk');
                }}
                className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="all">{getOperatorUiText(language, 'purchases.filter.all')}</option>
                <option value="online">{getOperatorUiText(language, 'purchases.filter.online')}</option>
                <option value="local">{getOperatorUiText(language, 'purchases.filter.local')}</option>
              </select>
            </div>
          )
        }
      />
    </div>
  );
}
