import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Receipt } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';

type Currency = 'EUR' | 'USD';
type Cycle = 'monthly' | 'yearly';

interface CostItemRow {
  id: string;
  vendor: string;
  vendor_purpose: string;
  payer: string | null;
  item_name: string;
  item_group: string | null;
  amount: number;
  currency: Currency;
  cycle: Cycle;
  next_due_date: string | null;
  note: string | null;
  sort_order: number;
}

// Everything on this page displays in EUR - USD items (Bolt.new, Make.com,
// 2 domains) are converted using this rate so totals can just be added
// together instead of tracked as two separate currencies. Spot rate as of
// 2026-07-15 (ECB-adjacent, ~0.875 EUR/USD) - update occasionally, it will
// drift over time like any fixed exchange rate would.
const USD_TO_EUR_RATE = 0.875;

function toEur(amount: number, currency: Currency): number {
  return currency === 'USD' ? amount * USD_TO_EUR_RATE : amount;
}

function formatMoney(amount: number, currency: Currency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function sumEur(items: CostItemRow[], cycle: Cycle): number {
  return items
    .filter((item) => item.cycle === cycle)
    .reduce((sum, item) => sum + toEur(Number(item.amount), item.currency), 0);
}

function formatDateLong(dateStr: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(`${dateStr}T00:00:00`),
  );
}

