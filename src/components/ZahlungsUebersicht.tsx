import { useEffect, useState } from 'react';
import { Banknote, CreditCard, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;

/**
 * Bar oder Karte am Automaten - und ob das Wechselgeld stimmt.
 *
 * Woher die Zahlen kommen: der Automat liest sein Münzprotokoll (jeder Einwurf,
 * jede Auszahlung), seine Kartenbelege und seine Verkaufsliste und ordnet sie
 * über die Uhrzeit einander zu. Eine gemeinsame Vorgangsnummer gibt es nicht -
 * die drei Programme wissen nichts voneinander. Solange ein Gast nach dem
 * anderen am Automaten steht, ist die Zuordnung zuverlässig; deshalb steht bei
 * jedem Einzelposten, wie sicher sie ist.
 */

type Muenzbestand = {
  gemessen_am: string | null;
  // `undefined` heißt "nicht prüfbar" - ältere Automaten melden es nicht.
  verlaesslich?: boolean;
  hinweis?: string | null;
  sorten: { cent: number; anzahl: number; wert_cent: number }[];
  summe_cent: number;
};
type Muenzwarnung = {
  cent: number; anzahl: number; stufe: 'leer' | 'knapp'; text: string;
};
type Befund = {
  zeit: string; foto: string; betrag_cent: number; zahlungsart: string;
  eingeworfen_cent: number; ausgezahlt_cent: number;
  erwartetes_wechselgeld_cent: number; abweichung_cent: number;
  sicher: boolean; hinweis: string;
};
type Uebersicht = {
  bar_anzahl: number; bar_cent: number;
  karte_anzahl: number; karte_cent: number;
  unbekannt_anzahl: number;
  bar_anteil: number | null; karte_anteil: number | null;
  auffaellig: Befund[];
  letzte?: Befund[];
};
type Automat = {
  id: string; machine_id: string; machine_label: string | null;
  coin_inventory?: Muenzbestand | null;
  coin_warnings?: Muenzwarnung[];
  payments?: Uebersicht | null;
  payments_days?: number | null;
  prices_cent?: number[] | null;
};

function euro(cent: number | null | undefined): string {
  if (cent === null || cent === undefined) return '–';
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export default function ZahlungsUebersicht() {
  const { parkId } = usePark();
  const [automaten, setAutomaten] = useState<Automat[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;

    async function laden() {
      if (!parkId) { setLaedt(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setLaedt(false); return; }
      try {
        const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: EXTERNAL_SUPABASE_ANON_KEY,
          },
        });
        const body = await res.json().catch(() => null);
        if (abgebrochen) return;
        if (!res.ok) setFehler(body?.error || `HTTP ${res.status}`);
        else setAutomaten((body?.data?.machines || []) as Automat[]);
      } catch {
        if (!abgebrochen) setFehler('Die Zahlungsdaten konnten nicht geladen werden.');
      }
      if (!abgebrochen) setLaedt(false);
    }

    void laden();
    const t = setInterval(() => void laden(), 120_000);
    return () => { abgebrochen = true; clearInterval(t); };
  }, [parkId]);

  // Nur Automaten, die überhaupt Zahlungsdaten melden. Ein älterer Stand der
  // Automaten-Software liefert nichts - dann ist eine leere Karte ehrlicher
  // als erfundene Nullen.
  const mitDaten = automaten.filter((a) => a.payments || a.coin_inventory);
  if (!parkId || (!laedt && mitDaten.length === 0 && !fehler)) return null;

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-800">Bar oder Karte</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Wie am Automaten bezahlt wurde, und wie viel Wechselgeld noch bereitliegt.
        </p>
      </div>

      {laedt && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> wird geladen…
        </p>
      )}
      {fehler && <p className="text-sm text-rose-700">{fehler}</p>}

      <div className="space-y-5">
        {mitDaten.map((a) => (
          <AutomatBlock key={a.id} a={a} />
        ))}
      </div>
    </GlassCard>
  );
}

