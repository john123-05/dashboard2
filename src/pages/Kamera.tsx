import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, RotateCcw, AlertTriangle, Info, Send } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { fetchRecentPhotos } from '../lib/photoBrowser';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;
const ASSETS_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-assets`;
const KAMERA_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-camera`;

type Kamerawerte = Record<string, Record<string, number | string>>;

type Kameradaten = {
  modell: string | null;
  seriennummer: string | null;
  videoformat: string | null;
  fps: number | null;
  quelle: string | null;
  programm: string | null;
  werte: Kamerawerte;
  fehler: string | null;
};

type Automat = {
  id: string;
  machine_id: string;
  machine_label?: string | null;
  camera_settings?: Kameradaten | null;
  can_test_photo?: boolean;
  last_seen_at?: string | null;
  offline_minutes?: number | null;
};

/**
 * Eine Kameraeigenschaft, wie sie hier bedient wird.
 *
 * `schluessel` ist genau der Name, den Kamera, Agent und Function verwenden -
 * die Grenzen stehen an allen drei Stellen und müssen übereinstimmen. Doppelt
 * gepflegt ist hier richtig: keine Seite darf sich darauf verlassen, dass eine
 * andere geprüft hat.
 *
 * `vorschau` sagt, wie sich eine Änderung am Bild zeigt. Nicht jede Eigenschaft
 * lässt sich im Browser ehrlich nachstellen - Schärfe und Rauschminderung zum
 * Beispiel nicht. Die bekommen `vorschau: null` und werden nur gesetzt, nicht
 * simuliert. Ein Regler, der etwas verspricht, was er nicht zeigt, wäre
 * schlimmer als keiner.
 */
type Eigenschaft = {
  schluessel: string;
  titel: string;
  erklaerung: string;
  art: 'zahl' | 'schalter';
  von: number;
  bis: number;
  schritt: number;
  einheit?: string;
  nachkommastellen?: number;
  /** Faktor für die Vorschau, gemessen am aktuell eingestellten Wert. */
  vorschau: ((neu: number, alt: number) => string) | null;
};