function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${dateStr}T00:00:00`),
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

const cycleLabel: Record<Cycle, string> = { monthly: 'monatlich', yearly: 'jährlich' };

function groupByVendor(items: CostItemRow[]): Map<string, CostItemRow[]> {
  const map = new Map<string, CostItemRow[]>();
  for (const item of items) {
    if (!map.has(item.vendor)) map.set(item.vendor, []);
    map.get(item.vendor)!.push(item);
  }
  return map;
}

function VendorGroup({ items }: { items: CostItemRow[] }) {
  return (
    <>
      {Array.from(groupByVendor(items)).map(([vendor, vendorItems]) => (
        <div className="card" key={vendor}>
          <div className="support-panel-header">
            <h3>{vendor}</h3>
          </div>
          <p className="note">{vendorItems[0].vendor_purpose}</p>

          <div className="table-wrap" style={{ marginTop: '10px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Betrag</th>
                  <th>Zyklus</th>
                  <th>Fällig am</th>
                  <th>Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {vendorItems.map((item, index) => {
                  const previousGroup = index > 0 ? vendorItems[index - 1].item_group : undefined;
                  const showGroupHeader = item.item_group && item.item_group !== previousGroup;
                  return (
                    <Fragment key={item.id}>
                      {showGroupHeader && (
                        <tr>
                          <td colSpan={5} className="eyebrow" style={{ paddingTop: index === 0 ? undefined : '16px' }}>
                            {item.item_group}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td>{item.item_name}</td>
                        <td>
                          {formatMoney(toEur(Number(item.amount), item.currency))}
                          {item.currency === 'USD' && (
                            <span className="note" style={{ display: 'block', fontSize: '11px' }}>
                              ≈ {formatMoney(Number(item.amount), 'USD')}
                            </span>
                          )}
                        </td>
                        <td>{cycleLabel[item.cycle]}</td>
                        <td className="note">{item.next_due_date ? formatDateShort(item.next_due_date) : '–'}</td>
                        <td className="note">{item.note ?? '–'}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

export default function CostsPage() {
  const [items, setItems] = useState<CostItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    const { data, error: loadError } = await supabaseBrowser
      .from('cost_items')
      .select('*')
      .order('sort_order', { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    setItems((data || []) as CostItemRow[]);
    setError(null);
    setLoading(false);
  }

  const monthlyEur = sumEur(items, 'monthly');
  const yearlyEur = sumEur(items, 'yearly');

  const payerTotals = (['Tom', 'John'] as const).map((payer) => {
    const payerItems = items.filter((item) => item.payer === payer);
    return {
      payer,
      monthlyEur: sumEur(payerItems, 'monthly'),
      yearlyEur: sumEur(payerItems, 'yearly'),
    };
  });

  const nextPayment = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return items
      .filter((item) => item.next_due_date && item.next_due_date >= todayStr)
      .sort((a, b) => (a.next_due_date! < b.next_due_date! ? -1 : a.next_due_date! > b.next_due_date! ? 1 : 0))[0];
  }, [items]);

  const tomItems = items.filter((item) => item.payer === 'Tom');
  const johnItems = items.filter((item) => item.payer === 'John');
  const unclearItems = items.filter((item) => !item.payer);

  if (loading) {
    return (
      <div className="grid">
        <div className="card">
          <h2>Kosten</h2>
          <p className="note">Lädt...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid">
        <div className="card">
          <h2>Kosten</h2>
          <p className="support-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card">
        <h2>Kosten</h2>
        <p className="note">Übersicht aller laufenden Abos: was wir wofür zahlen und wer aktuell zahlt.</p>
      </div>

      {nextPayment && (
        <div className="card cost-highlight">
          <div className="cost-highlight-icon">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: '4px' }}>
              Nächste Zahlung{' '}
              {daysUntil(nextPayment.next_due_date!) === 0
                ? '(heute)'
                : daysUntil(nextPayment.next_due_date!) === 1
                  ? '(morgen)'
                  : `(in ${daysUntil(nextPayment.next_due_date!)} Tagen)`}
            </p>
            <p className="cost-highlight-title">{nextPayment.item_name}</p>
            <p className="note">
              {formatMoney(toEur(Number(nextPayment.amount), nextPayment.currency))} am{' '}
              {formatDateLong(nextPayment.next_due_date!)} · zahlt {nextPayment.payer} · {nextPayment.vendor}
            </p>
          </div>
        </div>
      )}

      <div className="grid three">
        <div className="card cost-payer-card cost-payer-tom">
          <p className="note">Tom zahlt</p>
          <p className="stat-value">{formatMoney(payerTotals[0].yearlyEur)} / Jahr</p>
          <p className="note">
            {payerTotals[0].monthlyEur > 0 ? `+ ${formatMoney(payerTotals[0].monthlyEur)} / Monat` : 'keine monatlichen Kosten'}
          </p>
        </div>
        <div className="card cost-payer-card cost-payer-john">
          <p className="note">John zahlt</p>
          <p className="stat-value">{formatMoney(payerTotals[1].yearlyEur)} / Jahr</p>
          <p className="note">+ {formatMoney(payerTotals[1].monthlyEur)} / Monat</p>
        </div>
        <div className="card">
          <p className="note">Gesamt</p>
          <p className="stat-value">{formatMoney(monthlyEur)} / Monat</p>
          <p className="note">{formatMoney(yearlyEur)} / Jahr</p>
        </div>
      </div>

      <div className="cost-payer-banner">
        <div className="cost-payer-banner-title">
          <Receipt className="h-5 w-5" />
          <h3>Tom zahlt</h3>
        </div>
        <span>
          {formatMoney(payerTotals[0].monthlyEur)}/Monat · {formatMoney(payerTotals[0].yearlyEur)}/Jahr
        </span>
      </div>
      <VendorGroup items={tomItems} />

      <div className="cost-payer-banner">
        <div className="cost-payer-banner-title">
          <Receipt className="h-5 w-5" />
          <h3>John zahlt</h3>
        </div>
        <span>
          {formatMoney(payerTotals[1].monthlyEur)}/Monat · {formatMoney(payerTotals[1].yearlyEur)}/Jahr
        </span>
      </div>
      <VendorGroup items={johnItems} />

      {unclearItems.length > 0 && (
        <>
          <div className="cost-payer-banner">
            <div className="cost-payer-banner-title">
              <Receipt className="h-5 w-5" />
              <h3>Zahler noch unklar</h3>
            </div>
          </div>
          <VendorGroup items={unclearItems} />
        </>
      )}
    </div>
  );
}
