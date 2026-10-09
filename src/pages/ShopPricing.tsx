import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { requestShopActivation } from '../lib/shop';

type PlanKey = 'einmalig' | 'monatlich' | 'fullservice';

const eur = (value: number, digits = 0) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

const SETUP_PRICE = 749;
const MONTHLY_PRICE = 99;
const FREE_MONTHS = 3;
const YEARLY_PRICE = MONTHLY_PRICE * (12 - FREE_MONTHS);
const REVENUE_SHARE_PERCENT = 15;

const ONCE_POINTS = [
  'Shop im Design deines Parks: Name, Logo, Farbe, Schrift',
  'Einrichtung und Anbindung an dein Fotosystem',
  'Produkte festlegen: Download, Tasse, T-Shirt & Co.',
  'Zahlungsabwicklung über Stripe eingerichtet',
  'Vorführ-Shop mit QR-Code zum Testen',
];

const MONTHLY_POINTS = [
  'Hosting deines Shops',
  'Service und Support durch uns',
  'Wartung und laufende Updates',
  'Verwaltete Datenbank für Bestellungen und Nutzerdaten',
  'Verkäufe und Umsatz live im Dashboard',
];

const FULL_POINTS = [
  'Einrichtung kostenlos',
  'Keine monatlichen Kosten',
  'Hosting, Service und Wartung inklusive',
  'Wir kümmern uns um Druck und Versand der Artikel',
  'Rundum-Betrieb, du musst dich um nichts kümmern',
];

export default function ShopPricing() {
  const { parkId } = usePark();
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(plan: PlanKey) {
    if (!parkId) return;
    setBusy(plan);
    setError(null);
    try {
      const label =
        plan === 'einmalig'
          ? `Shop freischalten: Einmalig, Einrichtung ${SETUP_PRICE} €`
          : plan === 'monatlich'
            ? `Shop freischalten: Monatlich ${yearly ? `12 Monate im Voraus ${YEARLY_PRICE} € (${FREE_MONTHS} Monate geschenkt)` : `${MONTHLY_PRICE} €/Monat`} (zzgl. Einrichtung ${SETUP_PRICE} €)`
            : `Shop freischalten: Full-Service, ${REVENUE_SHARE_PERCENT} % der Shop-Einnahmen, Einrichtung und Monatskosten 0 €`;
      await meldeAusstattungsInteresse(parkId, { label });
      await requestShopActivation(parkId).catch(() => undefined);
      setRequested((prev) => [...prev, plan]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  function Action({ plan, dark }: { plan: PlanKey; dark?: boolean }) {
    if (requested.includes(plan)) {
      return (
        <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" />
          Angefragt – wir melden uns
        </div>
      );
    }
    return (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void request(plan)}
        className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
          dark ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        <Send className="h-4 w-4" />
        {busy === plan ? 'Wird gesendet…' : 'Shop freischalten'}
      </button>
    );
  }

  const cardBase = 'relative flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200';

  return (
    <div className="space-y-6">
      <div>
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Zurück zum Shop
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">Shop freischalten</h2>
        <p className="mt-1 text-sm text-slate-500">Drei Wege zu deinem eigenen Foto-Shop. Alle Preise zzgl. MwSt.</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        <div className={cardBase}>
          <span className="mb-2 w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Einmalig
          </span>
          <h3 className="text-base font-bold text-slate-800">Einrichtung</h3>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(SETUP_PRICE)}</span>
            <span className="pb-0.5 text-xs text-slate-500">einmalig</span>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            Fällt einmal an, immer {eur(SETUP_PRICE)}. Dazu kommt das Monatspaket.
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
          <ul className="mt-2 flex-1 space-y-2">
            {ONCE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
          <Action plan="einmalig" />
        </div>

        <div className={`${cardBase} shadow-xl ring-2 ring-amber-400 lg:-translate-y-4`}>
          <span className="mb-2 w-fit rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
            Monatlich
          </span>
          <h3 className="text-base font-bold text-slate-800">Hosting, Service & Wartung</h3>
          <div className="mt-3 inline-flex w-fit rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={`rounded-md px-3 py-1 ${!yearly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              Monatlich
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={`rounded-md px-3 py-1 ${yearly ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              12 Monate im Voraus
            </button>
          </div>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-4xl font-black leading-none tracking-tight text-slate-900">
              {yearly ? eur(YEARLY_PRICE) : eur(MONTHLY_PRICE)}
            </span>
            <span className="pb-0.5 text-xs text-slate-500">{yearly ? 'für 12 Monate' : '/ Monat'}</span>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            {yearly
              ? `${FREE_MONTHS} Monate geschenkt: du zahlst nur ${12 - FREE_MONTHS} × ${eur(MONTHLY_PRICE)}.`
              : `Bei 12 Monaten im Voraus sind ${FREE_MONTHS} Monate geschenkt.`}
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
          <ul className="mt-2 flex-1 space-y-2">
            {MONTHLY_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
          <Action plan="monatlich" dark />
        </div>

        <div className={cardBase}>
          <span className="mb-2 w-fit rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
            Full-Service
          </span>
          <h3 className="text-base font-bold text-slate-800">Revenue Share</h3>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{REVENUE_SHARE_PERCENT} %</span>
            <span className="pb-0.5 text-xs text-slate-500">der Shop-Einnahmen</span>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            Einrichtung 0 €, monatlich 0 €. Der Rest der Einnahmen ist dein Gewinn.
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
          <ul className="mt-2 flex-1 space-y-2">
            {FULL_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
          <Action plan="fullservice" />
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        „Einmalig“ und „Monatlich“ gehören zusammen: {eur(SETUP_PRICE)} Einrichtung plus {eur(MONTHLY_PRICE)} im Monat.
        „Full-Service“ ersetzt beides.
      </p>
    </div>
  );
}
