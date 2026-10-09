import { useState } from 'react';
import { Check, Send } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';

type PlanKey = 'basis' | 'display' | 'long';

const eur = (value: number) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const INCLUDED = [
  'Geschwindigkeits-Hardware an der Bahn',
  'Hardware kostenlos – wir schicken sie dir',
  'Einrichtung & Support durch uns',
  'Tagesschnellster, Langsamster & Durchschnitt live im Dashboard',
  'Gäste-Rangliste mit Profilbild & Namen',
  'Tagesbestenliste als Seite für Gäste, im Design deines Parks',
  'Geschwindigkeit direkt auf dem Foto',
  'Gäste tragen sich per Foto-Code ein, kein Passwort nötig',
  'Hosting & Betrieb von Rangliste und Gästeseite inklusive',
  'Verwaltete Datenbank für Gästeprofile & Ranglisten',
  'Laufende Wartung, Updates & Überwachung durch uns',
];

const STEPS = [
  { title: 'Fahrt wird gemessen', text: 'Die Hardware an der Bahn misst jede Fahrt automatisch.' },
  { title: 'Tempo steht auf dem Foto', text: 'Gäste sehen ihre km/h direkt auf ihrem Erinnerungsfoto.' },
  { title: 'Rangliste motiviert', text: 'Wer es in die Tagesbestenliste schafft, kommt gern nochmal.' },
];

const PLANS: {
  key: PlanKey;
  name: string;
  monthly: number;
  months: number;
  fromYear2?: number;
  highlight?: boolean;
  badge?: string;
  image?: string;
  extras: string[];
}[] = [
  {
    key: 'basis',
    name: 'Speedmessung',
    monthly: 149,
    months: 12,
    image: '/speedmessung/langzeit.jpg',
    extras: ['12 Monate Laufzeit'],
  },
  {
    key: 'display',
    name: 'Speedmessung + Display',
    monthly: 249,
    months: 12,
    fromYear2: 149,
    highlight: true,
    badge: 'Beliebt',
    image: '/speedmessung/display.jpg',
    extras: [
      'Großes Display an der Bahn: Zeit & km/h für alle Gäste sichtbar',
      'Display ohne Einmalkosten',
      'Ab dem 2. Jahr nur 149 € pro Monat',
      '12 Monate Laufzeit',
    ],
  },
  {
    key: 'long',
    name: 'Speedmessung 48 Monate',
    monthly: 99,
    months: 48,
    badge: 'Sparpreis',
    image: '/speedmessung/langzeit.jpg',
    extras: ['Günstigster Monatspreis bei langer Laufzeit', 'Preis 48 Monate festgeschrieben', '48 Monate Laufzeit'],
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
      const label = `Speedmessung nachrüsten: ${plan.name} (${plan.months} Monate, ${plan.monthly} €/Monat${plan.fromYear2 ? `, ab Jahr 2 ${plan.fromYear2} €/Monat` : ''}, Hardware kostenlos)`;
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Noch nicht freigeschaltet
        </span>
        <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-900">Wer war heute der Schnellste?</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-600">
          Mit der Speedmessung wird jede Fahrt zum kleinen Wettkampf. Gäste fahren öfter, vergleichen sich und kommen
          wieder.
        </p>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">{step.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          Im Monatspreis steckt der laufende Betrieb: Server und Hosting, die verwaltete Datenbank für Gästeprofile und
          Ranglisten sowie Wartung und Updates. Du kümmerst dich um nichts.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid items-stretch gap-4 pt-5 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const done = requested.includes(plan.key);
          const hl = plan.highlight;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ${
                hl ? 'shadow-xl ring-2 ring-amber-400 sm:-translate-y-4' : 'ring-slate-200'
              }`}
            >
              {plan.image && (
                <div className="relative h-44 w-full shrink-0 overflow-hidden bg-slate-100">
                  <img src={plan.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 h-6">
                  {plan.badge && (
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        hl ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>
                <h4 className="min-h-[2.5rem] text-sm font-bold leading-snug text-slate-800">{plan.name}</h4>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-black leading-none tracking-tight text-slate-900">{eur(plan.monthly)}</span>
                  <span className="pb-0.5 text-xs text-slate-500">/ Monat</span>
                </div>
                <p className="mt-1.5 min-h-[2.25rem] text-[11px] leading-snug text-slate-500">
                  {plan.months} Monate Laufzeit · {plan.fromYear2 ? `im 1. Jahr, ab Jahr 2 ${eur(plan.fromYear2)} / Monat` : 'Hardware 0 €'} · zzgl. MwSt.
                </p>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
                <ul className="mt-2 flex-1 space-y-1.5">
                  {[...INCLUDED, ...plan.extras].map((p) => (
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
