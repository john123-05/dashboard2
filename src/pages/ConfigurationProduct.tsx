import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { fetchParkEquipment, meldeAusstattungsInteresse, type EquipmentItem } from '../lib/equipment';

/** Alle Bilder eines Eintrags in Reihenfolge: Startbild, Bild 2, Bild 3. */
function eintragBilder(item: EquipmentItem): string[] {
  return [item.image_url, item.before_image_url, item.after_image_url].filter((u): u is string => !!u);
}

/** Eine Zeile je Punkt; ohne Zeilenumbruch bleibt es ein einzelner Absatz. */
function beschreibungPunkte(text: string | null): string[] {
  return (text ?? '').split('\n').map((z) => z.trim()).filter(Boolean);
}

/** Zusatzleistungen bei Verkaufs-Modulen (PrintBox, Cashbox). Preise netto, einmalig. */
type Zusatz = { key: string; titel: string; preis: number; text: string; nur?: string };

const ZUSAETZE: Zusatz[] = [
  {
    key: 'personalisierung',
    titel: 'Personalisierung & Beklebung',
    preis: 390,
    text: 'Das Gehäuse bekommt das Design deines Parks: Logo, Farben und Motive als Folie oder Lackierung.',
  },
  {
    key: 'installation',
    titel: 'Installation vor Ort',
    preis: 490,
    text: 'Montage an der Wand, Anschluss an die Dialogbox, Inbetriebnahme und kurze Einweisung deines Teams.',
  },
  {
    key: 'versand',
    titel: 'Versand',
    preis: 190,
    text: 'Versicherter Versand per Spedition bis zu deinem Park, inklusive Verpackung.',
  },
  {
    key: 'scheinpruefer',
    titel: 'Scheinprüfer',
    preis: 1400,
    nur: 'Cashbox',
    text: 'Nimmt Scheine in 3 Sorten (Europa) an. Ca. 60 × 60 mm, wird in die Cashbox eingebaut.',
  },
];

const RATEN = 12;

