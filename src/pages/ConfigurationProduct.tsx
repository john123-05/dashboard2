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
type Zusatz = {
  key: string;
  titel: string;
  preis: number;
  text: string;
  nur?: string;
  /** Streichpreis, wenn der Zusatz im Kombi-Paket günstiger ist. */
  vorher?: number;
  /** Zusätzliche monatliche Kosten, die der Zusatz mitbringt. */
  monatlich?: number;
  badge?: string;
};

/** Kombi-Preis: Wer PrintBox/Cashbox mit dem Online-Shop bucht, zahlt die Shop-Einrichtung nicht. */
const SHOP_EINRICHTUNG = 749;
const SHOP_MONATLICH = 99;
const SHOP_JAHR = SHOP_MONATLICH * 9;
const SHOP_ANTEIL = 15;

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

/** Preise eines Eintrags: "749 € einmalig · 99 € pro Monat" oder nur "149 € pro Monat · 12 Monate". */
function preisSplit(item: EquipmentItem): { einmalig: number; monatlich: number } {
  const teile = (item.mehrwert_text ?? '').split('·').map((t) => t.trim());
  const erster = preisAus(teile[0]) ?? 0;
  if (/monat/i.test(teile[0] ?? '')) return { einmalig: 0, monatlich: erster };
  return { einmalig: erster, monatlich: preisAus(teile[1]) ?? 0 };
}

const CRM_TITEL = 'Kundendaten-Erfassung und Hosting';

const CRM_PAKETE = [
  { key: 'monatlich', titel: 'Monatlich', zeile: '49 € / Monat', text: 'Flexibel, ohne Vorauszahlung.', preis: 49 },
  { key: 'jaehrlich', titel: '12 Monate im Voraus', zeile: '441 € für 12 Monate', vorher: '588 €', text: '3 Monate geschenkt: du sparst 147 €.', badge: 'Beliebt', preis: 441 },
  { key: 'langzeit', titel: '48 Monate im Voraus', zeile: '2.058 € für 48 Monate', vorher: '2.352 €', text: '6 Monate geschenkt: du sparst 294 €.', preis: 2058 },
] as const;

