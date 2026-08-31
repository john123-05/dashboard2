import { useEffect, useMemo, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction } from '../lib/edgeFunctions';
import {
  createEmptyParkDashboardData,
  loadParkDashboardData,
  type ParkDashboardData,
  type ParkDashboardEvent,
} from '../lib/parkDashboard';
import { fetchKioskPurchasesLedger } from '../lib/kioskSales';
import { formatCurrency, formatDateTime, statusColor, exportToCSV } from '../lib/utils';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

interface PurchaseRow {
  id: string;
  source: 'online' | 'local' | 'kiosk';
  /** Bei Automaten-Käufen: welcher Automat ("Automat alt" / "Automat neu"). */
  machine_id?: string | null;
  machine_label?: string | null;
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

// --- Monats-Auswahl für die Automaten-Käufe -------------------------------
function monatSchluessel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monatsSpanne(schluessel: string): { from: string; to: string } {
  const [jahr, monat] = schluessel.split('-').map(Number);
  const from = new Date(jahr, monat - 1, 1, 0, 0, 0);
  const to = new Date(jahr, monat, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function monatsListe(zurueck = 15): string[] {
  const jetzt = new Date();
  const liste: string[] = [];
  for (let i = 0; i < zurueck; i += 1) {
    liste.push(monatSchluessel(new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1)));
  }
  return liste;
}

function monatLabel(schluessel: string): string {
  const [jahr, monat] = schluessel.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
    new Date(jahr, monat - 1, 1),
  );
}

export default function Purchases() {
  const { t } = useI18n();
  const { parkId, isKioskPark, kioskCheckLoading } = usePark();
  const [parkData, setParkData] = useState<ParkDashboardData | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'local' | 'kiosk'>('all');
  const [issues, setIssues] = useState<string[]>([]);
  // Monat für die Automaten-Käufe (aus machine_sale_payments, dauerhaft).
  const [monat, setMonat] = useState<string>(() => monatSchluessel(new Date()));
  const [monatGekuerzt, setMonatGekuerzt] = useState(false);
  // Nach welchem Automaten gefiltert wird ('alle' = beide).
  const [automatFilter, setAutomatFilter] = useState<string>('alle');
  const [automaten, setAutomaten] = useState<{ machine_id: string; machine_label: string }[]>([]);

  useEffect(() => {
    if (kioskCheckLoading) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId, kioskCheckLoading, monat]);

  async function loadData() {
    if (!parkId) {
      setError('No park selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setIssues([]);

    try {
      // Automaten-Parks (kein Webshop): keine Stripe/Local-Feeds abfragen.
      // Die Käufe kommen aus machine_sale_payments - dauerhaft, Monate zurück,
      // mit Zahlungsart + Kartenmarke direkt in der Zeile. Der gewählte Monat
      // begrenzt den Abruf. (Die alte photos-Tabelle reichte nur ~1 Tag
      // zurück, weil sie bei 100 Zeilen gekappt und nach 30 Tagen gelöscht
      // wird.)
      if (isKioskPark) {
        const { from, to } = monatsSpanne(monat);
        const ledger = await fetchKioskPurchasesLedger(parkId, { from, to });
        setMonatGekuerzt(ledger.truncated);
        setAutomaten(ledger.machines ?? []);
        const preis = ledger.priceCents ?? 0;

        const kioskRows: PurchaseRow[] = ledger.purchases.map((p) => {
          const marke = p.method === 'karte' ? p.card_scheme : null;
          const abgeholt = p.claimed_email
            ? `, später per QR-Code abgeholt (${p.claimed_email})`
            : '';
          const beleg = p.method === 'karte' && p.receipt_no
            ? `, hobex-Beleg ${p.receipt_no}`
            : '';
          const doppeldruck = (p.print_count ?? 0) > 3 ? `, ${p.print_count} Ausdrucke` : '';
          const herkunft =
            p.method === 'unbekannt' && p.method_source === 'kein_flag'
              ? ', vor der Zahlungsart-Erkennung des Automaten'
              : '';

          return {
            id: p.receipt_no || `${p.sold_local ?? p.sold_at}-${p.bild_nr ?? ''}-${p.method}`,
            source: 'kiosk' as const,
            machine_id: p.machine_id,
            machine_label: p.machine_label,
            amount_cents: p.amount_cents ?? preis,
            amount_kind: p.method === 'unbekannt' ? ('detected' as const) : ('confirmed' as const),
            currency: 'EUR',
            status: p.claimed_email ? 'claimed' : 'unknown',
            payment_method:
              p.method === 'bar'
                ? 'Bar'
                : p.method === 'karte'
                  ? marke
                    ? `Karte · ${marke}`
                    : 'Karte'
                  : 'unbekannt',
            reference: p.bild_nr ? `Bild ${p.bild_nr}` : '–',
            purchased_at: p.sold_local ?? p.sold_at,
            customer_or_device: p.claimed_email || p.claimed_name || 'Unbekannt',
            description: `Foto am Automaten gekauft${abgeholt}${beleg}${doppeldruck}${herkunft}`,
          };
        });
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
          customer_or_device: payment.customer_email || payment.customer_name || 'Stripe customer',
          description: payment.description || 'Stripe payment',
        }))
        .sort((left, right) => new Date(right.purchased_at).getTime() - new Date(left.purchased_at).getTime());

      const merged = [...localRows, ...onlineRows]
        .sort((left, right) => new Date(right.purchased_at).getTime() - new Date(left.purchased_at).getTime());

      setPurchases(merged);
      setError(null);
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
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
      customer_or_device: event.device || 'Local device',
      description: event.description,
    };
  }

  const filtered = useMemo(() => {
    let rows = purchases;
    if (isKioskPark && automatFilter !== 'alle') {
      rows = rows.filter((item) => item.machine_id === automatFilter);
    }
    if (!isKioskPark && sourceFilter !== 'all') {
      rows = rows.filter((item) => item.source === sourceFilter);
    }
    return rows;
  }, [purchases, sourceFilter, automatFilter, isKioskPark]);

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
          <p className="mb-4 text-sm text-red-600">{error || 'Unknown error'}</p>
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
      label: isKioskPark ? 'Automat' : 'Source',
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
            ? 'Online'
            : item.source === 'kiosk'
              ? item.machine_label || 'Automat'
              : 'Local'}
        </span>
      ),
    },
    {
      key: 'customer_or_device',
      label: 'Customer / Device',
      render: (item: PurchaseRow) => (
        <span className="font-medium text-slate-700">{item.customer_or_device}</span>
      ),
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (item: PurchaseRow) => (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {item.payment_method}
        </span>
      ),
    },
    {
      key: 'amount_cents',
      label: t('purchases.table.amount'),
      render: (item: PurchaseRow) => (
        <div>
          <span className="font-semibold text-slate-800">
            {item.amount_cents === null ? 'Unknown' : formatCurrency(item.amount_cents, item.currency)}
          </span>
          {item.amount_cents !== null && item.amount_kind === 'detected' && (
            <p className="mt-0.5 text-xs text-amber-600">Detected, not confirmed</p>
          )}
          {item.amount_cents === null && (
            <p className="mt-0.5 text-xs text-slate-500">No confirmed amount</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: t('purchases.table.status'),
      render: (item: PurchaseRow) => (
        <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
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
              ? 'Jeder Kauf am Automaten mit Zahlungsart und Beleg – Monat oben rechts wählbar, Monate zurück'
              : 'Unified transaction log for Stripe and on-site sales'}
          </p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          {t('revenue.export')}
        </button>
      </div>

      {issues.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Transaction data is partially available.</p>
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
          isKioskPark ? (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              {automaten.length > 1 && (
                <select
                  value={automatFilter}
                  onChange={(event) => setAutomatFilter(event.target.value)}
                  className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
                >
                  <option value="alle">Alle Automaten</option>
                  {automaten.map((m) => (
                    <option key={m.machine_id} value={m.machine_id}>
                      {m.machine_label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={monat}
                onChange={(event) => setMonat(event.target.value)}
                className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
              >
                {monatsListe().map((m) => (
                  <option key={m} value={m}>
                    {monatLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={sourceFilter}
                onChange={(event) => {
                  setSourceFilter(event.target.value as 'all' | 'online' | 'local' | 'kiosk');
                }}
                className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-1.5 text-sm text-slate-700"
              >
                <option value="all">All sources</option>
                <option value="online">Online only</option>
                <option value="local">Local only</option>
              </select>
            </div>
          )
        }
      />
      {isKioskPark && monatGekuerzt && (
        <p className="text-xs text-amber-600">
          Dieser Monat hat sehr viele Käufe – es werden die neuesten angezeigt. Für die
          restlichen einen früheren Monat wählen.
        </p>
      )}
    </div>
  );
}
