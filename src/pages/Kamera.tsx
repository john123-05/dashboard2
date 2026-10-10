import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Aperture, AlertTriangle, Camera, ChevronDown, Contrast, Info, Loader2, Minus, Palette, Plus, RefreshCw, RotateCcw, Send, Sun,
  type LucideIcon,
} from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import Modal from '../components/ui/Modal';
import { usePark } from '../contexts/ParkContext';
import { useI18n, useLocaleTag } from '../lib/i18n';
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

/**
 * Die Regler in vier Gruppen, so wie man über ein Bild nachdenkt. Eine Eigenschaft,
 * die in keiner Gruppe steht, landet in der letzten – es geht nie ein Regler verloren.
 */
const GRUPPEN: { id: string; icon: LucideIcon; schluessel: string[] }[] = [
  { id: 'exposure', icon: Sun, schluessel: ['Exposure.Auto', 'Exposure.Value', 'Exposure.Auto Reference', 'Gain.Auto', 'Gain.Auto Max Value'] },
  { id: 'color', icon: Palette, schluessel: ['WhiteBalance.Auto', 'Saturation.Value', 'Hue.Value'] },
  { id: 'contrast', icon: Contrast, schluessel: ['Brightness.Value', 'Contrast.Value', 'Gamma.Value', 'Highlight Reduction.Enable', 'Tone Mapping.Enable'] },
  { id: 'sharp', icon: Aperture, schluessel: ['Sharpness.Value', 'Denoise.Value'] },
];

// Ab wann der Automat als nicht verbunden gilt (wie in lib/cameraControl.ts).
const MAX_OFFLINE_MINUTEN = 15;

/** Schlüssel einer Eigenschaft im Wörterbuch, zum Beispiel `camera.prop.exposure_auto.title`. */
function propKey(e: Eigenschaft, part: 'title' | 'text'): string {
  return `camera.prop.${e.schluessel.toLowerCase().replace(/[^a-z]+/g, '_')}.${part}`;
}

function nameLabel(name: string, t: (key: string) => string): string {
  const key = `camera.name.${name.toLowerCase().replace(/[^a-z]+/g, '_')}`;
  const label = t(key);
  return label === key ? name : label;
}


/** Wert einer Eigenschaft aus dem Herzschlag holen, `null` wenn es sie nicht gibt. */
function wertAus(werte: Kamerawerte, schluessel: string): number | null {
  const [eigenschaft, element] = schluessel.split('.');
  const roh = werte?.[eigenschaft]?.[element];
  return typeof roh === 'number' ? roh : null;
}

/** Anzeige eines Werts, in der Einheit die ein Mensch erwartet. */
function anzeige(e: Eigenschaft, wert: number, t: (key: string) => string): string {
  if (e.art === 'schalter') return wert ? t('camera.on') : t('camera.off');
  if (e.schluessel === 'Exposure.Value') return `${(wert * 1000).toFixed(2)} ms`;
  return wert.toFixed(e.nachkommastellen ?? 0) + (e.einheit ?? '');
}

function istWert(werte: Kamerawerte, name: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const eintrag = werte[name];
  if (!eintrag) return '—';
  const teile: string[] = [];
  const auto = eintrag['Auto'];
  const wert = eintrag['Value'];
  if (auto !== undefined) teile.push(auto ? t('camera.auto') : t('camera.manual'));
  if (typeof wert === 'number') {
    teile.push(name === 'Exposure' ? `${(wert * 1000).toFixed(2)} ms` : String(Math.round(wert * 100) / 100));
  }
  const enable = eintrag['Enable'] ?? eintrag['Enabled'];
  if (enable !== undefined && wert === undefined) teile.push(enable ? t('camera.on') : t('camera.off'));
  if (eintrag['Auto Max Value'] !== undefined) teile.push(t('camera.at_most', { value: eintrag['Auto Max Value'] }));
  if (eintrag['Auto Reference'] !== undefined) teile.push(t('camera.target_value', { value: eintrag['Auto Reference'] }));
  return teile.length ? teile.join(' · ') : '—';
}

