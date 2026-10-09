import { useState } from 'react';
import { Check, Gauge, Monitor, Send, Truck, Trophy, TrendingUp } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../lib/equipment';

type Term = 12 | 24;

// Hardware is free; the park pays a monthly fee. Longer commitment = cheaper.
const MONTHLY_EUR: Record<Term, number> = { 12: 250, 24: 199 };
const DISPLAY_EXTRA_EUR = 1500;

const BASE_FEATURES = [
  'Geschwindigkeits-Messung an deiner Bahn',
  'Tagesschnellster, Langsamster und Durchschnitt live im Dashboard',
  'Gäste-Rangliste mit Profilbild & Namen',
  'Geschwindigkeit direkt auf dem Foto',
  'Hardware kostenlos – wir schicken sie dir',
  'Einrichtung & Support durch uns',
];

const eur = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function PlanCard({
  name,
  tagline,
  monthly,
  oneTime,
  term,
  features,
  highlighted,
  requested,
  busy,
  onRequest,
}: {
  name: string;
  tagline: string;
  monthly: number;
  oneTime?: number;
  term: Term;
  features: string[];
  highlighted?: boolean;
  requested: boolean;
  busy: boolean;
  onRequest: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-3xl p-6 sm:p-7 ${
        highlighted ? 'bg-slate-900 text-white shadow-2xl ring-1 ring-slate-800' : 'bg-white/80 text-slate-800 shadow-sm ring-1 ring-slate-200'
      }`}
    >
      {highlighted && (
        <span className="absolute -top-3 left-6 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900">
          Beliebt
        </span>
      )}
      <h3 className="text-lg font-bold">{name}</h3>
      <p className={`mt-1 text-sm ${highlighted ? 'text-slate-300' : 'text-slate-500'}`}>{tagline}</p>

      <div className="mt-5 flex items-end gap-1.5">
        <span className="text-5xl font-black leading-none tracking-tight">{eur(monthly)}</span>
        <span className={`pb-1 text-sm ${highlighted ? 'text-slate-300' : 'text-slate-500'}`}>/ Monat</span>
      </div>
      <p className={`mt-2 text-xs ${highlighted ? 'text-slate-400' : 'text-slate-500'}`}>
        {term} Monate Laufzeit · zzgl. MwSt. · Hardware 0 €
        {oneTime ? ` · einmalig ${eur(oneTime)} für das Display` : ''}
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${highlighted ? 'text-amber-300' : 'text-emerald-600'}`} />
            <span className={highlighted ? 'text-slate-100' : 'text-slate-700'}>{feature}</span>
          </li>
        ))}
      </ul>

      {requested ? (
        <div
          className={`mt-7 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            highlighted ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          <Check className="h-4 w-4" />
          Angefragt – wir melden uns
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onRequest}
          className={`mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60 ${
            highlighted ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          <Send className="h-4 w-4" />
          {busy ? 'Wird gesendet…' : 'Speedmessung freischalten'}
        </button>
      )}
    </div>
  );
}

export default function SpeedmessungOffer() {
  const { parkId } = usePark();
  const [term, setTerm] = useState<Term>(12);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [requestedPlans, setRequestedPlans] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function request(plan: 'basis' | 'display') {
    if (!parkId) return;
    setBusyPlan(plan);
    setError(null);
    try {
      const label =
        plan === 'display'
          ? `Speedmessung nachrüsten inkl. Display (${term} Monate, ${MONTHLY_EUR[term]} €/Monat + ${DISPLAY_EXTRA_EUR} € einmalig)`
          : `Speedmessung nachrüsten (${term} Monate, ${MONTHLY_EUR[term]} €/Monat, Hardware kostenlos)`;
      await meldeAusstattungsInteresse(parkId, { label });
      setRequestedPlans((prev) => [...prev, plan]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Speedmessung</h2>
          <p className="mt-1 text-sm text-slate-500">Lass deine Gäste gegeneinander antreten – und verkaufe mehr Fotos.</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Noch nicht freigeschaltet</span>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Truck className="h-6 w-6" />
          </div>
          <p className="flex-1 text-sm leading-relaxed text-slate-700 sm:text-base">
            <strong>Alles ist für deinen Park schon vorbereitet.</strong> Du musst es nur freischalten – wir schicken dir die
            Hardware kostenlos zu und richten alles ein.
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Gauge, title: 'Geschwindigkeit sehen', text: 'Jede Fahrt wird gemessen – live im Dashboard und auf dem Foto.' },
            { icon: Trophy, title: 'Tagesrangliste', text: 'Gäste tragen sich ein, Schnellste des Tages werden gefeiert.' },
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
      </GlassCard>

      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Laufzeit">
          {([12, 24] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={term === value}
              onClick={() => setTerm(value)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                term === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {value} Monate
              {value === 24 && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  −{eur(MONTHLY_EUR[12] - MONTHLY_EUR[24])}/Monat
                </span>
              )}
            </button>
          ))}
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </div>

      <div className="grid gap-6 pt-2 lg:grid-cols-2">
        <PlanCard
          name="Speedmessung"
          tagline="Alles, was du für den Start brauchst."
          monthly={MONTHLY_EUR[term]}
          term={term}
          features={BASE_FEATURES}
          highlighted
          requested={requestedPlans.includes('basis')}
          busy={busyPlan === 'basis'}
          onRequest={() => void request('basis')}
        />
        <PlanCard
          name="Speedmessung + Display"
          tagline="Mit großem Display direkt an der Bahn."
          monthly={MONTHLY_EUR[term]}
          oneTime={DISPLAY_EXTRA_EUR}
          term={term}
          features={[
            ...BASE_FEATURES.slice(0, 1),
            'Großes Display: Geschwindigkeit & Tagesbestzeit live für alle Gäste',
            ...BASE_FEATURES.slice(1),
          ]}
          requested={requestedPlans.includes('display')}
          busy={busyPlan === 'display'}
          onRequest={() => void request('display')}
        />
      </div>

      <p className="flex items-center justify-center gap-2 pb-2 text-center text-xs text-slate-500">
        <Monitor className="h-3.5 w-3.5" />
        Das Display kannst du auch später dazubestellen (einmalig {eur(DISPLAY_EXTRA_EUR)}). Preise zzgl. MwSt.
      </p>
    </div>
  );
}
