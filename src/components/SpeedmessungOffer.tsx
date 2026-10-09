import { useState } from 'react';
import { Check, Gauge, Send, Truck, Trophy, TrendingUp } from 'lucide-react';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';

type PlanKey = 'basis' | 'display' | 'long';

const eur = (value: number) =>
  value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const CORE_FEATURES = [
  'Geschwindigkeits-Hardware an der Bahn',
  'Tagesschnellster, Langsamster & Durchschnitt live',
  'Gäste-Rangliste mit Profilbild & Namen',
  'Geschwindigkeit direkt auf dem Foto',
  'Hardware kostenlos – wir schicken sie dir',
  'Einrichtung & Support durch uns',
];

const PLANS: {
  key: PlanKey;
  name: string;
  tagline: string;
  monthly: number;
  months: number;
  oneTime?: number;
  highlight?: boolean;
  badge?: string;
  features: string[];
}[] = [
  {
    key: 'basis',
    name: 'Speedmessung',
    tagline: 'Der Einstieg – flexibel, 12 Monate.',
    monthly: 250,
    months: 12,
    features: CORE_FEATURES,
  },
  {
    key: 'display',
    name: 'Speedmessung + Display',
    tagline: 'Mit großem Display direkt an der Bahn.',
    monthly: 250,
    months: 12,
    oneTime: 1000,
    highlight: true,
    badge: 'Beliebt',
    features: [
      CORE_FEATURES[0],
      'Großes Display: Geschwindigkeit & Tagesbestzeit für alle Gäste',
      ...CORE_FEATURES.slice(1),
    ],
  },
  {
    key: 'long',
    name: 'Speedmessung 48 Monate',
    tagline: 'Dauerhaft günstiger bei langer Laufzeit.',
    monthly: 199,
    months: 48,
    badge: 'Sparpreis',
    features: CORE_FEATURES,
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
      }, Hardware kostenlos)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequested((prev) => [...prev, planKey]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto mt-14 max-w-5xl space-y-6 border-t border-slate-200/70 pt-10">
      <div className="text-center">
        <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          Noch nicht freigeschaltet
        </span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-800">Speedmessung nachrüsten</h3>
        <p className="mx-auto mt-2 flex max-w-xl items-start justify-center gap-2 text-sm leading-relaxed text-slate-600">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Alles ist für deinen Park schon vorbereitet – du musst es nur freischalten. Wir schicken dir die Hardware
            kostenlos zu und richten alles ein.
          </span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Gauge, title: 'Geschwindigkeit sehen', text: 'Jede Fahrt wird gemessen – live im Dashboard und auf dem Foto.' },
          { icon: Trophy, title: 'Tagesrangliste', text: 'Gäste tragen sich ein, die Schnellsten des Tages werden gefeiert.' },
          { icon: TrendingUp, title: 'Mehr Fahrten & Verkäufe', text: 'Der Wettkampf bringt Gäste zurück und lässt sie öfter fahren.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-3 rounded-2xl bg-white/60 p-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">{error}</p>}

      <div className="grid gap-5 pt-3 md:grid-cols-3">
        {PLANS.map((plan) => {
          const dark = plan.highlight;
          const done = requested.includes(plan.key);
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-3xl p-5 ${
                dark ? 'bg-slate-900 text-white shadow-xl ring-1 ring-slate-800' : 'bg-white/80 text-slate-800 shadow-sm ring-1 ring-slate-200'
              }`}
            >
              {plan.badge && (
                <span
                  className={`absolute -top-3 left-5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    dark ? 'bg-amber-400 text-slate-900' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {plan.badge}
                </span>
              )}
              <h4 className="text-base font-bold">{plan.name}</h4>
              <p className={`mt-1 text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>{plan.tagline}</p>

              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-black leading-none tracking-tight">{eur(plan.monthly)}</span>
                <span className={`pb-0.5 text-xs ${dark ? 'text-slate-300' : 'text-slate-500'}`}>/ Monat</span>
              </div>
              <p className={`mt-2 text-[11px] leading-snug ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                {plan.months} Monate Laufzeit · zzgl. MwSt. · Hardware 0 €
                {plan.oneTime ? ` · einmalig ${eur(plan.oneTime)} für das Display` : ''}
              </p>

              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-[13px] leading-snug">
                    <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${dark ? 'text-amber-300' : 'text-emerald-600'}`} />
                    <span className={dark ? 'text-slate-100' : 'text-slate-700'}>{feature}</span>
                  </li>
                ))}
              </ul>

              {done ? (
                <div
                  className={`mt-6 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    dark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <Check className="h-4 w-4" />
                  Angefragt – wir melden uns
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void request(plan.key)}
                  className={`mt-6 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                    dark ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
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

      <p className="pb-4 text-center text-xs text-slate-500">
        Das große Display kannst du auch später dazubestellen. Alle Preise zzgl. MwSt.
      </p>
    </section>
  );
}
