import { Fragment } from 'react';

type Currency = 'EUR' | 'USD';
type Cycle = 'monthly' | 'yearly';
type Payer = 'Tom' | 'John';

interface CostLineItem {
  name: string;
  amount: number;
  currency: Currency;
  cycle: Cycle;
  note?: string;
  group?: string;
}

interface CostVendor {
  name: string;
  payer: Payer | null;
  purpose: string;
  items: CostLineItem[];
}

// Compiled from the Wix/Make.com/IONOS invoices and the Bolt.new/domain
// registrar screenshots on 2026-07-14. Update the numbers here whenever a
// plan, price, or renewal date actually changes - this page is a manually
// maintained reference, not something pulled live from any billing API.
const VENDORS: CostVendor[] = [
  {
    name: 'Wix',
    payer: 'Tom',
    purpose: 'Website-Hosting, Domain lift.pictures, E-Mail-Marketing',
    items: [
      { name: 'Premiumpaket Light (Hosting)', amount: 168.0, currency: 'EUR', cycle: 'yearly', note: 'Laufzeit 1.8.2026 – 1.8.2027' },
      { name: 'Domain lift.pictures', amount: 14.95, currency: 'EUR', cycle: 'yearly', note: 'Laufzeit 1.8.2026 – 1.8.2027' },
      { name: 'E-Mail-Marketing Essentials', amount: 12.0, currency: 'EUR', cycle: 'monthly' },
    ],
  },
  {
    name: 'IONOS',
    payer: 'John',
    purpose: 'E-Mail-Postfächer kontakt@, newsletter@ und tom@liftpictures-fotosysteme.de',
    items: [
      { name: 'IONOS Mail Basic 1', amount: 1.5, currency: 'EUR', cycle: 'monthly' },
      { name: 'E-Mail-Archivierung (5 GB)', amount: 2.5, currency: 'EUR', cycle: 'monthly' },
    ],
  },
  {
    name: 'Bolt.new',
    payer: 'John',
    purpose: 'Website-Hosting (onridepictures u. a.)',
    items: [
      { name: 'Pro-Plan', amount: 25.0, currency: 'USD', cycle: 'monthly', note: 'Nächste Abrechnung: 26. Juli 2026' },
      {
        name: 'Domain onridepictures.com',
        amount: 19.99,
        currency: 'USD',
        cycle: 'yearly',
        note: 'Aktuell kostenloser Testzeitraum – erste Abbuchung ab 25.09.2026',
      },
      {
        name: 'Domain liftpictures-contact.com',
        amount: 19.99,
        currency: 'USD',
        cycle: 'yearly',
        note: 'Aktuell kostenloser Testzeitraum – erste Abbuchung ab 24.08.2026',
      },
    ],
  },
  {
    name: 'Make.com',
    payer: 'John',
    purpose: 'Automatisierungen (PDF-E-Mails etc.)',
    items: [{ name: 'Core Plan (20.000 Operationen/Monat)', amount: 18.82, currency: 'USD', cycle: 'monthly' }],
  },
  {
    name: 'Canva',
    payer: null,
    purpose: 'Design-Tool für Kataloge, PDFs etc.',
    items: [],
  },
  {
    name: 'Domain Factory',
    payer: 'Tom',
    purpose: 'Domain-Registrierungen und E-Mail-Postfächer (Kundennummer K125573)',
    // Amounts are each domain's current ongoing yearly rate, taken from its
    // most recent invoice - several had a cheaper first-year promo price
    // (e.g. noltingtom.de, onridephoto.com) that steps up on renewal, so the
    // very first invoice for those isn't what they actually cost going
    // forward. Compiled from 32 DomainFactory invoices, Jan 2025-Apr 2026.
    items: [
      { name: 'photoqm.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 07.01.2027' },
      { name: 'fotoanlagen.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 17.01.2027' },
      { name: 'noltingtom.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 01.02.2027 (1. Jahr war Aktionspreis 0,99 €) — Zweck unklar, evtl. privat' },
      { name: 'funfotobox.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 08.02.2027' },
      { name: 'tomsvilla.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 13.02.2027 — Zweck unklar, evtl. privat' },
      { name: 'liftpic.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Verlängert bis 25.04.2027' },
      { name: 'erlebnisfoto.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: '⚠ Letzte bekannte Laufzeit endete 16.06.2026 — keine neuere Verlängerungsrechnung vorliegend' },
      { name: 'fotosystems.eu', amount: 21.48, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 19.08.2026, Verlängerung noch offen' },
      { name: 'rideshooter.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 13.09.2026, Verlängerung noch offen' },
      { name: 'fotoanlage.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 13.09.2026, Verlängerung noch offen (eigene Domain, nicht fotoanlagen.com)' },
      { name: 'sharesmile.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 06.10.2026, Verlängerung noch offen — Zweck unklar' },
      { name: 'abi83.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 12.12.2026, Verlängerung noch offen — Zweck unklar, evtl. privat' },
      { name: 'liftpic.at', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 27.12.2026, Verlängerung noch offen' },
      { name: 'liftpic.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 27.12.2026, Verlängerung noch offen' },
      { name: 'alfom.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 27.12.2026, Verlängerung noch offen — Zweck unklar' },
      { name: 'liftpictures.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 27.12.2026, Verlängerung noch offen' },
      { name: 'onridephoto.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Aktuelles Jahr (bis 30.12.2026) zum Aktionspreis 0,99 €, danach 23,88 €/Jahr' },
      { name: 'onridevideo.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 31.12.2026, Verlängerung noch offen' },
      { name: 'yvonnenolting.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'Domains', note: 'Laufzeit bis 08.01.2027, Verlängerung noch offen — Zweck unklar, evtl. privat' },
      { name: 'tnolting@liftpictures.com', amount: 23.88, currency: 'EUR', cycle: 'yearly', group: 'E-Mail-Postfächer', note: 'Microsoft 365 E-Mail Essentials, Laufzeit bis 06.12.2026' },
      { name: 'automat@fotoanlagen.com', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'E-Mail-Postfächer', note: 'Microsoft 365 E-Mail Essentials, Laufzeit bis 06.12.2026' },
      { name: 'info@liftpic.de', amount: 11.88, currency: 'EUR', cycle: 'yearly', group: 'E-Mail-Postfächer', note: 'Microsoft 365 E-Mail Essentials, Laufzeit bis 06.12.2026' },
    ],
  },
  {
    name: 'Domains (weitere)',
    payer: 'John',
    purpose: 'Zusätzlich registrierte Domains',
    items: [
      { name: 'liftpictures-fotos.de', amount: 13.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 22.06.2027' },
      { name: 'dashboard-liftpictures.com', amount: 18.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 27.01.2027' },
      { name: 'liftpictures-app.de', amount: 13.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 08.01.2027' },
      { name: 'attraktionsfotos.de', amount: 13.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 15.11.2026' },
      { name: 'onridefotos.de', amount: 13.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 15.11.2026' },
      { name: 'onridebilder.de', amount: 13.0, currency: 'EUR', cycle: 'yearly', note: 'Verlängerung: 19.02.2027' },
    ],
  },
];

function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function sumBy(items: CostLineItem[], currency: Currency, cycle: Cycle): number {
  return items.filter((item) => item.currency === currency && item.cycle === cycle).reduce((sum, item) => sum + item.amount, 0);
}

const cycleLabel: Record<Cycle, string> = { monthly: 'monatlich', yearly: 'jährlich' };

export default function CostsPage() {
  const allItems = VENDORS.flatMap((vendor) => vendor.items);
  const monthlyEur = sumBy(allItems, 'EUR', 'monthly');
  const monthlyUsd = sumBy(allItems, 'USD', 'monthly');
  const yearlyEur = sumBy(allItems, 'EUR', 'yearly');
  const yearlyUsd = sumBy(allItems, 'USD', 'yearly');

  const payerTotals = (['Tom', 'John'] as const).map((payer) => {
    const items = VENDORS.filter((vendor) => vendor.payer === payer).flatMap((vendor) => vendor.items);
    return {
      payer,
      monthlyEur: sumBy(items, 'EUR', 'monthly'),
      monthlyUsd: sumBy(items, 'USD', 'monthly'),
      yearlyEur: sumBy(items, 'EUR', 'yearly'),
      yearlyUsd: sumBy(items, 'USD', 'yearly'),
    };
  });

  return (
    <div className="grid">
      <div className="card">
        <h2>Kosten</h2>
        <p className="note">Übersicht aller laufenden Abos: was wir wofür zahlen und wer aktuell zahlt.</p>
      </div>

      <div className="grid three">
        <div className="card">
          <p className="note">Monatlich</p>
          <p className="stat-value">{formatMoney(monthlyEur, 'EUR')}</p>
          <p className="note">+ {formatMoney(monthlyUsd, 'USD')}</p>
        </div>
        <div className="card">
          <p className="note">Jährlich</p>
          <p className="stat-value">{formatMoney(yearlyEur, 'EUR')}</p>
          <p className="note">+ {formatMoney(yearlyUsd, 'USD')}</p>
        </div>
        <div className="card">
          <p className="note">Monatlich hochgerechnet (inkl. anteiliger Jahreskosten)</p>
          <p className="stat-value">{formatMoney(monthlyEur + yearlyEur / 12, 'EUR')}</p>
          <p className="note">+ {formatMoney(monthlyUsd + yearlyUsd / 12, 'USD')}</p>
        </div>
      </div>

      <div className="card">
        <h3>Wer zahlt wie viel</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Zahler</th>
                <th>Monatlich</th>
                <th>Jährlich</th>
              </tr>
            </thead>
            <tbody>
              {payerTotals.map((row) => (
                <tr key={row.payer}>
                  <td>{row.payer}</td>
                  <td>
                    {formatMoney(row.monthlyEur, 'EUR')}
                    {row.monthlyUsd > 0 ? ` + ${formatMoney(row.monthlyUsd, 'USD')}` : ''}
                  </td>
                  <td>
                    {formatMoney(row.yearlyEur, 'EUR')}
                    {row.yearlyUsd > 0 ? ` + ${formatMoney(row.yearlyUsd, 'USD')}` : ''}
                  </td>
                </tr>
              ))}
              <tr>
                <td>Canva</td>
                <td colSpan={2} className="note">
                  Noch ungeklärt – siehe Hinweise unten
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {VENDORS.map((vendor) => (
        <div className="card" key={vendor.name}>
          <div className="support-panel-header">
            <h3>{vendor.name}</h3>
            {vendor.payer && <span className="badge">Zahlt: {vendor.payer}</span>}
          </div>
          <p className="note">{vendor.purpose}</p>

          {vendor.items.length === 0 ? (
            <p className="support-empty" style={{ marginTop: '10px' }}>
              Noch keine Preisangabe hinterlegt – bitte ergänzen.
            </p>
          ) : (
            <div className="table-wrap" style={{ marginTop: '10px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Betrag</th>
                    <th>Zyklus</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {vendor.items.map((item, index) => {
                    const previousGroup = index > 0 ? vendor.items[index - 1].group : undefined;
                    const showGroupHeader = item.group && item.group !== previousGroup;
                    return (
                      <Fragment key={item.name}>
                        {showGroupHeader && (
                          <tr>
                            <td colSpan={4} className="eyebrow" style={{ paddingTop: index === 0 ? undefined : '16px' }}>
                              {item.group}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td>{item.name}</td>
                          <td>{formatMoney(item.amount, item.currency)}</td>
                          <td>{cycleLabel[item.cycle]}</td>
                          <td className="note">{item.note ?? '–'}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      <div className="card">
        <h3>Hinweise</h3>
        <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
          <li className="note">
            Die beiden Bolt.new-Domains (onridepictures.com, liftpictures-contact.com) laufen aktuell im
            kostenlosen Testzeitraum. Die $19,99/Jahr fallen erst ab dem jeweiligen Testzeitraum-Ende an
            (25.09.2026 bzw. 24.08.2026).
          </li>
          <li className="note">Canva: Preis und Zahler sind noch nicht angegeben — bitte ergänzen.</li>
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
        </ul>
      </div>
    </div>
  );
}
