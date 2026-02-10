import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { formatCurrency, formatDateTime, statusColor, exportToCSV } from '../lib/utils';
import DataTable from '../components/ui/DataTable';

interface PurchaseRow {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_payment_id: string | null;
  purchased_at: string;
  customer_email: string | null;
  attraction_name: string;
}

export default function Purchases() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data, error: invokeError } = await invokeEdgeFunction('stripe-payments');

      if (invokeError) {
        console.error('Failed to fetch Stripe payments:', invokeError);
        setError(invokeError);
        setPurchases([]);
        setLoading(false);
        return;
      }

      console.log('Stripe payments response:', data);

      const payments = data.payments || [];

      const rows: PurchaseRow[] = payments.map((p: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        created_at: string;
        customer_email: string | null;
        description: string | null;
      }) => ({
        id: p.id,
        amount_cents: Math.round(p.amount * 100),
        currency: p.currency,
        status: p.status,
        stripe_payment_id: p.id,
        purchased_at: p.created_at,
        customer_email: p.customer_email,
        attraction_name: p.description || 'Photo Purchase',
      }));

      setPurchases(rows);
      setError(null);
      setLoading(false);
    } catch (error) {
      console.error('Error loading purchases:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setPurchases([]);
      setLoading(false);
    }
  }

  function handleExport() {
    exportToCSV(
      purchases.map((p) => ({
        id: p.id,
        amount: (p.amount_cents / 100).toFixed(2),
        currency: p.currency,
        status: p.status,
        stripe_id: p.stripe_payment_id || '',
        customer: p.customer_email || '',
        attraction: p.attraction_name,
        date: p.purchased_at,
      })),
      'purchases-export'
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

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Purchases</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Stripe Data</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const columns = [
    {
      key: 'purchased_at',
      label: 'Date',
      render: (item: PurchaseRow) => (
        <span className="text-slate-600">{formatDateTime(item.purchased_at)}</span>
      ),
    },
    {
      key: 'customer_email',
      label: 'Customer',
      render: (item: PurchaseRow) => (
        <span className="font-medium text-slate-700">{item.customer_email || 'Anonymous'}</span>
      ),
    },
    {
      key: 'attraction_name',
      label: 'Attraction',
    },
    {
      key: 'amount_cents',
      label: 'Amount',
      render: (item: PurchaseRow) => (
        <span className="font-semibold text-slate-800">{formatCurrency(item.amount_cents)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (item: PurchaseRow) => (
        <span className={`status-badge ${statusColor(item.status)}`}>{item.status}</span>
      ),
    },
    {
      key: 'stripe_payment_id',
      label: 'Stripe ID',
      render: (item: PurchaseRow) => (
        <span className="font-mono text-xs text-slate-400">
          {item.stripe_payment_id ? item.stripe_payment_id.slice(0, 16) + '...' : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Purchases</h2>
          <p className="mt-1 text-sm text-slate-500">All photo purchases across your attractions</p>
        </div>
        <button onClick={handleExport} className="glass-button-secondary">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <DataTable
        data={purchases as unknown as Record<string, unknown>[]}
        columns={columns as { key: string; label: string; render?: (item: Record<string, unknown>) => React.ReactNode }[]}
        searchable
        searchKeys={['customer_email', 'attraction_name', 'stripe_payment_id']}
        pageSize={12}
      />
    </div>
  );
}