function AutomatBlock({ a }: { a: Automat }) {
  const z = a.payments;
  const gesamt = (z?.bar_anzahl ?? 0) + (z?.karte_anzahl ?? 0);
  const barAnteil = z?.bar_anteil ?? 0;
  const warnungen = a.coin_warnings ?? [];

  return (
    <div>
      {a.machine_label && (
        <p className="mb-2 text-sm font-medium text-slate-700">{a.machine_label}</p>
      )}

      {z && gesamt > 0 ? (
        <>
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Ring barAnteil={barAnteil} gesamt={gesamt} />
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <Anteil
                Icon={Banknote}
                titel="Bar"
                anzahl={z.bar_anzahl}
                betrag={z.bar_cent}
                anteil={barAnteil}
                farbe="text-emerald-700"
                hintergrund="bg-emerald-50/80"
              />
              <Anteil
                Icon={CreditCard}
                titel="Karte"
                anzahl={z.karte_anzahl}
                betrag={z.karte_cent}
                anteil={z.karte_anteil ?? 0}
                farbe="text-sky-700"
                hintergrund="bg-sky-50/80"
              />
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            {gesamt} Käufe{a.payments_days ? ` in den letzten ${a.payments_days} Tagen` : ''}
            {z.unbekannt_anzahl > 0 && (
              <> · {z.unbekannt_anzahl} ohne erkennbare Zahlung</>
            )}
            {a.prices_cent?.length ? (
              <> · eingestellte Preise: {a.prices_cent.map((c) => euro(c)).join(', ')}</>
            ) : null}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Noch keine Käufe im ausgewerteten Zeitraum
          {a.payments_days ? ` (letzte ${a.payments_days} Tage)` : ''}.
        </p>
      )}

      {a.coin_inventory && (
        <div className="mt-4 rounded-xl bg-white/40 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Wechselgeld im Gerät</span>
            <span className={`text-lg font-semibold tabular-nums ${
              a.coin_inventory.verlaesslich === false
                ? 'text-slate-400 line-through' : 'text-slate-800'
            }`}>
              {euro(a.coin_inventory.summe_cent)}
            </span>
          </div>

          {a.coin_inventory.verlaesslich === false && a.coin_inventory.hinweis && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              <b className="font-semibold">Betrag nicht gesichert:</b>{' '}
              {a.coin_inventory.hinweis}
            </p>
          )}

          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {a.coin_inventory.sorten.map((s) => {
              const w = warnungen.find((x) => x.cent === s.cent);
              const groesste = Math.max(1, ...a.coin_inventory!.sorten.map((x) => x.anzahl));
              return (
                <div key={s.cent} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-right tabular-nums text-slate-500">
                    {euro(s.cent)}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <span
                      className={`block h-full rounded-full ${
                        w?.stufe === 'leer' ? 'bg-rose-500'
                          : w?.stufe === 'knapp' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${(s.anzahl / groesste) * 100}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 tabular-nums text-slate-500">
                    {s.anzahl} St.
                  </span>
                </div>
              );
            })}
          </div>
          {warnungen.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {warnungen.map((w) => (
                <li
                  key={w.cent}
                  className={w.stufe === 'leer' ? 'text-rose-700' : 'text-amber-800'}
                >
                  {w.text}
                  {w.stufe === 'leer' && ' – bitte nachfüllen, sonst bekommen Gäste zu wenig zurück.'}
                </li>
              ))}
            </ul>
          )}
          {a.coin_inventory.gemessen_am && (
            <p className="mt-1.5 text-[11px] text-slate-400">
              Stand {new Date(a.coin_inventory.gemessen_am).toLocaleString('de-DE')}
            </p>
          )}
        </div>
      )}

      {z?.letzte && z.letzte.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-slate-700">Die letzten Käufe</p>
          <div className="overflow-x-auto rounded-xl border border-white/50 bg-white/40">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500">
                <tr className="border-b border-white/60">
                  <th className="px-3 py-2 font-medium">Zeitpunkt</th>
                  <th className="px-3 py-2 font-medium">Foto</th>
                  <th className="px-3 py-2 font-medium">Bezahlt mit</th>
                  <th className="px-3 py-2 text-right font-medium">Gegeben</th>
                  <th className="px-3 py-2 text-right font-medium">Zurück</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {z.letzte.slice(0, 15).map((b, i) => (
                  <tr key={i} className="border-t border-white/50">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                      {new Date(b.zeit).toLocaleString('de-DE')}
                    </td>
                    <td className="px-3 py-1.5 text-slate-500">
                      {b.foto.split('\\').pop()}
                    </td>
                    <td className="px-3 py-1.5">
                      {b.zahlungsart === 'bar' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
                          <Banknote className="h-3 w-3" /> Bar
                        </span>
                      ) : b.zahlungsart === 'karte' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
                          <CreditCard className="h-3 w-3" /> Karte
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">
                          unbekannt
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {b.zahlungsart === 'bar' ? euro(b.eingeworfen_cent) : '–'}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${
                      b.abweichung_cent !== 0 && b.sicher ? 'font-semibold text-rose-700' : ''
                    }`}>
                      {b.zahlungsart === 'bar' ? euro(b.ausgezahlt_cent) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Zahlungsart und Wechselgeld stammen aus dem Münz- und Kartenprotokoll
            des Automaten, über die Uhrzeit dem Kauf zugeordnet.
          </p>
        </div>
      )}

      {z && z.auffaellig.length > 0 && (
        <details className="group mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-rose-800 [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {z.auffaellig.length} Käufe mit falschem Wechselgeld
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition group-open:rotate-180" />
          </summary>
          <p className="mt-1.5 text-xs text-rose-700">
            Eingeworfen minus Preis muss dem ausgezahlten Wechselgeld entsprechen.
            Wo das nicht stimmt, gibt der Münzwechsler zu viel oder zu wenig heraus.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-rose-700">
                <tr>
                  <th className="py-1 pr-3 font-medium">Zeitpunkt</th>
                  <th className="py-1 pr-3 font-medium">Eingeworfen</th>
                  <th className="py-1 pr-3 font-medium">Erwartet</th>
                  <th className="py-1 pr-3 font-medium">Ausgezahlt</th>
                  <th className="py-1 font-medium">Abweichung</th>
                </tr>
              </thead>
              <tbody className="text-rose-900">
                {z.auffaellig.slice(0, 10).map((b, i) => (
                  <tr key={i} className="border-t border-rose-200/60">
                    <td className="py-1 pr-3 tabular-nums">
                      {new Date(b.zeit).toLocaleString('de-DE')}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{euro(b.eingeworfen_cent)}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {euro(b.erwartetes_wechselgeld_cent)}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{euro(b.ausgezahlt_cent)}</td>
                    <td className="py-1 font-semibold tabular-nums">
                      {b.abweichung_cent > 0 ? '+' : ''}{euro(b.abweichung_cent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Bar/Karte als Ring.
 *
 * Als SVG von Hand statt mit einer Diagrammbibliothek: es sind genau zwei
 * Werte, die sich zu 100 % ergänzen. Der Kreisumfang dient als Skala - der
 * grüne Bogen bekommt seinen Anteil davon, der Rest bleibt blau. In der Mitte
 * steht der Barteil, weil das die Zahl ist, nach der man hier sucht.
 */
function Ring({ barAnteil, gesamt }: { barAnteil: number; gesamt: number }) {
  const r = 42;
  const umfang = 2 * Math.PI * r;
  const bar = umfang * barAnteil;

  return (
    <div className="relative shrink-0">
      <svg width="112" height="112" viewBox="0 0 112 112" role="img"
        aria-label={`${Math.round(barAnteil * 100)} Prozent bar, ${Math.round((1 - barAnteil) * 100)} Prozent Karte`}>
        {/* Karte als voller Kreis, Bar als Bogen darüber - so bleibt bei 0 %
            Bar trotzdem ein sauberer Ring stehen. */}
        <circle cx="56" cy="56" r={r} fill="none" strokeWidth="14"
          className="stroke-sky-500" />
        <circle
          cx="56" cy="56" r={r} fill="none" strokeWidth="14"
          className="stroke-emerald-500"
          strokeDasharray={`${bar} ${umfang - bar}`}
          strokeDashoffset={umfang / 4}
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-slate-800">
          {Math.round(barAnteil * 100)}&nbsp;%
        </span>
        <span className="text-[11px] text-slate-500">bar</span>
        <span className="text-[10px] text-slate-400">{gesamt} Käufe</span>
      </div>
    </div>
  );
}

function Anteil({ Icon, titel, anzahl, betrag, anteil, farbe, hintergrund }: {
  Icon: typeof Banknote;
  titel: string; anzahl: number; betrag: number; anteil: number;
  farbe: string; hintergrund: string;
}) {
  return (
    <div className={`rounded-xl px-4 py-3 ${hintergrund}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${farbe}`} />
        <span className={`text-sm font-medium ${farbe}`}>{titel}</span>
        <span className="ml-auto text-lg font-semibold tabular-nums text-slate-800">
          {Math.round(anteil * 100)}&nbsp;%
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        <b className="tabular-nums">{anzahl}</b> Käufe · {euro(betrag)}
      </p>
    </div>
  );
}
