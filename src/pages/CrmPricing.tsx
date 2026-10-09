import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';

type PlanKey = 'monatlich' | 'jaehrlich' | 'langzeit';

const eur = (value: number) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const MONTHLY_PRICE = 49;

const PLANS: {
  key: PlanKey;
  badge: string;
  name: string;
  months: number;
  freeMonths: number;
  highlight?: boolean;
}[] = [
  { key: 'monatlich', badge: 'Monatlich', name: 'Flexibel zahlen', months: 1, freeMonths: 0 },
  { key: 'jaehrlich', badge: 'Jährlich · 3 Monate geschenkt', name: '12 Monate im Voraus', months: 12, freeMonths: 3, highlight: true },
  { key: 'langzeit', badge: '48 Monate · 6 Monate geschenkt', name: '48 Monate im Voraus', months: 48, freeMonths: 6 },
];

const POINTS = [
  'QR-Code auf gedruckten Fotos zum Freischalten',
  'Hosting der Bilder online für deine Gäste',
  'Gäste bekommen die digitale Version ihres Fotos',
  'E-Mail-Adressen deiner Gäste sammeln, Liste und Export',
  'Freischalt-Weg wählen: E-Mail, Umfrage oder Social Media',
  'Social-Media-Aktion installieren',
  'Werbe-Pixel installieren (Meta und Google)',
  'Verwaltung aller Gästedaten im Dashboard',
  'Verwaltete Datenbank, Wartung und Updates durch uns',
];

export default function CrmPricing() {
  const { parkId } = usePark();
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [requested, setRequested] = useState<PlanKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(planKey: PlanKey) {
    const plan = PLANS.find((p) => p.key === planKey);
    if (!parkId || !plan) return;
    setBusy(planKey);
    setError(null);
    try {
      const paid = plan.months - plan.freeMonths;
      const label =
        plan.months === 1
          ? `CRM freischalten: ${MONTHLY_PRICE} €/Monat`
          : `CRM freischalten: ${plan.months} Monate im Voraus ${paid * MONTHLY_PRICE} € (${plan.freeMonths} Monate geschenkt)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequested((prev) => [...prev, planKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" />
          Zurück zum CRM
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">CRM: Preise und Pakete</h2>
        <p className="mt-1 text-sm text-slate-500">
          Gäste erhalten ihr digitales Foto, du erhältst ihre Kontakte. Alle Preise zzgl. MwSt.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-5 pt-3 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const hl = plan.highlight;
          const paid = plan.months - plan.freeMonths;
          const total = paid * MONTHLY_PRICE;
          const full = plan.months * MONTHLY_PRICE;
          const done = requested.includes(plan.key);
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ${
                hl ? 'shadow-xl ring-2 ring-amber-400 lg:-translate-y-4' : 'ring-slate-200'
              }`}
            >
              <span
                className={`mb-2 w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  hl ? 'bg-amber-400 text-slate-900' : plan.freeMonths ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {plan.badge}
              </span>
              <h3 className="text-base font-bold text-slate-800">{plan.name}</h3>
              <div className="mt-4 flex flex-wrap items-end gap-x-2">
                <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{eur(total)}</span>
                {plan.freeMonths > 0 && <span className="pb-0.5 text-sm text-slate-400 line-through">{eur(full)}</span>}
                <span className="pb-0.5 text-xs text-slate-500">{plan.months === 1 ? '/ Monat' : `für ${plan.months} Monate`}</span>
              </div>
              <p className="mt-2 min-h-[2.25rem] text-xs leading-snug text-slate-500">
                {plan.freeMonths > 0 ? (
                  <>
                    <span className="font-semibold text-emerald-700">Du sparst {eur(full - total)}</span> gegenüber{' '}
                    {eur(MONTHLY_PRICE)} monatlich.
                  </>
                ) : (
                  'Jederzeit der Einstieg, ohne Vorauszahlung.'
                )}
              </p>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
              <ul className="mt-2 flex-1 space-y-2">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {p}
                  </li>
                ))}
              </ul>
              {done ? (
                <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
                  <Check className="h-4 w-4" />
                  Angefragt – wir melden uns
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void request(plan.key)}
                  className={`mt-5 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    hl ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Send className="h-4 w-4" />
                  {busy === plan.key ? 'Wird gesendet…' : 'Freischalten'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
