import { useEffect, useMemo, useState } from 'react';
import { CreditCard } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { formatCurrency, formatNumber } from '../lib/utils';
import type { MachineRevenue } from '../lib/kioskSales';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;

type Zeitraum = 'heute' | 'woche' | 'monat' | 'gesamt';

const ZEITRAEUME: { key: Zeitraum; label: string }[] = [
  { key: 'heute', label: 'Heute' },
  { key: 'woche', label: '7 Tage' },
  { key: 'monat', label: 'Dieser Monat' },
  { key: 'gesamt', label: 'Gesamt' },
];

// Jeder Automat behält überall dieselbe Farbe (Ring, Legende, Karte).
const FARBEN = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

type Marke = { marke: string; anzahl: number };

function Ring({ segmente, mitte, unten }: {
  segmente: { anteil: number; farbe: string }[];
  mitte: string;
  unten: string;
}) {
  const radius = 54;
  const umfang = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="18" />
        {segmente.map((s, i) => {
          const laenge = Math.max(0, s.anteil) * umfang;
          const el = (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={s.farbe}
              strokeWidth="18"
              strokeDasharray={`${laenge} ${umfang - laenge}`}
              strokeDashoffset={-offset}
            />
          );
          offset += laenge;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-semibold tabular-nums text-slate-800">{mitte}</span>
        <span className="text-xs text-slate-500">{unten}</span>
      </div>
    </div>
  );
}

export default function AutomatenUebersicht({ machines }: { machines: MachineRevenue[] }) {
  const { parkId } = usePark();
  const [zeitraum, setZeitraum] = useState<Zeitraum>('monat');
  const [marken, setMarken] = useState<Map<string, Marke[]> | null>(null);

  // Kartenmarken je Automat (letzte 30 Tage) - kommen aus den Terminal-Belegen.
  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      if (!parkId) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      try {
        const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}&ledger_tage=30`, {
          headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
        });
        const body = await res.json().catch(() => null);
        if (abgebrochen || !res.ok) return;
        const map = new Map<string, Marke[]>();
        for (const m of (body?.data?.machines ?? []) as Array<{
          machine_id: string;
          payments?: { kartenmarken?: Marke[] } | null;
        }>) {
          map.set(m.machine_id, m.payments?.kartenmarken ?? []);
        }
        setMarken(map);
      } catch {
        // ohne Marken bleibt die Karte einfach kürzer
      }
    }
    void laden();
    return () => { abgebrochen = true; };
  }, [parkId]);

  const summe = useMemo(
    () => machines.reduce(
      (acc, m) => ({ cent: acc.cent + m[zeitraum].cent, anzahl: acc.anzahl + m[zeitraum].anzahl }),
      { cent: 0, anzahl: 0 },
    ),
    [machines, zeitraum],
  );

  if (machines.length < 2) return null;

  // Anteil am Umsatz; gibt es (noch) keinen Umsatz, nach Käufen aufteilen.
  const nachUmsatz = summe.cent > 0;
  const gesamtWert = nachUmsatz ? summe.cent : summe.anzahl;
  const wert = (m: MachineRevenue) => (nachUmsatz ? m[zeitraum].cent : m[zeitraum].anzahl);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Automaten im Vergleich</h3>
          <p className="mt-0.5 text-sm text-slate-500">Wie sich Umsatz und Käufe auf die Automaten verteilen.</p>
        </div>
        <div className="inline-flex rounded-xl bg-white/50 p-1">
          {ZEITRAEUME.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZeitraum(z.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                zeitraum === z.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <GlassCard className="p-5">
          <h4 className="text-sm font-semibold text-slate-800">Verteilung nach Automat</h4>
          <div className="mt-4">
            <Ring
              segmente={machines.map((m, i) => ({
                anteil: gesamtWert > 0 ? wert(m) / gesamtWert : 0,
                farbe: FARBEN[i % FARBEN.length],
              }))}
              mitte={formatCurrency(summe.cent, 'eur')}
              unten={`${formatNumber(summe.anzahl)} Käufe`}
            />
          </div>
          <ul className="mt-4 space-y-2">
            {machines.map((m, i) => (
              <li key={m.machine_id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: FARBEN[i % FARBEN.length] }} />
                <span className="flex-1 truncate text-slate-700">{m.machine_label}</span>
                <span className="tabular-nums text-slate-500">
                  {gesamtWert > 0 ? Math.round((wert(m) / gesamtWert) * 100) : 0} %
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="grid gap-4 md:grid-cols-2">
          {machines.map((m, i) => {
            const farbe = FARBEN[i % FARBEN.length];
            const erkannt = m.karte_anzahl + m.bar_anzahl;
            const karteAnteil = erkannt > 0 ? m.karte_anzahl / erkannt : null;
            const liste = (marken?.get(m.machine_id) ?? []).filter((x) => x.marke !== 'ohne Angabe');
            const kartenGesamt = liste.reduce((s, x) => s + x.anzahl, 0);
            const markeUnbekannt = marken !== null && m.karte_anzahl > 0 && kartenGesamt === 0;
            return (
              <GlassCard key={m.machine_id} className="p-5">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: farbe }} />
                  <h4 className="text-sm font-semibold text-slate-800">{m.machine_label}</h4>
                  <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {m.card_only ? 'Nur Karte' : 'Bar & Karte'}
                  </span>
                </div>

                <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-800">
                  {formatCurrency(m[zeitraum].cent, 'eur')}
                </p>
                <p className="text-sm text-slate-500">{formatNumber(m[zeitraum].anzahl)} Käufe</p>

                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  {([['heute', 'Heute'], ['woche', '7 Tage'], ['gesamt', 'Gesamt']] as const).map(([key, label]) => (
                    <div key={key} className="rounded-lg bg-white/60 px-2.5 py-2">
                      <dt className="text-slate-400">{label}</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-slate-700">{formatCurrency(m[key].cent, 'eur')}</dd>
                      <dd className="tabular-nums text-slate-400">{formatNumber(m[key].anzahl)} Käufe</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Bezahlt mit</p>
                  {m.card_only ? (
                    <p className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800">
                      <CreditCard className="h-4 w-4" /> Nur Karte
                    </p>
                  ) : karteAnteil === null ? (
                    <p className="text-sm text-slate-400">noch keine Zuordnung</p>
                  ) : (
                    <>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-emerald-200">
                        <div className="bg-sky-500" style={{ width: `${karteAnteil * 100}%` }} />
                      </div>
                      <p className="mt-1.5 flex justify-between text-xs text-slate-500">
                        <span>Karte {Math.round(karteAnteil * 100)} %</span>
                        <span>Bar {Math.round((1 - karteAnteil) * 100)} %</span>
                      </p>
                    </>
                  )}
                </div>

                {(liste.length > 0 || markeUnbekannt) && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Kartenmarken (30 Tage)</p>
                    {liste.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {liste.slice(0, 4).map((x) => (
                          <span key={x.marke} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                            <span className="font-medium">{x.marke}</span>{' '}
                            <span className="tabular-nums text-sky-600">
                              {kartenGesamt > 0 ? Math.round((x.anzahl / kartenGesamt) * 100) : 0} %
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Nicht erfasst – vom Kartenterminal dieses Automaten kommen noch keine Belege.
                      </p>
                    )}
                  </div>
                )}
              </GlassCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
