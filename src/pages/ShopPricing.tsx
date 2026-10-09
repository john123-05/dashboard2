import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';
import { requestShopActivation } from '../lib/shop';

type PlanKey = 'monatlich' | 'jaehrlich' | 'fullservice';

const eur = (value: number, digits = 0) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });

const SETUP_PRICE = 749;
const MONTHLY_PRICE = 99;
const FREE_MONTHS = 3;
const YEARLY_PRICE = MONTHLY_PRICE * (12 - FREE_MONTHS);
const YEARLY_FULL_PRICE = MONTHLY_PRICE * 12;
const YEARLY_SAVING = YEARLY_FULL_PRICE - YEARLY_PRICE;
const REVENUE_SHARE_PERCENT = 15;

const PACKAGE_POINTS = [
  'Shop im Design deines Parks: Name, Logo, Farbe, Schrift',
  'Einrichtung und Anbindung an dein Fotosystem',
  'Produkte festlegen: Download, Tasse, T-Shirt & Co.',
  'Zahlungsabwicklung über Stripe eingerichtet',
  'Hosting, Service und Wartung mit Updates',
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
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(plan: PlanKey) {
    if (!parkId) return;
    setBusy(plan);
    setError(null);
    try {
      const label =
        plan === 'monatlich'
          ? `Shop freischalten: Einrichtung ${SETUP_PRICE} € einmalig + ${MONTHLY_PRICE} €/Monat`
          : plan === 'jaehrlich'
            ? `Shop freischalten: Einrichtung ${SETUP_PRICE} € einmalig + 12 Monate im Voraus ${YEARLY_PRICE} € (${FREE_MONTHS} Monate geschenkt)`
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
            Monatlich
          </span>
          <h3 className="text-base font-bold text-slate-800">Einrichtung + Monatspaket</h3>
          <div className="mt-4 flex items-start gap-2">
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(SETUP_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">einmalig</p>
            </div>
            <span className="flex h-9 items-center text-3xl font-bold leading-none text-slate-900">+</span>
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(MONTHLY_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">pro Monat</p>
            </div>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            Einrichtung inklusive Anbindung und Branding.
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
          <ul className="mt-2 flex-1 space-y-2">
            {PACKAGE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
          <Action plan="monatlich" />
        </div>

        <div className={`${cardBase} shadow-xl ring-2 ring-amber-400 lg:-translate-y-4`}>
          <span className="mb-2 w-fit rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
            Jährlich · {FREE_MONTHS} Monate geschenkt
          </span>
          <h3 className="text-base font-bold text-slate-800">Einrichtung + 12 Monate im Voraus</h3>
          <div className="mt-4 flex items-start gap-2">
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(SETUP_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">einmalig</p>
            </div>
            <span className="flex h-9 items-center text-3xl font-bold leading-none text-slate-900">+</span>
            <div>
              <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(YEARLY_PRICE)}</span>
              <p className="mt-1 text-xs text-slate-500">
                für 12 Monate <span className="text-slate-400 line-through">{eur(YEARLY_FULL_PRICE)}</span>
              </p>
            </div>
          </div>
          <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
            <span className="font-semibold text-emerald-700">Du sparst {eur(YEARLY_SAVING)}</span> gegenüber{' '}
            {eur(MONTHLY_PRICE)} monatlich.
          </p>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
          <ul className="mt-2 flex-1 space-y-2">
            {PACKAGE_POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
          <Action plan="jaehrlich" dark />
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

    </div>
  );
}