const EIGENSCHAFTEN: Eigenschaft[] = [
  {
    schluessel: 'Exposure.Auto', titel: 'Belichtung automatisch', art: 'schalter',
    von: 0, bis: 1, schritt: 1, vorschau: null,
    erklaerung: 'Die Kamera regelt die Belichtungszeit selbst nach. Ausschalten nur, wenn das Licht immer gleich ist – sonst werden Bilder bei Sonne und Wolken unterschiedlich.',
  },
  {
    schluessel: 'Exposure.Value', titel: 'Belichtungszeit', art: 'zahl',
    von: 0.0002, bis: 0.02, schritt: 0.0001, einheit: ' ms', nachkommastellen: 2,
    vorschau: (neu, alt) => `brightness(${(neu / (alt || neu)).toFixed(3)})`,
    erklaerung: 'Wie lange der Sensor Licht sammelt. Länger heißt heller, aber auch mehr Bewegungsunschärfe – bei einer Rodelbahn der entscheidende Kompromiss.',
  },
  {
    schluessel: 'Exposure.Auto Reference', titel: 'Ziel-Helligkeit', art: 'zahl',
    von: 30, bis: 200, schritt: 1, vorschau: (neu, alt) => `brightness(${(neu / (alt || neu)).toFixed(3)})`,
    erklaerung: 'Worauf die automatische Belichtung hinregelt. Höher heißt hellere Bilder. Der wirksamste Regler, solange die Automatik an ist.',
  },
  {
    schluessel: 'Gain.Auto', titel: 'Verstärkung automatisch', art: 'schalter',
    von: 0, bis: 1, schritt: 1, vorschau: null,
    erklaerung: 'Hebt das Signal an, wenn zu wenig Licht da ist. Kostet Bildrauschen.',
  },
  {
    schluessel: 'Gain.Auto Max Value', titel: 'Verstärkung höchstens', art: 'zahl',
    von: 0, bis: 96, schritt: 1, vorschau: null,
    erklaerung: 'Die Obergrenze für die Verstärkung. Niedriger heißt sauberere, aber dunklere Bilder bei schlechtem Licht.',
  },
  {
    schluessel: 'Saturation.Value', titel: 'Sättigung', art: 'zahl',
    von: 0, bis: 200, schritt: 1,
    vorschau: (neu, alt) => `saturate(${(neu / (alt || 100)).toFixed(3)})`,
    erklaerung: 'Wie kräftig die Farben sind. 100 ist neutral.',
  },
  {
    schluessel: 'Gamma.Value', titel: 'Gamma', art: 'zahl',
    von: 0.3, bis: 2.5, schritt: 0.01, nachkommastellen: 2,
    vorschau: () => 'url(#kamera-gamma)',
    erklaerung: 'Verteilt die Helligkeit ungleichmäßig: hebt Schatten an, ohne die Lichter auszubrennen. Kleiner als 1 heißt heller.',
  },
  {
    schluessel: 'Brightness.Value', titel: 'Helligkeit', art: 'zahl',
    von: -64, bis: 64, schritt: 1,
    vorschau: (neu, alt) => `brightness(${(1 + (neu - alt) / 128).toFixed(3)})`,
    erklaerung: 'Hebt oder senkt das ganze Bild gleichmäßig – ohne Einfluss auf die Schärfe.',
  },
  {
    schluessel: 'Contrast.Value', titel: 'Kontrast', art: 'zahl',
    von: -64, bis: 64, schritt: 1,
    vorschau: (neu, alt) => `contrast(${(1 + (neu - alt) / 128).toFixed(3)})`,
    erklaerung: 'Der Abstand zwischen hell und dunkel. Zu viel frisst Zeichnung in Schatten und Himmel.',
  },
  {
    schluessel: 'Hue.Value', titel: 'Farbton', art: 'zahl',
    von: -30, bis: 30, schritt: 1, einheit: '°',
    vorschau: (neu, alt) => `hue-rotate(${neu - alt}deg)`,
    erklaerung: 'Dreht alle Farben im Kreis. Zum Ausgleichen eines Farbstichs, nicht zum Gestalten.',
  },
  {
    schluessel: 'WhiteBalance.Auto', titel: 'Weißabgleich automatisch', art: 'schalter',
    von: 0, bis: 1, schritt: 1, vorschau: null,
    erklaerung: 'Gleicht die Farbe des Lichts aus, damit Weiß weiß bleibt – morgens anders als mittags.',
  },
  {
    schluessel: 'Highlight Reduction.Enable', titel: 'Spitzlichter dämpfen', art: 'schalter',
    von: 0, bis: 1, schritt: 1, vorschau: null,
    erklaerung: 'Rettet Zeichnung in ausgefressenen hellen Stellen – Himmel, Schnee, Sonnenreflexe auf dem Helm. Bei Gegenlicht der interessanteste Schalter.',
  },
  {
    schluessel: 'Tone Mapping.Enable', titel: 'Tone Mapping', art: 'schalter',
    von: 0, bis: 1, schritt: 1, vorschau: null,
    erklaerung: 'Holt Schatten und Lichter gleichzeitig zurück. Macht kontrastreiche Bilder ausgewogener, kann aber flau wirken.',
  },
  {
    schluessel: 'Sharpness.Value', titel: 'Schärfe', art: 'zahl',
    von: 0, bis: 100, schritt: 1, vorschau: null,
    erklaerung: 'Betont Kanten nach der Aufnahme. Zu viel erzeugt harte Ränder und verstärkt Rauschen. Lässt sich hier nicht vorab zeigen.',
  },
  {
    schluessel: 'Denoise.Value', titel: 'Rauschminderung', art: 'zahl',
    von: 0, bis: 100, schritt: 1, vorschau: null,
    erklaerung: 'Glättet Bildrauschen, kostet aber Feinzeichnung. Lässt sich hier nicht vorab zeigen.',
  },
];

const NAMEN: Record<string, string> = {
  Exposure: 'Belichtung', Brightness: 'Helligkeit', Contrast: 'Kontrast',
  Saturation: 'Sättigung', Hue: 'Farbton', Gamma: 'Gamma', Gain: 'Verstärkung',
  WhiteBalance: 'Weißabgleich', Sharpness: 'Schärfe', Denoise: 'Rauschminderung',
  'Tone Mapping': 'Tone Mapping', 'Highlight Reduction': 'Spitzlichter dämpfen',
  'Color Correction Matrix': 'Farbmatrix',
};

