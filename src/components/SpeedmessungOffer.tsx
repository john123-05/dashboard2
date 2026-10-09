import { useState } from 'react';
import { Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';

type PlanKey = 'basis' | 'display' | 'long';

const eur = (value: number) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const INCLUDED = [
  'Geschwindigkeits-Hardware an der Bahn',
  'Tagesschnellster, Langsamster & Durchschnitt live',
  'Gäste-Rangliste mit Profilbild & Namen',
  'Geschwindigkeit direkt auf dem Foto',
  'Einrichtung & Support durch uns',
  'Hardware kostenlos – wir schicken sie dir',
];

const PLANS: {
  key: PlanKey;
  name: string;
  monthly: number;
  months: number;
  oneTime?: number;
  fromYear2?: number;
  highlight?: boolean;
  badge?: string;
  points: string[];
}[] = [
  { key: 'basis', name: 'Speedmessung', monthly: 150, months: 12, points: ['Alles aus „Enthalten“', '12 Monate Laufzeit'] },
  {
    key: 'display',
    name: 'Speedmessung + Display',
    monthly: 250,
    fromYear2: 150,
    months: 12,
    highlight: true,
    badge: 'Beliebt',
    points: ['Alles aus „Enthalten“', 'Großes Display an der Bahn – ohne Einmalkosten', 'Ab dem 2. Jahr nur 150 € pro Monat', '12 Monate Laufzeit'],
  },
  {
    key: 'long',
    name: 'Speedmessung 48 Monate',
    monthly: 199,
    months: 48,
    badge: 'Sparpreis',
    points: ['Alles aus „Enthalten“', 'Günstiger bei langer Laufzeit', '48 Monate Laufzeit'],
  },
];

export default function SpeedmessungOffer() {
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
      const label = `Speedmessung nachrüsten: ${plan.name} (${plan.months} Monate, ${plan.monthly} €/Monat${
        plan.oneTime ? ` + ${plan.oneTime} € einmalig` : ''
      }${plan.fromYear2 ? `, ab Jahr 2 ${plan.fromYear2} €/Monat` : ''}, Hardware kostenlos)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequested((prev) => [...prev, planKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
        <span className="inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
          Noch nicht freigeschaltet
        </span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight">Mach aus jeder Fahrt einen Wettkampf</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
          Gäste sehen ihre Geschwindigkeit auf dem Foto und treten in der Tagesrangliste gegeneinander an. Das bringt
          sie zurück und lässt sie öfter fahren.
        </p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Enthalten in jedem Paket</p>
        <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {INCLUDED.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-snug text-slate-100">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-4 pt-2 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const done = requested.includes(plan.key);
          const hl = plan.highlight;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ${
                hl ? 'ring-2 ring-amber-400' : 'ring-slate-200'
              }`}
            >
              {plan.badge && (
                <span
                  className={`absolute -top-2.5 left-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    hl ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {plan.badge}
                </span>
              )}
              <h4 className="text-sm font-bold text-slate-800">{plan.name}</h4>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-black leading-none tracking-tight text-slate-900">{eur(plan.monthly)}</span>
                <span className="pb-0.5 text-xs text-slate-500">/ Monat</span>
              </div>
              <p className="mt-1.5 min-h-[2rem] text-[11px] leading-snug text-slate-500">
                {plan.fromYear2 ? `im 1. Jahr, ab Jahr 2 ${eur(plan.fromYear2)} / Monat` : 'Hardware 0 €'} · zzgl. MwSt.
              </p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {plan.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                    {p}
                  </li>
                ))}
              </ul>
              {done ? (
                <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Angefragt
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void request(plan.key)}
                  className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                    hl ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                  {busy === plan.key ? 'Wird gesendet…' : 'Freischalten'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-500">
        Das Display kannst du auch später dazubestellen. Wir melden uns nach deiner Anfrage persönlich.
      </p>
    </section>
  );
}
