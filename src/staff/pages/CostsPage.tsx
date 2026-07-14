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

function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function sumBy(items: CostItemRow[], currency: Currency, cycle: Cycle): number {
  return items
    .filter((item) => item.currency === currency && item.cycle === cycle)
    .reduce((sum, item) => sum + Number(item.amount), 0);
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
                        <td>{formatMoney(Number(item.amount), item.currency)}</td>
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

  const monthlyEur = sumBy(items, 'EUR', 'monthly');
  const monthlyUsd = sumBy(items, 'USD', 'monthly');
  const yearlyEur = sumBy(items, 'EUR', 'yearly');
  const yearlyUsd = sumBy(items, 'USD', 'yearly');

  const payerTotals = (['Tom', 'John'] as const).map((payer) => {
    const payerItems = items.filter((item) => item.payer === payer);
    return {
      payer,
      monthlyEur: sumBy(payerItems, 'EUR', 'monthly'),
      monthlyUsd: sumBy(payerItems, 'USD', 'monthly'),
      yearlyEur: sumBy(payerItems, 'EUR', 'yearly'),
      yearlyUsd: sumBy(payerItems, 'USD', 'yearly'),
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
              {formatMoney(Number(nextPayment.amount), nextPayment.currency)} am{' '}
              {formatDateLong(nextPayment.next_due_date!)} · zahlt {nextPayment.payer} · {nextPayment.vendor}
            </p>
          </div>
        </div>
      )}

      <div className="grid three">
        <div className="card cost-payer-card cost-payer-tom">
          <p className="note">Tom zahlt</p>
          <p className="stat-value">{formatMoney(payerTotals[0].yearlyEur, 'EUR')} / Jahr</p>
          <p className="note">
            {payerTotals[0].monthlyEur > 0 ? `+ ${formatMoney(payerTotals[0].monthlyEur, 'EUR')} / Monat` : 'keine monatlichen Kosten'}
          </p>
        </div>
        <div className="card cost-payer-card cost-payer-john">
          <p className="note">John zahlt</p>
          <p className="stat-value">{formatMoney(payerTotals[1].yearlyEur, 'EUR')} / Jahr</p>
          <p className="note">
            + {formatMoney(payerTotals[1].monthlyEur, 'EUR')} / Monat
            {payerTotals[1].monthlyUsd > 0 ? ` + ${formatMoney(payerTotals[1].monthlyUsd, 'USD')} / Monat` : ''}
            {payerTotals[1].yearlyUsd > 0 ? ` · + ${formatMoney(payerTotals[1].yearlyUsd, 'USD')} / Jahr` : ''}
          </p>
        </div>
        <div className="card">
          <p className="note">Gesamt</p>
          <p className="stat-value">{formatMoney(monthlyEur, 'EUR')} / Monat</p>
          <p className="note">
            + {formatMoney(monthlyUsd, 'USD')} / Monat · {formatMoney(yearlyEur, 'EUR')} + {formatMoney(yearlyUsd, 'USD')} / Jahr
          </p>
        </div>
      </div>

      <div className="card">
        <div className="support-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt className="h-4 w-4" />
            <h3 style={{ margin: 0 }}>Tom zahlt</h3>
          </div>
          <span className="note">
            {formatMoney(payerTotals[0].monthlyEur, 'EUR')}/Monat · {formatMoney(payerTotals[0].yearlyEur, 'EUR')}/Jahr
          </span>
        </div>
      </div>
      <VendorGroup items={tomItems} />

      <div className="card">
        <div className="support-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt className="h-4 w-4" />
            <h3 style={{ margin: 0 }}>John zahlt</h3>
          </div>
          <span className="note">
            {formatMoney(payerTotals[1].monthlyEur, 'EUR')} + {formatMoney(payerTotals[1].monthlyUsd, 'USD')}/Monat ·{' '}
            {formatMoney(payerTotals[1].yearlyEur, 'EUR')} + {formatMoney(payerTotals[1].yearlyUsd, 'USD')}/Jahr
          </span>
        </div>
      </div>
      <VendorGroup items={johnItems} />

      {unclearItems.length > 0 && (
        <>
          <div className="card">
            <h3>Zahler noch unklar</h3>
          </div>
          <VendorGroup items={unclearItems} />
        </>
      )}

      <div className="card">
        <h3>Hinweise</h3>
        <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
          <li className="note">
            Die beiden Bolt.new-Domains (onridepictures.com, liftpictures-contact.com) laufen aktuell im
            kostenlosen Testzeitraum. Die $19,99/Jahr fallen erst ab dem jeweiligen Testzeitraum-Ende an
            (25.09.2026 bzw. 24.08.2026).
          </li>
          <li className="note">
            Domain Factory: einige Domainnamen (noltingtom.de, tomsvilla.de, yvonnenolting.de, abi83.de, alfom.de,
            sharesmile.de) klingen nach privaten/persönlichen Projekten statt nach Liftpictures-Geschäft — sie sind
            trotzdem mit aufgeführt (wie gewünscht "alle Sachen"), aber bitte prüfen, ob sie in eine
            Liftpictures-Kostenübersicht gehören.
          </li>
          <li className="note">
            erlebnisfoto.com (Domain Factory): die letzte vorliegende Rechnung deckt nur bis 16.06.2026 — falls
            keine Verlängerungsrechnung existiert, ist die Domain evtl. bereits ausgelaufen. Trotzdem mit dem
            zuletzt bekannten Preis in der Übersicht, bis das geklärt ist.
          </li>
          <li className="note">
            Domain Factory: die E-Mail-Postfächer haben 2025 mehrfach das Produkt gewechselt (MyMail Basic/
            Individual → Microsoft 365 E-Mail Essentials), dabei fielen einige anteilige Zwischenrechnungen und
            Gutschriften an. Hier gezeigt wird nur der aktuelle, stabile Jahresstand (3 Postfächer) — nicht die
            einzelnen Übergangsbuchungen.
          </li>
          <li className="note">
            Beträge in unterschiedlichen Währungen (EUR/USD) werden bewusst getrennt ausgewiesen statt mit einem
            Wechselkurs zusammengerechnet, damit hier keine veraltete Umrechnung stehen bleibt.
          </li>
          <li className="note">
            Ein täglicher Job prüft mittags, ob am nächsten Tag eine Zahlung fällig wird, und schickt dann eine
            Push-Benachrichtigung an alle Staff-Geräte. Die Fälligkeitsdaten hier werden danach automatisch auf den
            nächsten Zyklus weitergestellt — die Beträge sollten trotzdem hin und wieder gegen die echte Rechnung
            geprüft werden, falls sich ein Preis ändert.
          </li>
        </ul>
      </div>
    </div>
  );
}