/** Erste Zahl aus "4.900 € einmalig" -> 4900. */
function preisAus(text: string | undefined): number | null {
  const treffer = text?.match(/([\d.]+(?:,\d+)?)\s*€/);
  if (!treffer) return null;
  const zahl = Number(treffer[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(zahl) ? zahl : null;
}

const eur = (wert: number) =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurGenau = (wert: number) =>
  wert.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Produktseite eines Upgrades: Bilder links, Beschreibung und Preis rechts. */
export default function ConfigurationProduct() {
  const { id } = useParams();
  const { parkId } = usePark();
  const [item, setItem] = useState<EquipmentItem | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [sende, setSende] = useState(false);
  const [angefragt, setAngefragt] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [raten, setRaten] = useState(false);

  const preisTexte = (item?.mehrwert_text ?? '').split('·').map((t) => t.trim()).filter(Boolean);
  const basis = preisAus(preisTexte[0]);
  const monatlich = preisAus(preisTexte[1]);
  const verfuegbar = ZUSAETZE.filter((z) => !z.nur || z.nur === item?.titel);
  const zusatzSumme = verfuegbar.filter((z) => gewaehlt.includes(z.key)).reduce((sum, z) => sum + z.preis, 0);
  const einmalig = (basis ?? 0) + zusatzSumme;
  const istVerkauf = (item?.kategorie === 'Verkauf' || item?.kategorie === 'Zubehoer') && basis != null;

  useEffect(() => {
    if (!parkId) return;
    let aktiv = true;
    setLaden(true);
    fetchParkEquipment(parkId)
      .then((items) => {
        if (!aktiv) return;
        setItem(items.find((i) => i.id === id) ?? null);
        setIndex(0);
      })
      .catch((e) => aktiv && setFehler(e instanceof Error ? e.message : 'Produkt konnte nicht geladen werden.'))
      .finally(() => aktiv && setLaden(false));
    return () => {
      aktiv = false;
    };
  }, [parkId, id]);

  async function anfragen() {
    if (!parkId || !item) return;
    setSende(true);
    setFehler(null);
    try {
      if (istVerkauf) {
        const namen = verfuegbar.filter((z) => gewaehlt.includes(z.key)).map((z) => z.titel);
        const label = `${item.titel} anfragen${namen.length ? ` mit ${namen.join(', ')}` : ''}, Summe ${eur(einmalig)} einmalig${
          monatlich != null ? ` + ${eur(monatlich)}/Monat Service` : ''
        }${raten ? `, in ${RATEN} Raten à ${eurGenau(einmalig / RATEN)}` : ''}`;
        await meldeAusstattungsInteresse(parkId, { label });
      } else {
        await meldeAusstattungsInteresse(parkId, { itemId: item.id });
      }
      setAngefragt(true);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setSende(false);
    }
  }

  const zurueck = (
    <Link to="/configuration" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" />
      Zurück zur Konfiguration
    </Link>
  );

  if (laden) return <div className="space-y-4">{zurueck}<p className="text-sm text-slate-400">Wird geladen…</p></div>;
  if (!item) {
    return (
      <div className="space-y-4">
        {zurueck}
        <p className="text-sm text-slate-500">{fehler ?? 'Dieses Produkt gibt es nicht (mehr).'}</p>
      </div>
    );
  }

  const bilder = eintragBilder(item);
  const aktuell = bilder[index] ?? bilder[0];
  const punkte = beschreibungPunkte(item.beschreibung);
  const preise = preisTexte;

  return (
    <div className="space-y-5">
      {zurueck}
      {fehler && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{fehler}</p>}

      <GlassCard className="overflow-hidden p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex flex-col-reverse gap-3 self-start bg-slate-50 p-5 sm:flex-row lg:sticky lg:top-4">
            {bilder.length > 1 && (
              <div className="flex gap-2 sm:flex-col">
                {bilder.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setIndex(i)}
                    onMouseEnter={() => setIndex(i)}
                    className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${
                      i === index ? 'border-sky-500' : 'border-slate-200 opacity-80 hover:opacity-100'
                    }`}
                    aria-label={`Bild ${i + 1}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-xl bg-white p-3 lg:min-h-[520px]">
              {aktuell ? (
                <img src={aktuell} alt={item.titel} className="max-h-[560px] max-w-full object-contain" />
              ) : (
                <p className="text-sm text-slate-400">Noch kein Bild hinterlegt.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5 p-6 lg:p-8">
            <div>
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {item.kategorie}
              </span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-800">{item.titel}</h2>
            </div>

            {preise.length > 0 && (
              <div className="border-y border-slate-100 py-4">
                <p className="text-3xl font-black text-slate-900">{preise[0]}</p>
                {preise.slice(1).map((t) => (
                  <p key={t} className="mt-0.5 text-sm text-slate-500">{t}</p>
                ))}
                <p className="mt-1 text-xs text-slate-400">Alle Preise zzgl. MwSt.</p>
              </div>
            )}

            {punkte.length > 1 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Das ist dabei</p>
                <ul className="space-y-2">
                  {punkte.map((punkt) => (
                    <li key={punkt} className="flex items-start gap-2 text-sm leading-snug text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {punkt}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              punkte[0] && <p className="text-sm leading-relaxed text-slate-600">{punkte[0]}</p>
            )}


            {istVerkauf && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Dazu buchen
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {verfuegbar.map((zusatz) => {
                      const an = gewaehlt.includes(zusatz.key);
                      return (
                        <button
                          key={zusatz.key}
                          type="button"
                          onClick={() =>
                            setGewaehlt((alt) => (an ? alt.filter((k) => k !== zusatz.key) : [...alt, zusatz.key]))
                          }
                          aria-pressed={an}
                          className={`flex flex-col rounded-xl border-2 p-3 text-left transition ${
                            an ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="text-sm font-bold text-slate-800">{zusatz.titel}</span>
                            <span
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                an ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {an && <Check className="h-3 w-3" />}
                            </span>
                          </span>
                          <span className="mt-0.5 text-sm font-semibold text-slate-700">+ {eur(zusatz.preis)}</span>
                          <span className="mt-1 text-xs leading-snug text-slate-500">{zusatz.text}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Möchtest du in Raten zahlen?
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {[false, true].map((ratenwahl) => (
                      <button
                        key={String(ratenwahl)}
                        type="button"
                        onClick={() => setRaten(ratenwahl)}
                        aria-pressed={raten === ratenwahl}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          raten === ratenwahl ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="block text-sm font-bold text-slate-800">
                          {ratenwahl ? `In ${RATEN} Monatsraten` : 'Einmal zahlen'}
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold text-slate-700">
                          {ratenwahl ? `${eurGenau(einmalig / RATEN)} / Monat` : eur(einmalig)}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {ratenwahl
                            ? 'Die Summe verteilt sich auf 12 Monate. Die genauen Konditionen klären wir persönlich.'
                            : 'Eine Rechnung, alles auf einmal.'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>{item.titel}</span>
                    <span>{eur(basis ?? 0)}</span>
                  </div>
                  {verfuegbar.filter((z) => gewaehlt.includes(z.key)).map((z) => (
                    <div key={z.key} className="flex justify-between text-slate-600">
                      <span>{z.titel}</span>
                      <span>{eur(z.preis)}</span>
                    </div>
                  ))}
                  <div className="mt-1.5 flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-900">
                    <span>Einmalig</span>
                    <span>{eur(einmalig)}</span>
                  </div>
                  {monatlich != null && (
                    <div className="flex justify-between text-slate-600">
                      <span>Service/Hosting</span>
                      <span>{eur(monatlich)} / Monat</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => void anfragen()}
              disabled={sende || angefragt}
              className="mt-auto inline-flex w-full items-center justify-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-60"
            >
              {angefragt ? 'Anfrage gesendet, wir melden uns' : sende ? 'Wird gesendet…' : 'Jetzt anfragen'}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