/** Wert einer Eigenschaft aus dem Herzschlag holen, `null` wenn es sie nicht gibt. */
function wertAus(werte: Kamerawerte, schluessel: string): number | null {
  const [eigenschaft, element] = schluessel.split('.');
  const roh = werte?.[eigenschaft]?.[element];
  return typeof roh === 'number' ? roh : null;
}

/** Anzeige eines Werts, in der Einheit die ein Mensch erwartet. */
function anzeige(e: Eigenschaft, wert: number): string {
  if (e.art === 'schalter') return wert ? 'an' : 'aus';
  if (e.schluessel === 'Exposure.Value') return `${(wert * 1000).toFixed(2)} ms`;
  return wert.toFixed(e.nachkommastellen ?? 0) + (e.einheit ?? '');
}

function istWert(werte: Kamerawerte, name: string): string {
  const eintrag = werte[name];
  if (!eintrag) return '—';
  const teile: string[] = [];
  const auto = eintrag['Auto'];
  const wert = eintrag['Value'];
  if (auto !== undefined) teile.push(auto ? 'automatisch' : 'von Hand');
  if (typeof wert === 'number') {
    teile.push(name === 'Exposure' ? `${(wert * 1000).toFixed(2)} ms` : String(Math.round(wert * 100) / 100));
  }
  const enable = eintrag['Enable'] ?? eintrag['Enabled'];
  if (enable !== undefined && wert === undefined) teile.push(enable ? 'an' : 'aus');
  if (eintrag['Auto Max Value'] !== undefined) teile.push(`höchstens ${eintrag['Auto Max Value']}`);
  if (eintrag['Auto Reference'] !== undefined) teile.push(`Sollwert ${eintrag['Auto Reference']}`);
  return teile.length ? teile.join(' · ') : '—';
}