const SPEED_PAKETE = [
  { key: 'basis', titel: 'Speedmessung', zeile: '149 € / Monat', text: '12 Monate Laufzeit. Hardware an der Bahn kostenlos.' },
  { key: 'display', titel: 'Speedmessung + Display', zeile: '249 € / Monat im 1. Jahr, ab Jahr 2 149 €', text: 'Mit großem Display direkt an der Bahn, ohne Einmalkosten. 12 Monate Laufzeit.', badge: 'Beliebt' },
  { key: 'langzeit', titel: 'Speedmessung 48 Monate', zeile: '99 € / Monat', text: 'Günstigster Monatspreis bei langer Laufzeit, 48 Monate festgeschrieben.', badge: 'Sparpreis' },
] as const;

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
  const [alle, setAlle] = useState<EquipmentItem[]>([]);
  const [bundleAus, setBundleAus] = useState<string[]>([]);
  const [bundleSendet, setBundleSendet] = useState(false);
  const [bundleGesendet, setBundleGesendet] = useState(false);
  const [crmPaket, setCrmPaket] = useState<'monatlich' | 'jaehrlich' | 'langzeit'>('jaehrlich');
  const [speedPaket, setSpeedPaket] = useState<'basis' | 'display' | 'langzeit'>('display');
  const [shopPlan, setShopPlan] = useState<'monatlich' | 'jaehrlich' | 'revshare'>('jaehrlich');

  const preisTexte = (item?.mehrwert_text ?? '').split('·').map((t) => t.trim()).filter(Boolean);
  const basis = preisAus(preisTexte[0]);
  const monatlich = preisAus(preisTexte[1]);
  const verfuegbar = ZUSAETZE.filter((z) => !z.nur || z.nur === item?.titel);
  const zusatzSumme = verfuegbar.filter((z) => gewaehlt.includes(z.key)).reduce((sum, z) => sum + z.preis, 0);
  const einmalig = (basis ?? 0) + zusatzSumme;
  const monatlichGesamt = (monatlich ?? 0) + verfuegbar.filter((z) => gewaehlt.includes(z.key)).reduce((sum, z) => sum + (z.monatlich ?? 0), 0);
  const istShop = item?.kategorie === 'Webshop';
  const istSpeed = item?.titel === 'Speedmessung';
  const istCrm = item?.titel === CRM_TITEL;
  const istVerkauf = (item?.kategorie === 'Verkauf' || item?.kategorie === 'Zubehoer') && basis != null;

  useEffect(() => {
    if (!parkId) return;
    let aktiv = true;
    setLaden(true);
    fetchParkEquipment(parkId)
      .then((items) => {
        if (!aktiv) return;
        setAlle(items);
        setItem(items.find((i) => i.id === id) ?? null);
        setIndex(0);
      })
      .catch((e) => aktiv && setFehler(e instanceof Error ? e.message : 'Produkt konnte nicht geladen werden.'))
      .finally(() => aktiv && setLaden(false));
    return () => {
      aktiv = false;
    };
  }, [parkId, id]);


  // "Oft zusammen gekauft": dieses Produkt plus die passenden anderen.
  const partnerTitel =
    item?.titel === 'PrintBox'
      ? ['Digitale Nachkäufe und Merchandising', 'Cashbox']
      : item?.titel === 'Cashbox'
        ? ['Digitale Nachkäufe und Merchandising', 'PrintBox']
        : item?.titel === 'Digitale Nachkäufe und Merchandising'
          ? ['PrintBox', 'Cashbox']
          : item?.titel === 'Speedmessung'
            ? ['Speedmessung Display', 'Digitale Nachkäufe und Merchandising']
            : item?.titel === 'Speedmessung Display'
              ? ['Speedmessung', 'Digitale Nachkäufe und Merchandising']
              : item?.titel === CRM_TITEL
                ? ['Digitale Nachkäufe und Merchandising', 'Speedmessung']
                : [];
  const buendel = item
    ? [item, ...partnerTitel.map((t) => alle.find((a) => a.titel === t)).filter((a): a is EquipmentItem => !!a)]
    : [];
  const buendelAktiv = buendel.filter((b, i) => i === 0 || !bundleAus.includes(b.id));
  const istShopItem = (b: EquipmentItem) => b.titel === 'Digitale Nachkäufe und Merchandising';
  const hatHardware = buendelAktiv.some((b) => !istShopItem(b));
  const buendelEinmalig = buendelAktiv.reduce((sum, b) => {
    if (istShopItem(b) && hatHardware) return sum;
    return sum + preisSplit(b).einmalig;
  }, 0);
  const buendelMonatlich = buendelAktiv.reduce((sum, b) => sum + preisSplit(b).monatlich, 0);
  const buendelVorher = buendelAktiv.reduce((sum, b) => sum + preisSplit(b).einmalig, 0);

  async function buendelAnfragen() {
    if (!parkId) return;
    setBundleSendet(true);
    setFehler(null);
    try {
      const namen = buendelAktiv.map((b) => b.titel).join(' + ');
      await meldeAusstattungsInteresse(parkId, {
        label: `Kombi-Paket anfragen: ${namen}, Summe ${eur(buendelEinmalig)} einmalig + ${eur(buendelMonatlich)}/Monat${
          hatHardware && buendelAktiv.some(istShopItem) ? ` (Online-Shop-Einrichtung ${eur(SHOP_EINRICHTUNG)} entfällt im Kombi-Paket)` : ''
        }`,
      });
      setBundleGesendet(true);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anfrage fehlgeschlagen.');
    } finally {
      setBundleSendet(false);
    }
  }

  async function anfragen() {
    if (!parkId || !item) return;
    setSende(true);
    setFehler(null);
    try {
      if (istVerkauf) {
        const namen = verfuegbar.filter((z) => gewaehlt.includes(z.key)).map((z) => z.titel);
        const label = `${item.titel} anfragen${namen.length ? ` mit ${namen.join(', ')}` : ''}, Summe ${eur(einmalig)} einmalig${
          monatlichGesamt > 0 ? ` + ${eur(monatlichGesamt)}/Monat` : ''
        }${raten ? `, in ${RATEN} Raten à ${eurGenau(einmalig / RATEN)}` : ''}`;
        await meldeAusstattungsInteresse(parkId, { label });
      } else if (istCrm) {
        const paket = CRM_PAKETE.find((pk) => pk.key === crmPaket);
        await meldeAusstattungsInteresse(parkId, { label: `Kundendaten-Erfassung und Hosting freischalten: ${paket?.titel}, ${paket?.zeile}` });
      } else if (istSpeed) {
        const paket = SPEED_PAKETE.find((p) => p.key === speedPaket);
        await meldeAusstattungsInteresse(parkId, {
          label: `Speedmessung nachrüsten: ${paket?.titel}, ${paket?.zeile}, Hardware kostenlos`,
        });
      } else if (istShop) {
        const planText =
          shopPlan === 'monatlich'
            ? `Einrichtung ${eur(SHOP_EINRICHTUNG)} einmalig + ${eur(SHOP_MONATLICH)}/Monat`
            : shopPlan === 'jaehrlich'
              ? `Einrichtung ${eur(SHOP_EINRICHTUNG)} einmalig + 12 Monate im Voraus ${eur(SHOP_JAHR)} (3 Monate geschenkt)`
              : `Revenue Share ${SHOP_ANTEIL} % der Shop-Einnahmen, Einrichtung und Monatskosten 0 €`;
        await meldeAusstattungsInteresse(parkId, { label: `${item.titel}: ${planText}` });
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

  // Speedmessung: je nach gewähltem Paket kommt ein viertes Bild dazu (Display-Tafel
  // bzw. Fahrtfoto mit Geschwindigkeit).
  const bilder = [
    ...eintragBilder(item),
    ...(istSpeed ? [speedPaket === 'display' ? '/speedmessung/display.jpg' : '/speedmessung/langzeit.jpg'] : []),
  ];
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
                          {zusatz.badge && (
                            <span className="mt-1 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                              {zusatz.badge}
                            </span>
                          )}
                          <span className="mt-0.5 text-sm font-semibold text-slate-700">
                            + {eur(zusatz.preis)}
                            {zusatz.vorher != null && (
                              <span className="ml-1.5 font-normal text-slate-400 line-through">{eur(zusatz.vorher)}</span>
                            )}
                            {zusatz.monatlich != null && (
                              <span className="font-normal text-slate-500"> und {eur(zusatz.monatlich)} / Monat</span>
                            )}
                          </span>
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
                  {verfuegbar.filter((z) => gewaehlt.includes(z.key) && z.monatlich).map((z) => (
                    <div key={z.key} className="flex justify-between text-slate-600">
                      <span>Online-Shop</span>
                      <span>{eur(z.monatlich ?? 0)} / Monat</span>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {istShop && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Abo wählen</p>
                  <div className="grid gap-2.5">
                    {([
                      { key: 'monatlich', titel: 'Monatlich', zeile: `${eur(SHOP_EINRICHTUNG)} einmalig + ${eur(SHOP_MONATLICH)} / Monat`, text: 'Einrichtung einmalig, dann monatlich für Hosting, Service und Wartung.' },
                      { key: 'jaehrlich', titel: '12 Monate im Voraus', zeile: `${eur(SHOP_EINRICHTUNG)} einmalig + ${eur(SHOP_JAHR)} für 12 Monate`, vorher: eur(SHOP_MONATLICH * 12), text: '3 Monate geschenkt: du zahlst nur 9 × 99 €.', badge: 'Beliebt' },
                      { key: 'revshare', titel: 'Full-Service mit Revenue Share', zeile: `0 € Einrichtung, 0 € monatlich, ${SHOP_ANTEIL} % der Shop-Einnahmen`, text: 'Wir kümmern uns auch um Druck und Versand der Artikel. Der Rest der Einnahmen ist dein Gewinn.' },
                    ] as { key: 'monatlich' | 'jaehrlich' | 'revshare'; titel: string; zeile: string; vorher?: string; text: string; badge?: string }[]).map((plan) => (
                      <button
                        key={plan.key}
                        type="button"
                        onClick={() => setShopPlan(plan.key)}
                        aria-pressed={shopPlan === plan.key}
                        className={`rounded-xl border-2 p-3 text-left transition ${
                          shopPlan === plan.key ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">{plan.titel}</span>
                          {plan.badge && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                              {plan.badge}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold text-slate-700">
                          {plan.zeile}
                          {plan.vorher && <span className="ml-1.5 font-normal text-slate-400 line-through">{plan.vorher}</span>}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{plan.text}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}


            {istSpeed && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Paket wählen</p>
                <div className="grid gap-2.5">
                  {SPEED_PAKETE.map((paket) => (
                    <button
                      key={paket.key}
                      type="button"
                      onClick={() => {
                        setSpeedPaket(paket.key);
                        setIndex(3);
                      }}
                      aria-pressed={speedPaket === paket.key}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        speedPaket === paket.key ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{paket.titel}</span>
                        {'badge' in paket && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            {paket.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-700">{paket.zeile}</span>
                      <span className="mt-1 block text-xs text-slate-500">{paket.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}


            {istCrm && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Paket wählen</p>
                <div className="grid gap-2.5">
                  {CRM_PAKETE.map((paket) => (
                    <button
                      key={paket.key}
                      type="button"
                      onClick={() => setCrmPaket(paket.key)}
                      aria-pressed={crmPaket === paket.key}
                      className={`rounded-xl border-2 p-3 text-left transition ${
                        crmPaket === paket.key ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{paket.titel}</span>
                        {'badge' in paket && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            {paket.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-700">
                        {paket.zeile}
                        {'vorher' in paket && <span className="ml-1.5 font-normal text-slate-400 line-through">{paket.vorher}</span>}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{paket.text}</span>
                    </button>
                  ))}
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

      {buendel.length > 1 && (
        <GlassCard className="p-5 sm:p-6">
          <h3 className="text-xl font-bold text-slate-800">Oft zusammen gekauft</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            PrintBox und Cashbox funktionieren nur im Verbund mit dem Online-Shop. Im Kombi-Paket entfällt dessen
            Einrichtung.
          </p>
          <div className="mt-5 flex flex-wrap items-start gap-x-3 gap-y-6">
            {buendel.map((b, i) => {
              const aktiv = buendelAktiv.some((a) => a.id === b.id);
              const bild = b.image_url;
              const preis = preisAus((b.mehrwert_text ?? '').split('·')[0]);
              const shopImKombi = istShopItem(b) && hatHardware;
              return (
                <div key={b.id} className="flex items-start gap-3">
                  {i > 0 && <span className="mt-16 text-2xl font-light text-slate-400">+</span>}
                  <div className="w-44 sm:w-52">
                    <div className={`relative flex h-36 items-center justify-center rounded-xl bg-slate-50 p-2 sm:h-44 ${aktiv ? '' : 'opacity-50'}`}>
                      {bild ? (
                        <img src={bild} alt={b.titel} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <span className="text-xs text-slate-400">Kein Bild</span>
                      )}
                      <input
                        type="checkbox"
                        checked={aktiv}
                        disabled={i === 0}
                        onChange={() =>
                          setBundleAus((alt) => (alt.includes(b.id) ? alt.filter((x) => x !== b.id) : [...alt, b.id]))
                        }
                        aria-label={`${b.titel} im Kombi-Paket`}
                        className="absolute right-2 top-2 h-5 w-5 accent-sky-600"
                      />
                    </div>
                    <div className="mt-2 text-sm">
                      {i === 0 && <p className="font-bold text-slate-800">Dieser Artikel:</p>}
                      {i === 0 ? (
                        <p className="text-slate-700">{b.titel}</p>
                      ) : (
                        <Link to={`/configuration/produkt/${b.id}`} className="text-sky-700 hover:underline">
                          {b.titel}
                        </Link>
                      )}
                      <p className="mt-0.5 font-bold text-slate-900">
                        {preisSplit(b).einmalig > 0 || preisSplit(b).monatlich === 0
                          ? eur(shopImKombi ? 0 : preis ?? 0)
                          : `${eur(preisSplit(b).monatlich)} / Monat`}
                        {shopImKombi && preis != null && (
                          <span className="ml-1.5 font-normal text-slate-400 line-through">{eur(preis)}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {preisSplit(b).einmalig > 0 && preisSplit(b).monatlich > 0
                          ? `+ ${eur(preisSplit(b).monatlich)} pro Monat`
                          : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex min-w-[220px] flex-1 flex-col justify-center gap-3 self-center lg:pl-6">
              <p className="text-slate-700">
                Gesamtpreis: <span className="text-2xl font-bold text-slate-900">{eur(buendelEinmalig)}</span>
                {buendelVorher > buendelEinmalig && (
                  <span className="ml-2 text-sm text-slate-400 line-through">{eur(buendelVorher)}</span>
                )}
              </p>
              <p className="-mt-2 text-xs text-slate-500">
                einmalig, dazu {eur(buendelMonatlich)} pro Monat. Alle Preise zzgl. MwSt.
              </p>
              <button
                type="button"
                onClick={() => void buendelAnfragen()}
                disabled={bundleSendet || bundleGesendet}
                className="inline-flex items-center justify-center rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {bundleGesendet
                  ? 'Anfrage gesendet, wir melden uns'
                  : bundleSendet
                    ? 'Wird gesendet…'
                    : `Alle ${buendelAktiv.length} anfragen`}
              </button>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