export default function Kamera() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const [automaten, setAutomaten] = useState<Automat[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);

  const [bild, setBild] = useState<{ url: string; wann: string; test: boolean } | null>(null);
  const [verlauf, setVerlauf] = useState<{ url: string; wann: string }[]>([]);
  const [entwurf, setEntwurf] = useState<Record<string, number>>({});
  // Auf schmalen Bildschirmen startet nur die erste Gruppe offen, sonst wird die Seite endlos.
  const [offen, setOffen] = useState<Record<string, boolean>>(() => {
    const breit = typeof window === 'undefined' || window.innerWidth >= 1280;
    return { exposure: true, color: breit, contrast: breit, sharp: breit };
  });
  const [erklaert, setErklaert] = useState<Record<string, boolean>>({});
  const [original, setOriginal] = useState(false);
  const [dialog, setDialog] = useState<'senden' | 'testfoto' | null>(null);
  const [technikOffen, setTechnikOffen] = useState(false);

  const kopfzeilen = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
  }, []);

  const automatenLaden = useCallback(async () => {
    if (!parkId) { setAutomaten([]); setLaden(false); return; }
    const h = await kopfzeilen();
    if (!h) { setFehler(t('camera.session_expired_relogin')); setLaden(false); return; }
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
      setFehler(e instanceof Error ? e.message : t('camera.machines_unreachable'));
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
      const fotos = await fetchRecentPhotos(parkId, 60);
      // Verlauf der letzten Testfotos (neueste zuerst), damit man Einstellungen vor/nach vergleichen kann.
      setVerlauf(
        fotos
          .filter((f) => f.isTest && f.imageUrl)
          .slice(0, 8)
          .map((f) => ({ url: f.imageUrl as string, wann: new Date(f.capturedAt).toLocaleString(locale) })),
      );
      const foto = fotos[0];
      if (!foto?.imageUrl) { setBild(null); return; }
      setBild({ url: foto.imageUrl, wann: new Date(foto.capturedAt).toLocaleString(locale), test: foto.isTest });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t('camera.last_photo_unreachable'));
      setBild(null);
    }
  }, [parkId, locale]);

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
    setDialog(null);
    setBeschaeftigt('testfoto'); setHinweis(null); setFehler(null);
    const h = await kopfzeilen();
    if (!h) { setFehler(t('camera.session_expired')); setBeschaeftigt(null); return; }
    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: parkId, machine_config_id: automat.id, mode: 'now', target: 'testphoto' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setFehler(body?.error || `HTTP ${res.status}`);
      else setHinweis(t('camera.test_photo_ordered'));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t('camera.job_failed'));
    }
    setBeschaeftigt(null);
  }

  async function senden() {
    if (!automat || geaendert.length === 0) return;
    setDialog(null);
    setBeschaeftigt('senden'); setHinweis(null); setFehler(null);
    const h = await kopfzeilen();
    if (!h) { setFehler(t('camera.session_expired')); setBeschaeftigt(null); return; }

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
            ? t('camera.rejected', { list: Object.entries(abgelehnt).map(([k, g]) => `${k} (${g})`).join(', ') })
            : body?.error || `HTTP ${res.status}`,
        );
      } else {
        setHinweis(t('camera.job_stored'));
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t('camera.job_failed'));
    }
    setBeschaeftigt(null);
  }

  function verwerfen() {
    const start: Record<string, number> = {};
    for (const e of EIGENSCHAFTEN) {
      const w = wertAus(kamera?.werte ?? {}, e.schluessel);
      if (w !== null) start[e.schluessel] = w;
    }
    setEntwurf(start);
    setOriginal(false);
  }

  if (laden) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand-500" /></div>;
  }

  if (!mitKamera.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('camera.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('camera.subtitle')}</p>
        </div>
        <GlassCard className="p-6">
          <p className="text-sm leading-relaxed text-slate-600">
            {t('camera.none_reporting')}
          </p>
          {fehler && <p className="mt-3 text-sm text-rose-700">{fehler}</p>}
        </GlassCard>
      </div>
    );
  }

  const verbunden = automat?.offline_minutes == null || automat.offline_minutes <= MAX_OFFLINE_MINUTEN;
  const zugeordnet = new Set(GRUPPEN.flatMap((g) => g.schluessel));
  const gruppen = GRUPPEN.map((g, i) => ({
    ...g,
    regler: bedienbar.filter((e) => g.schluessel.includes(e.schluessel) || (i === GRUPPEN.length - 1 && !zugeordnet.has(e.schluessel))),
  })).filter((g) => g.regler.length > 0);
  const istGeaendert = (e: Eigenschaft) => geaendert.includes(e);
  const setze = (e: Eigenschaft, wert: number) => {
    const begrenzt = Math.min(e.bis, Math.max(e.von, Number(wert.toFixed(6))));
    setEntwurf((a) => ({ ...a, [e.schluessel]: begrenzt }));
    setOriginal(false);
  };
  const aenderungsliste = (
    <dl className="divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]">
      {geaendert.map((e) => (
        <div key={e.schluessel} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
          <dt className="text-[color:var(--ink-2)]">{t(propKey(e, 'title'))}</dt>
          <dd className="font-mono text-xs tabular-nums text-[color:var(--ink)]">
            <span className="text-[color:var(--ink-3)]">{anzeige(e, wertAus(kamera!.werte, e.schluessel)!, t)}</span>
            {' → '}
            <span className="font-semibold">{anzeige(e, entwurf[e.schluessel], t)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );

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

      {/* Kopf: Kamera, Status, Automat */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('camera.title')}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                verbunden ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${verbunden ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {verbunden ? t('cam2.online') : t('cam2.offline', { minutes: Math.round(automat?.offline_minutes ?? 0) })}
            </span>
          </div>
          <p className="mt-1 text-sm text-[color:var(--ink-3)]">
            {kamera?.modell ?? t('camera.subtitle')}
            {kamera?.seriennummer && <> · {t('camera.serial_no', { no: kamera.seriennummer })}</>}
            {kamera?.videoformat && <> · {kamera.videoformat}</>}
            {kamera?.fps && <> · {t('camera.fps', { fps: kamera.fps })}</>}
          </p>
        </div>
        {mitKamera.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-[color:var(--ink-3)]">
            {t('cam2.machine')}
            <select
              value={gewaehlt ?? ''}
              onChange={(e) => setGewaehlt(e.target.value)}
              className="rounded-lg border border-[color:var(--line-strong)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
            >
              {mitKamera.map((m) => <option key={m.id} value={m.id}>{m.machine_label || m.machine_id}</option>)}
            </select>
          </label>
        )}
      </div>

      {fehler && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{fehler}</div>}
      {hinweis && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-800">{hinweis}</div>}
      {kamera?.fehler && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p className="text-sm leading-relaxed text-amber-900">{t('camera.cannot_read', { error: kamera.fehler })}</p>
        </div>
      )}

      {/* In drei Schritten */}
      <ol className="grid gap-px overflow-hidden rounded-lg border border-[color:var(--line)] bg-[color:var(--line)] sm:grid-cols-3" aria-label={t('cam2.how_title')}>
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex gap-3 bg-white p-4">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ink)] text-xs font-semibold text-white">{n}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--ink)]">{t(`cam2.step${n}_title`)}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--ink-3)]">{t(`cam2.step${n}_text`)}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Bild */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <GlassCard className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[color:var(--ink)]">{t('camera.last_photo')}</h2>
                <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">
                  {bild ? `${t('camera.taken_at', { time: bild.wann })}${bild.test ? ` · ${t('camera.test_photo_suffix')}` : ''}` : t('camera.none_yet')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void letztesBildHolen()} className="glass-button-secondary">
                  <RefreshCw className="h-4 w-4" />
                  {t('camera.reload_image')}
                </button>
                {automat?.can_test_photo && (
                  <button type="button" onClick={() => setDialog('testfoto')} disabled={beschaeftigt !== null}
                    className="glass-button-secondary disabled:opacity-50">
                    <Camera className="h-4 w-4" />
                    {beschaeftigt === 'testfoto' ? t('camera.triggering') : t('camera.trigger_test')}
                  </button>
                )}
              </div>
            </div>

            {bild ? (
              <div className="relative overflow-hidden rounded-lg bg-slate-100">
                <img src={bild.url} alt={t('camera.last_photo_alt')} style={{ filter: (!original && filter) || undefined }} className="w-full" />
                {filter && (
                  <div className="absolute left-3 top-3 inline-flex rounded-md bg-white/95 p-0.5 shadow-sm ring-1 ring-black/5">
                    {[false, true].map((o) => (
                      <button
                        key={String(o)}
                        type="button"
                        onClick={() => setOriginal(o)}
                        aria-pressed={original === o}
                        className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                          original === o ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
                        }`}
                      >
                        {o ? t('cam2.view_original') : t('cam2.view_preview')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">
                {t('camera.no_photo_yet')}
              </div>
            )}

            {verlauf.length > 1 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-[color:var(--ink-3)]">{t('camera.test_history')}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {verlauf.map((v) => (
                    <button
                      key={v.url}
                      type="button"
                      onClick={() => setBild({ url: v.url, wann: v.wann, test: true })}
                      title={v.wann}
                      className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border ${bild?.url === v.url ? 'border-brand-500 ring-2 ring-brand-200' : 'border-[color:var(--line)]'}`}
                    >
                      <img src={v.url} alt={v.wann} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed text-[color:var(--ink-3)]">
              {t('camera.no_live_note')}
            </p>
          </GlassCard>
        </div>

        {/* Einstellungen in Gruppen */}
        <div className="space-y-4">
          {belichtungAutomatisch && (
            <p className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              {t('camera.auto_exposure_warning')}
            </p>
          )}

          {gruppen.map((g) => {
            const anzahl = g.regler.filter(istGeaendert).length;
            const auf = offen[g.id] ?? true;
            const Icon = g.icon;
            return (
              <GlassCard key={g.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setOffen((a) => ({ ...a, [g.id]: !auf }))}
                  aria-expanded={auf}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[color:var(--ink)]">{t(`cam2.group_${g.id}`)}</span>
                    <span className="block text-xs text-[color:var(--ink-3)]">{t(`cam2.group_${g.id}_sub`)}</span>
                  </span>
                  {anzahl > 0 && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
                      {t('cam2.changed', { count: anzahl })}
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${auf ? 'rotate-180' : ''}`} />
                </button>

                {auf && (
                  <div className="divide-y divide-[color:var(--line)] border-t border-[color:var(--line)] px-5">
                    {g.regler.map((e) => {
                      const alt = wertAus(kamera!.werte, e.schluessel)!;
                      const jetzt = entwurf[e.schluessel] ?? alt;
                      const anders = jetzt !== alt;
                      const zeigt = erklaert[e.schluessel] ?? false;
                      return (
                        <div key={e.schluessel} className="py-4">
                          <div className="flex items-center gap-2">
                            <label htmlFor={`e-${e.schluessel}`} className="min-w-0 flex-1 text-sm font-medium text-[color:var(--ink)]">
                              {t(propKey(e, 'title'))}
                              {!e.vorschau && e.art === 'zahl' && (
                                <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{t('cam2.no_preview')}</span>
                              )}
                            </label>
                            {anders && (
                              <button
                                type="button"
                                onClick={() => setze(e, alt)}
                                title={t('cam2.reset')}
                                aria-label={`${t('cam2.reset')}: ${t(propKey(e, 'title'))}`}
                                className="rounded-md p-1 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <span className={`rounded-md px-2 py-0.5 font-mono text-xs tabular-nums ${anders ? 'bg-brand-50 font-semibold text-brand-700' : 'bg-slate-100 text-[color:var(--ink-2)]'}`}>
                              {anzeige(e, jetzt, t)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setErklaert((a) => ({ ...a, [e.schluessel]: !zeigt }))}
                              aria-expanded={zeigt}
                              aria-label={`${t('cam2.explain')}: ${t(propKey(e, 'title'))}`}
                              title={t('cam2.explain')}
                              className={`rounded-md p-1 hover:bg-slate-100 ${zeigt ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]'}`}
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </div>

                          {e.art === 'schalter' ? (
                            <button
                              id={`e-${e.schluessel}`}
                              type="button"
                              role="switch"
                              aria-checked={jetzt === 1}
                              onClick={() => setze(e, jetzt === 1 ? 0 : 1)}
                              className={`relative mt-2.5 h-6 w-11 rounded-full transition ${jetzt === 1 ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${jetzt === 1 ? 'left-[22px]' : 'left-0.5'}`} />
                            </button>
                          ) : (
                            <div className="mt-2.5 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setze(e, jetzt - e.schritt)}
                                disabled={jetzt <= e.von}
                                aria-label="−"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50 disabled:opacity-40"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <input id={`e-${e.schluessel}`} type="range"
                                min={e.von} max={e.bis} step={e.schritt} value={jetzt}
                                onChange={(ev) => setze(e, Number(ev.target.value))}
                                className="w-full accent-slate-800" />
                              <button
                                type="button"
                                onClick={() => setze(e, jetzt + e.schritt)}
                                disabled={jetzt >= e.bis}
                                aria-label="+"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50 disabled:opacity-40"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          {anders && (
                            <p className="mt-1.5 text-xs text-[color:var(--ink-3)]">{t('cam2.camera_value', { value: anzeige(e, alt, t) })}</p>
                          )}
                          {zeigt && (
                            <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-[color:var(--ink-2)]">{t(propKey(e, 'text'))}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassCard>
            );
          })}

          {/* Technische Werte, eingeklappt */}
          <GlassCard className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => setTechnikOffen((v) => !v)}
              aria-expanded={technikOffen}
              className="flex w-full items-center gap-3 px-5 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[color:var(--ink)]">{t('cam2.technical')}</span>
                <span className="block text-xs text-[color:var(--ink-3)]">
                  {t('camera.read_from', { source: kamera?.quelle ?? '—' })}
                  {kamera?.programm && t('camera.controlled_by', { program: kamera.programm })}
                </span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${technikOffen ? 'rotate-180' : ''}`} />
            </button>
            {technikOffen && (
              <div className="border-t border-[color:var(--line)] px-5 py-4">
                <dl className="space-y-2">
                  {Object.keys(kamera?.werte ?? {}).sort().map((name) => (
                    <div key={name} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--line)] pb-2 last:border-0">
                      <dt className="text-sm text-[color:var(--ink-2)]">{nameLabel(name, t)}</dt>
                      <dd className="text-right font-mono text-xs tabular-nums text-[color:var(--ink)]">{istWert(kamera?.werte ?? {}, name, t)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-[color:var(--ink-3)]">{t('camera.limits_note')}</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Feste Änderungsleiste */}
      {geaendert.length > 0 && (
        <div className="sticky bottom-4 z-30 rounded-lg border border-[color:var(--line-strong)] bg-white/95 px-4 py-3 shadow-lg backdrop-blur max-[900px]:bottom-[calc(84px+env(safe-area-inset-bottom,0px))]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-[color:var(--ink)]">
                {t(geaendert.length === 1 ? 'camera.changes_ready_one' : 'camera.changes_ready_many', { count: geaendert.length })}
              </span>
              <span className="ml-2 hidden text-[color:var(--ink-3)] md:inline">
                {geaendert.slice(0, 3).map((e) => t(propKey(e, 'title'))).join(' · ')}
                {geaendert.length > 3 ? ' …' : ''}
              </span>
            </p>
            <button type="button" onClick={verwerfen} disabled={beschaeftigt !== null} className="glass-button-secondary disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> {t('camera.discard')}
            </button>
            <button type="button" onClick={() => setDialog('senden')} disabled={beschaeftigt !== null} className="glass-button-primary disabled:opacity-50">
              <Send className="h-4 w-4" />
              {beschaeftigt === 'senden' ? t('camera.sending') : t('camera.send_to_camera')}
            </button>
          </div>
        </div>
      )}

      {dialog === 'senden' && (
        <Modal onClose={() => setDialog(null)} labelledBy="kamera-dialog" panelClassName="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="kamera-dialog" className="text-lg font-semibold text-[color:var(--ink)]">{t('cam2.confirm_title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('cam2.confirm_text')}</p>
          <div className="mt-4 max-h-[40vh] overflow-y-auto">{aenderungsliste}</div>
          <p className="mt-3 text-xs leading-relaxed text-[color:var(--ink-3)]">{t('camera.backup_note')}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className="glass-button-secondary">{t('cam2.cancel')}</button>
            <button type="button" onClick={() => void senden()} className="glass-button-primary">
              <Send className="h-4 w-4" /> {t('camera.send_to_camera')}
            </button>
          </div>
        </Modal>
      )}

      {dialog === 'testfoto' && (
        <Modal onClose={() => setDialog(null)} labelledBy="kamera-dialog" panelClassName="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 id="kamera-dialog" className="text-lg font-semibold text-[color:var(--ink)]">{t('cam2.test_title')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">{t('cam2.test_text')}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDialog(null)} className="glass-button-secondary">{t('cam2.cancel')}</button>
            <button type="button" onClick={() => void testfoto()} className="glass-button-primary">
              <Camera className="h-4 w-4" /> {t('camera.trigger_test')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