export default function Kamera() {
  const { parkId } = usePark();
  const [automaten, setAutomaten] = useState<Automat[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);

  const [bild, setBild] = useState<{ url: string; wann: string; test: boolean } | null>(null);
  const [entwurf, setEntwurf] = useState<Record<string, number>>({});

  const kopfzeilen = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
  }, []);

  const automatenLaden = useCallback(async () => {
    if (!parkId) { setAutomaten([]); setLaden(false); return; }
    const h = await kopfzeilen();
    if (!h) { setFehler('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.'); setLaden(false); return; }
    try {
      const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}`, { headers: h });
      const body = await res.json().catch(() => null);
      if (!res.ok) setFehler(body?.error || `HTTP ${res.status}`);
      else {
        const alle = (body?.data?.machines || []) as Automat[];
        setAutomaten(alle);
        setGewaehlt((alt) => alt ?? alle.find((m) => m.camera_settings)?.id ?? null);
        setFehler(null);
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Automatendaten nicht erreichbar.');
    }
    setLaden(false);
  }, [parkId, kopfzeilen]);

  useEffect(() => { void automatenLaden(); }, [automatenLaden]);

  // Über `fetchRecentPhotos`, denselben Weg wie der Foto-Browser. Der erste
  // Entwurf ließ sich die Bild-URL signieren - das schlug mit HTTP 400 fehl,
  // weil der anonyme Schlüssel nicht signieren darf, und nötig war es nie:
  // der Bucket ist öffentlich. (F-046)
  const letztesBildHolen = useCallback(async () => {
    if (!parkId) return;
    try {
      const fotos = await fetchRecentPhotos(parkId, 1);
      const foto = fotos[0];
      if (!foto?.imageUrl) { setBild(null); return; }
      setBild({ url: foto.imageUrl, wann: new Date(foto.capturedAt).toLocaleString('de-AT'), test: foto.isTest });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Letztes Foto nicht erreichbar.');
      setBild(null);
    }
  }, [parkId]);

  useEffect(() => { void letztesBildHolen(); }, [letztesBildHolen]);

  const automat = automaten.find((m) => m.id === gewaehlt) ?? null;
  const kamera = automat?.camera_settings ?? null;
  const mitKamera = automaten.filter((m) => m.camera_settings);

  // Nur Eigenschaften, die diese Kamera wirklich hat. Was sie nicht kennt,
  // bekommt keinen Regler - sonst schiebt jemand an etwas, das nie ankommt.
  const bedienbar = useMemo(
    () => EIGENSCHAFTEN.filter((e) => wertAus(kamera?.werte ?? {}, e.schluessel) !== null),
    [kamera],
  );

  // Der Entwurf startet immer bei dem, was die Kamera meldet.
  useEffect(() => {
    if (!kamera) return;
    const start: Record<string, number> = {};
    for (const e of EIGENSCHAFTEN) {
      const wert = wertAus(kamera.werte, e.schluessel);
      if (wert !== null) start[e.schluessel] = wert;
    }
    setEntwurf(start);
  }, [kamera]);

  const geaendert = useMemo(
    () => bedienbar.filter((e) => {
      const alt = wertAus(kamera?.werte ?? {}, e.schluessel);
      return alt !== null && entwurf[e.schluessel] !== undefined && entwurf[e.schluessel] !== alt;
    }),
    [bedienbar, entwurf, kamera],
  );

  const gammaEntwurf = entwurf['Gamma.Value'];
  const gammaAlt = wertAus(kamera?.werte ?? {}, 'Gamma.Value');

  const filter = useMemo(() => {
    const teile: string[] = [];
    for (const e of geaendert) {
      if (!e.vorschau) continue;
      const alt = wertAus(kamera?.werte ?? {}, e.schluessel);
      if (alt === null) continue;
      teile.push(e.vorschau(entwurf[e.schluessel], alt));
    }
    return teile.join(' ');
  }, [geaendert, entwurf, kamera]);

  const belichtungAutomatisch = wertAus(kamera?.werte ?? {}, 'Exposure.Auto') === 1
    && entwurf['Exposure.Auto'] !== 0;

  async function testfoto() {
    if (!automat) return;
    if (!confirm('Der Automat nimmt jetzt ein Foto auf und schickt es durch die ganze Kette.\n\nFortfahren?')) return;
    setBeschaeftigt('testfoto'); setHinweis(null); setFehler(null);
    const h = await kopfzeilen();
    if (!h) { setFehler('Sitzung abgelaufen.'); setBeschaeftigt(null); return; }
    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: parkId, machine_config_id: automat.id, mode: 'now', target: 'testphoto' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setFehler(body?.error || `HTTP ${res.status}`);
      else setHinweis('Testfoto beauftragt. Es dauert bis zu einer Minute – dann auf „Bild neu laden“ tippen.');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setBeschaeftigt(null);
  }

  async function senden() {
    if (!automat || geaendert.length === 0) return;
    const liste = geaendert
      .map((e) => `  ${e.titel}: ${anzeige(e, wertAus(kamera!.werte, e.schluessel)!)} → ${anzeige(e, entwurf[e.schluessel])}`)
      .join('\n');
    if (!confirm(
      `Diese Werte werden an die Kamera geschrieben:\n\n${liste}\n\n`
      + 'Die Kamerasoftware wird danach neu gestartet – währenddessen entstehen '
      + 'für einige Sekunden keine Fotos.\n\n'
      + 'Der Automat legt vorher eine Sicherung der alten Werte an.\n\nFortfahren?'
    )) return;

    setBeschaeftigt('senden'); setHinweis(null); setFehler(null);
    const h = await kopfzeilen();
    if (!h) { setFehler('Sitzung abgelaufen.'); setBeschaeftigt(null); return; }

    const werte: Record<string, number> = {};
    for (const e of geaendert) werte[e.schluessel] = entwurf[e.schluessel];

    try {
      const res = await fetch(KAMERA_URL, {
        method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: parkId, machine_config_id: automat.id, werte, neustart: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const abgelehnt = body?.data?.abgelehnt;
        setFehler(
          abgelehnt
            ? `Abgelehnt: ${Object.entries(abgelehnt).map(([k, g]) => `${k} (${g})`).join(', ')}`
            : body?.error || `HTTP ${res.status}`,
        );
      } else {
        setHinweis(
          'Auftrag abgelegt. Der Automat holt ihn sich binnen zwei Minuten, schreibt '
          + 'die Werte und startet die Kamera neu. Das Ergebnis steht danach im Verlauf '
          + 'unter Systemzustand – auch wenn etwas abgelehnt wurde.',
        );
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setBeschaeftigt(null);
  }

  if (laden) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-500" /></div>;
  }

  if (!mitKamera.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Kamera</h1>
          <p className="mt-1 text-sm text-slate-500">Einstellungen und Bildkontrolle</p>
        </div>
        <GlassCard className="p-6">
          <p className="text-sm leading-relaxed text-slate-600">
            Für diesen Park meldet kein Automat eine Kamerasoftware. Die Seite erscheint
            von selbst, sobald einer es tut.
          </p>
          {fehler && <p className="mt-3 text-sm text-rose-700">{fehler}</p>}
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gamma braucht einen echten Filter - CSS hat dafür nichts. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <filter id="kamera-gamma">
          {(['R', 'G', 'B'] as const).map((k) => {
            const Fn = `feFunc${k}` as 'feFuncR';
            return <Fn key={k} type="gamma" exponent={(gammaAlt ?? 1) / (gammaEntwurf || gammaAlt || 1)} />;
          })}
        </filter>
      </svg>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Kamera</h1>
          <p className="mt-1 text-sm text-slate-500">
            {kamera?.modell ?? 'Kamera'}
            {kamera?.seriennummer && <> · Nr. {kamera.seriennummer}</>}
            {kamera?.videoformat && <> · {kamera.videoformat}</>}
            {kamera?.fps && <> · {kamera.fps} Bilder/s</>}
          </p>
        </div>
        {mitKamera.length > 1 && (
          <select
            value={gewaehlt ?? ''}
            onChange={(e) => setGewaehlt(e.target.value)}
            className="rounded-xl border border-white/50 bg-white/70 px-3 py-2 text-sm text-slate-700"
          >
            {mitKamera.map((m) => <option key={m.id} value={m.id}>{m.machine_label || m.machine_id}</option>)}
          </select>
        )}
      </div>

      {fehler && <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 p-4 text-sm text-rose-800">{fehler}</div>}
      {hinweis && <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm leading-relaxed text-emerald-800">{hinweis}</div>}
      {kamera?.fehler && (
        <div className="flex gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-amber-900">Die Einstellungen konnten nicht gelesen werden: {kamera.fehler}</p>
        </div>
      )}

      <div className="flex gap-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
        <p className="text-sm leading-relaxed text-sky-900">
          Die Regler stehen auf dem, was die Kamera <span className="font-semibold">jetzt</span> eingestellt hat.
          Verschieben verändert zunächst nur die <span className="font-semibold">Vorschau</span> am Foto darunter.
          Erst „An Kamera senden“ schreibt sie wirklich – mit Sicherung und anschließendem Neustart der Kamerasoftware.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <GlassCard className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Letztes Foto</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {bild ? `aufgenommen ${bild.wann}${bild.test ? ' · Testfoto' : ''}` : 'noch keins vorhanden'}
                  {geaendert.length > 0 && <> · <span className="text-sky-700">Vorschau aktiv</span></>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void letztesBildHolen()}
                  className="rounded-xl bg-white/60 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/80">
                  Bild neu laden
                </button>
                {automat?.can_test_photo && (
                  <button type="button" onClick={() => void testfoto()} disabled={beschaeftigt !== null}
                    className="rounded-xl bg-white/60 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/80 disabled:opacity-50">
                    {beschaeftigt === 'testfoto' ? 'wird ausgelöst…' : 'Testfoto auslösen'}
                  </button>
                )}
              </div>
            </div>

            {bild ? (
              <div className="overflow-hidden rounded-xl bg-slate-900/5">
                <img src={bild.url} alt="Letztes Foto der Kamera" style={{ filter: filter || undefined }} className="w-full" />
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-white/30 p-6 text-center text-sm text-slate-500">
                Für diesen Park liegt noch kein Foto vor.
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Kein Livebild: die Kamera hängt am Automaten, nicht am Internet. Einen Videostrom
              dauerhaft zu übertragen wäre teuer und träge – das letzte echte Foto beantwortet
              dieselbe Frage. Die Vorschau ist eine Annäherung am fertigen Bild, keine
              Aufnahme mit den neuen Werten.
            </p>
          </GlassCard>

          {geaendert.length > 0 && (
            <GlassCard className="p-5 sm:p-6">
              <h2 className="mb-3 text-base font-semibold text-slate-800">
                {geaendert.length} {geaendert.length === 1 ? 'Änderung' : 'Änderungen'} bereit
              </h2>
              <dl className="mb-4 space-y-1.5">
                {geaendert.map((e) => (
                  <div key={e.schluessel} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-slate-600">{e.titel}</dt>
                    <dd className="font-mono text-xs tabular-nums text-slate-700">
                      <span className="text-slate-400">{anzeige(e, wertAus(kamera!.werte, e.schluessel)!)}</span>
                      {' → '}
                      <span className="font-semibold">{anzeige(e, entwurf[e.schluessel])}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void senden()} disabled={beschaeftigt !== null}
                  className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
                  <Send className="h-4 w-4" />
                  {beschaeftigt === 'senden' ? 'wird gesendet…' : 'An Kamera senden'}
                </button>
                <button type="button" onClick={() => {
                  const start: Record<string, number> = {};
                  for (const e of EIGENSCHAFTEN) {
                    const w = wertAus(kamera?.werte ?? {}, e.schluessel);
                    if (w !== null) start[e.schluessel] = w;
                  }
                  setEntwurf(start);
                }}
                  className="flex items-center gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white/80">
                  <RotateCcw className="h-4 w-4" /> Verwerfen
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Der Automat legt vor dem Schreiben eine Sicherung der alten Datei an und nennt
                ihren Pfad im Verlauf. Geht etwas schief, ist der Weg zurück damit dokumentiert.
              </p>
            </GlassCard>
          )}
        </div>

        <div className="space-y-6">
          <GlassCard className="p-5 sm:p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-800">Einstellungen</h2>

            {belichtungAutomatisch && (
              <p className="mb-4 rounded-xl bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                Die Belichtung steht auf <span className="font-medium">automatisch</span>. Die
                Belichtungszeit von Hand zu setzen bleibt dann wirkungslos – wirksam ist die
                <span className="font-medium"> Ziel-Helligkeit</span>. Oder die Automatik ausschalten.
              </p>
            )}

            <div className="space-y-5">
              {bedienbar.map((e) => {
                const alt = wertAus(kamera!.werte, e.schluessel)!;
                const jetzt = entwurf[e.schluessel] ?? alt;
                const anders = jetzt !== alt;
                return (
                  <div key={e.schluessel}>
                    <div className="flex items-baseline justify-between gap-3">
                      <label htmlFor={`e-${e.schluessel}`} className="text-sm font-medium text-slate-700">
                        {e.titel}
                        {!e.vorschau && <span className="ml-1.5 text-xs font-normal text-slate-400">(nicht vorschaubar)</span>}
                      </label>
                      <span className={`font-mono text-xs tabular-nums ${anders ? 'font-semibold text-sky-700' : 'text-slate-500'}`}>
                        {anzeige(e, jetzt)}
                      </span>
                    </div>

                    {e.art === 'schalter' ? (
                      <div className="mt-2 flex gap-2">
                        {[1, 0].map((v) => (
                          <button key={v} type="button"
                            onClick={() => setEntwurf((a) => ({ ...a, [e.schluessel]: v }))}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                              jetzt === v ? 'bg-slate-800 text-white' : 'bg-white/60 text-slate-600 hover:bg-white/80'
                            }`}>
                            {v ? 'an' : 'aus'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input id={`e-${e.schluessel}`} type="range"
                        min={e.von} max={e.bis} step={e.schritt} value={jetzt}
                        onChange={(ev) => setEntwurf((a) => ({ ...a, [e.schluessel]: Number(ev.target.value) }))}
                        className="mt-2 w-full accent-slate-800" />
                    )}
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{e.erklaerung}</p>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-800">Ist-Werte der Kamera</h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Gelesen aus <code className="rounded bg-white/60 px-1 text-[11px]">{kamera?.quelle ?? '—'}</code>
              {kamera?.programm && <>, gesteuert von {kamera.programm}</>}.
            </p>
            <dl className="space-y-2">
              {Object.keys(kamera?.werte ?? {}).sort().map((name) => (
                <div key={name} className="flex items-baseline justify-between gap-3 border-b border-white/40 pb-2 last:border-0">
                  <dt className="text-sm text-slate-600">{NAMEN[name] ?? name}</dt>
                  <dd className="text-right font-mono text-xs tabular-nums text-slate-700">{istWert(kamera?.werte ?? {}, name)}</dd>
                </div>
              ))}
            </dl>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <div className="flex gap-3">
              <Camera className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
              <p className="text-xs leading-relaxed text-slate-500">
                Nicht alles, was die Kamera kann, steht hier. Auslöser, Blitzausgang und
                Netzwerkeinstellungen bleiben bewusst außen vor – sie gehören zur Verkabelung
                der Anlage, nicht zur Bildgestaltung, und ein Fehlgriff dort legt die Kamera lahm.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
