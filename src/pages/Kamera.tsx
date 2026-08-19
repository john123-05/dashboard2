import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, RotateCcw, AlertTriangle, Info } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { fetchRecentPhotos } from '../lib/photoBrowser';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;
const ASSETS_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-assets`;

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
  session_zero?: boolean;
  last_seen_at?: string | null;
};

/**
 * Ein Regler auf dieser Seite.
 *
 * `css` sagt, wie sich der Wert in der Vorschau auswirkt. Nicht jede
 * Kameraeigenschaft laesst sich im Browser nachstellen - Schaerfe und
 * Rauschminderung zum Beispiel nicht. Solche Werte bekommen `css: null` und
 * werden nur angezeigt, nicht simuliert. Das ehrlich zu trennen ist der
 * ganze Punkt: ein Regler, der etwas verspricht, was er nicht zeigt, ist
 * schlimmer als gar keiner.
 */
type Regler = {
  name: string;          // wie es in der Kamera heisst
  titel: string;         // wie es hier heisst
  erklaerung: string;
  von: number;
  bis: number;
  schritt: number;
  neutral: number;       // Wert, bei dem die Vorschau unveraendert ist
  einheit?: string;
  css: 'brightness' | 'contrast' | 'saturate' | 'hue-rotate' | 'gamma' | null;
};

const REGLER: Regler[] = [
  {
    name: 'Belichtung', titel: 'Belichtung', css: 'brightness',
    erklaerung: 'Wie lange der Sensor Licht sammelt. Länger heißt heller, aber auch mehr Bewegungsunschärfe – bei einer Sommerrodelbahn der entscheidende Kompromiss.',
    von: 0.3, bis: 2.5, schritt: 0.05, neutral: 1, einheit: '×',
  },
  {
    name: 'Helligkeit', titel: 'Helligkeit', css: 'brightness',
    erklaerung: 'Hebt oder senkt das ganze Bild gleichmäßig – anders als die Belichtung ohne Einfluss auf die Schärfe.',
    von: 0.4, bis: 1.8, schritt: 0.05, neutral: 1, einheit: '×',
  },
  {
    name: 'Kontrast', titel: 'Kontrast', css: 'contrast',
    erklaerung: 'Der Abstand zwischen hell und dunkel. Zu viel davon frisst Zeichnung in Schatten und Himmel.',
    von: 0.4, bis: 2, schritt: 0.05, neutral: 1, einheit: '×',
  },
  {
    name: 'Sättigung', titel: 'Sättigung', css: 'saturate',
    erklaerung: 'Wie kräftig die Farben sind. Ihr steht auf 120 – jemand hat sie bewusst angehoben.',
    von: 0, bis: 2.5, schritt: 0.05, neutral: 1, einheit: '×',
  },
  {
    name: 'Farbton', titel: 'Farbton', css: 'hue-rotate',
    erklaerung: 'Dreht alle Farben im Kreis. Zum Ausgleichen eines Farbstichs, nicht zum Gestalten.',
    von: -30, bis: 30, schritt: 1, neutral: 0, einheit: '°',
  },
  {
    name: 'Gamma', titel: 'Gamma', css: 'gamma',
    erklaerung: 'Verteilt die Helligkeit ungleichmäßig: hebt Schatten an, ohne die Lichter auszubrennen. Steht bei euch auf 0,81.',
    von: 0.3, bis: 2.5, schritt: 0.05, neutral: 1,
  },
];

// Kameraname -> Regler. Die Kamera nennt sie englisch.
const NAMEN: Record<string, string> = {
  Exposure: 'Belichtung',
  Brightness: 'Helligkeit',
  Contrast: 'Kontrast',
  Saturation: 'Sättigung',
  Hue: 'Farbton',
  Gamma: 'Gamma',
  Gain: 'Verstärkung',
  WhiteBalance: 'Weißabgleich',
  Sharpness: 'Schärfe',
  Denoise: 'Rauschminderung',
  'Tone Mapping': 'Tone Mapping',
  'Highlight Reduction': 'Spitzlichter dämpfen',
  'Color Correction Matrix': 'Farbmatrix',
};

function istWert(werte: Kamerawerte, name: string): string {
  const eintrag = werte[name];
  if (!eintrag) return '—';

  const auto = eintrag['Auto'];
  const wert = eintrag['Value'];
  const teile: string[] = [];

  if (auto !== undefined) teile.push(auto ? 'automatisch' : 'von Hand');
  if (wert !== undefined && typeof wert === 'number') {
    if (name === 'Exposure') teile.push(`${(wert * 1000).toFixed(2)} ms`);
    else teile.push(String(Math.round(wert * 100) / 100));
  }
  const enable = eintrag['Enable'] ?? eintrag['Enabled'];
  if (enable !== undefined && wert === undefined) teile.push(enable ? 'an' : 'aus');
  const max = eintrag['Auto Max Value'];
  if (max !== undefined) teile.push(`höchstens ${max}`);
  const ref = eintrag['Auto Reference'];
  if (ref !== undefined) teile.push(`Sollwert ${ref}`);

  return teile.length ? teile.join(' · ') : '—';
}

export default function Kamera() {
  const { parkId } = usePark();
  const [automaten, setAutomaten] = useState<Automat[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  const [bild, setBild] = useState<{ url: string; wann: string; test: boolean } | null>(null);
  const [werte, setWerte] = useState<Record<string, number>>(() =>
    Object.fromEntries(REGLER.map((r) => [r.name, r.neutral])),
  );

  const kopfzeilen = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
    };
  }, []);

  const laden_ = useCallback(async () => {
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

  useEffect(() => { void laden_(); }, [laden_]);

  // Das zuletzt entstandene Foto holen. Ein Livebild gibt es nicht - die
  // Kamera hängt am Automaten, nicht am Internet, und einen Videostrom quer
  // durch Österreich zu schicken wäre teuer und langsam. Das letzte echte Foto
  // beantwortet die eigentliche Frage aber genauso gut: Wie sieht es aus?
  //
  // Über `fetchRecentPhotos`, also denselben Weg wie der Foto-Browser. Der
  // erste Entwurf baute sich eine eigene Abfrage und liess sich die Bild-URL
  // signieren - das schlug mit HTTP 400 fehl, weil der anonyme Schlüssel nicht
  // signieren darf. Der Bucket ist öffentlich, eine Signatur war also nie
  // nötig. Ein Weg, den es schon gibt, ist einem neuen vorzuziehen. (F-046)
  const letztesBildHolen = useCallback(async () => {
    if (!parkId) return;
    try {
      const fotos = await fetchRecentPhotos(parkId, 1);
      const foto = fotos[0];
      if (!foto?.imageUrl) { setBild(null); return; }
      setBild({
        url: foto.imageUrl,
        wann: new Date(foto.capturedAt).toLocaleString('de-AT'),
        test: foto.isTest,
      });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Letztes Foto nicht erreichbar.');
      setBild(null);
    }
  }, [parkId]);

  useEffect(() => { void letztesBildHolen(); }, [letztesBildHolen]);

  const automat = automaten.find((m) => m.id === gewaehlt) ?? null;
  const kamera = automat?.camera_settings ?? null;
  const mitKamera = automaten.filter((m) => m.camera_settings);

  async function testfoto() {
    if (!automat) return;
    if (!confirm('Der Automat nimmt jetzt ein Foto auf und schickt es durch die ganze Kette.\n\nFortfahren?')) return;
    setBeschaeftigt(true);
    setHinweis(null);
    const h = await kopfzeilen();
    if (!h) { setFehler('Sitzung abgelaufen.'); setBeschaeftigt(false); return; }
    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          park_id: parkId, machine_config_id: automat.id, mode: 'now', target: 'testphoto',
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setFehler(body?.error || `HTTP ${res.status}`);
      else setHinweis('Testfoto beauftragt. Es dauert bis zu einer Minute, bis es hier erscheint – dann auf „Bild neu laden“ tippen.');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setBeschaeftigt(false);
  }

  // Die Vorschau. CSS kann Helligkeit, Kontrast, Sättigung und Farbton direkt;
  // Gamma nicht - dafür liegt weiter unten ein SVG-Filter im Dokument.
  const filter = useMemo(() => {
    const teile: string[] = [];
    const b = (werte['Belichtung'] ?? 1) * (werte['Helligkeit'] ?? 1);
    if (Math.abs(b - 1) > 0.001) teile.push(`brightness(${b.toFixed(3)})`);
    if (Math.abs((werte['Kontrast'] ?? 1) - 1) > 0.001) teile.push(`contrast(${werte['Kontrast']})`);
    if (Math.abs((werte['Sättigung'] ?? 1) - 1) > 0.001) teile.push(`saturate(${werte['Sättigung']})`);
    if (Math.abs(werte['Farbton'] ?? 0) > 0.001) teile.push(`hue-rotate(${werte['Farbton']}deg)`);
    if (Math.abs((werte['Gamma'] ?? 1) - 1) > 0.001) teile.push('url(#kamera-gamma)');
    return teile.join(' ');
  }, [werte]);

  const veraendert = REGLER.some((r) => Math.abs((werte[r.name] ?? r.neutral) - r.neutral) > 0.001);

  if (laden) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
      </div>
    );
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
            von selbst, sobald einer es tut – dafür muss dort <code className="rounded bg-white/60 px-1">CAMERA_EXE</code> eingerichtet
            sein und die Automaten-Software mindestens Version 0.2.2 haben.
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
          <feComponentTransfer>
            <feFuncR type="gamma" exponent={1 / (werte['Gamma'] ?? 1)} />
            <feFuncG type="gamma" exponent={1 / (werte['Gamma'] ?? 1)} />
            <feFuncB type="gamma" exponent={1 / (werte['Gamma'] ?? 1)} />
          </feComponentTransfer>
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
            {mitKamera.map((m) => (
              <option key={m.id} value={m.id}>{m.machine_label || m.machine_id}</option>
            ))}
          </select>
        )}
      </div>

      {fehler && (
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 p-4 text-sm text-rose-800">{fehler}</div>
      )}
      {hinweis && (
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-800">{hinweis}</div>
      )}
      {kamera?.fehler && (
        <div className="flex gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-amber-900">
            Die Einstellungen konnten nicht gelesen werden: {kamera.fehler}
          </p>
        </div>
      )}

      {/* Die wichtigste Aussage der Seite. Steht oben, weil sie sonst jemand
          übersieht und glaubt, er habe die Kamera verstellt. */}
      <div className="flex gap-3 rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
        <p className="text-sm leading-relaxed text-sky-900">
          <span className="font-semibold">Die Regler verändern die Kamera nicht.</span> Sie zeigen
          an einem echten Foto, wie eine Änderung aussähe – zum Ausprobieren, bevor jemand
          am Automaten etwas verstellt. Was die Kamera wirklich eingestellt hat, steht
          rechts unter „Ist-Werte“.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Letztes Foto</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {bild ? `aufgenommen ${bild.wann}${bild.test ? ' · Testfoto' : ''}` : 'noch keins vorhanden'}
                {veraendert && <> · <span className="text-sky-700">Vorschau aktiv</span></>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void letztesBildHolen()}
                className="rounded-xl bg-white/60 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/80"
              >
                Bild neu laden
              </button>
              {automat?.can_test_photo && (
                <button
                  type="button"
                  onClick={() => void testfoto()}
                  disabled={beschaeftigt}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {beschaeftigt ? 'wird ausgelöst…' : 'Testfoto auslösen'}
                </button>
              )}
            </div>
          </div>

          {bild ? (
            <div className="overflow-hidden rounded-xl bg-slate-900/5">
              <img
                src={bild.url}
                alt="Letztes Foto der Kamera"
                style={{ filter: filter || undefined }}
                className="w-full"
              />
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-white/30 p-6 text-center text-sm text-slate-500">
              Für diesen Park liegt noch kein Foto vor.
              {automat?.can_test_photo && <> Löse eins über „Testfoto auslösen“ aus.</>}
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Ein Livebild gibt es bewusst nicht: die Kamera hängt am Automaten, nicht am
            Internet, und einen Videostrom dauerhaft zu übertragen wäre teuer und träge.
            Das letzte echte Foto beantwortet dieselbe Frage.
          </p>
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-800">Vorschau-Regler</h2>
              {veraendert && (
                <button
                  type="button"
                  onClick={() => setWerte(Object.fromEntries(REGLER.map((r) => [r.name, r.neutral])))}
                  className="flex items-center gap-1.5 rounded-xl bg-white/60 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white/80"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> zurücksetzen
                </button>
              )}
            </div>

            <div className="space-y-5">
              {REGLER.map((r) => (
                <div key={r.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor={`regler-${r.name}`} className="text-sm font-medium text-slate-700">
                      {r.titel}
                    </label>
                    <span className="font-mono text-xs tabular-nums text-slate-500">
                      {(werte[r.name] ?? r.neutral).toFixed(r.schritt < 1 ? 2 : 0)}{r.einheit ?? ''}
                    </span>
                  </div>
                  <input
                    id={`regler-${r.name}`}
                    type="range"
                    min={r.von}
                    max={r.bis}
                    step={r.schritt}
                    value={werte[r.name] ?? r.neutral}
                    onChange={(e) => setWerte((alt) => ({ ...alt, [r.name]: Number(e.target.value) }))}
                    className="mt-2 w-full accent-slate-800"
                  />
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{r.erklaerung}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-5 sm:p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-800">Ist-Werte der Kamera</h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              Gelesen aus{' '}
              <code className="rounded bg-white/60 px-1 text-[11px]">{kamera?.quelle ?? '—'}</code>
              {kamera?.programm && <>, gesteuert von {kamera.programm}</>}.
            </p>
            <dl className="space-y-2">
              {Object.keys(kamera?.werte ?? {}).sort().map((name) => (
                <div key={name} className="flex items-baseline justify-between gap-3 border-b border-white/40 pb-2 last:border-0">
                  <dt className="text-sm text-slate-600">{NAMEN[name] ?? name}</dt>
                  <dd className="text-right font-mono text-xs tabular-nums text-slate-700">
                    {istWert(kamera?.werte ?? {}, name)}
                  </dd>
                </div>
              ))}
            </dl>
            {!Object.keys(kamera?.werte ?? {}).length && (
              <p className="text-sm text-slate-500">Keine Werte gemeldet.</p>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="flex gap-3">
          <Camera className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div className="text-sm leading-relaxed text-slate-600">
            <p className="font-medium text-slate-700">Was als Nächstes käme</p>
            <p className="mt-1">
              Diese Werte an die Kamera zu <em>senden</em> ist der nächste Schritt und
              bewusst noch nicht gebaut. Vorher müssen eine Sicherung vor jeder Änderung,
              ein Rückweg mit einem Klick und feste Grenzen stehen – eine falsch gesetzte
              Belichtung macht sonst einen ganzen Betriebstag unbrauchbar, und das fällt
              niemandem sofort auf.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
