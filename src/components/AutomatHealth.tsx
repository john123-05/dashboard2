import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, CheckCircle2, MinusCircle, RotateCw, Moon,
  ChevronDown, ChevronRight, HelpCircle, Camera, Square, Monitor, Coins, CreditCard,
  Printer, UploadCloud, Wifi, Settings2, Mail, HardDrive, Cpu, Radar, type LucideIcon,
} from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { benenne } from '../lib/geraeteNamen';
import { automatFarbe } from '../lib/automatFarben';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { getFunctionSession } from '../lib/functionAuth';
import { useI18n, translate as t, currentLocaleTag } from '../lib/i18n';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;
const ASSETS_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-assets`;

type Status =
  | 'ok' | 'warn' | 'down' | 'off' | 'unknown'
  | 'operational' | 'degraded' | 'idle';

type Probe = {
  key: string; name: string; kind: string; status: Status;
  detail: string; tech?: string; purpose?: string; since_minutes?: number | null;
};
type Device = {
  name: string; kind: string; status: Status; detail: string;
  source_file: string; severity: string; idle_minutes: number | null;
  tech?: string; purpose?: string;
  // Klartext-Übersetzung, getrennt vom Rohtext in `detail`.
  plain?: string;
  // Der Schlüssel, mit dem der Automat selbst zwei Quellen unterscheidet.
  // Fehlt bei älteren Ständen — dann wird wie bisher über den Klarnamen
  // zusammengeführt.
  merge_key?: string | null;
};
export type HistoryEntry = {
  id: number; machine_id: string; occurred_at: string;
  severity: string; summary: string; detail: string | null;
};
/**
 * Ein Programm, das dieser Automat neu starten kann.
 *
 * Kommt vom Automaten selbst, nicht aus einer Liste im Dashboard: nur er weiss,
 * welche Programme bei ihm eingerichtet und vorhanden sind. Ein Knopf erscheint
 * deshalb nur dort, wo er auch etwas bewirkt.
 */
type Neustartbar = {
  key: string; name: string; tech: string; folge: string; exe?: string;
};

/* --------------------------------------------------------------------- Geld */

/** Das Wechselgeld, das der Automat noch ausgeben kann. */
type Muenzbestand = {
  gemessen_am: string | null;
  // Ob dem Betrag zu trauen ist. Der Automat schreibt seine Buchführung nach
  // Plan weg, auch wenn der Münzprüfer stillsteht - dann sieht ein toter Wert
  // taggenau frisch aus. Ältere Automaten melden das Feld nicht; `undefined`
  // heißt "nicht prüfbar" und darf nicht als Warnung erscheinen.
  verlaesslich?: boolean;
  hinweis?: string | null;
  unveraendert_stunden?: number | null;
  sorten: { cent: number; anzahl: number; wert_cent: number }[];
  summe_cent: number;
};
type Muenzwarnung = {
  cent: number; anzahl: number; stufe: 'leer' | 'knapp'; text: string;
};
type Zahlungsbefund = {
  zeit: string; foto: string; betrag_cent: number; zahlungsart: string;
  eingeworfen_cent: number; ausgezahlt_cent: number;
  erwartetes_wechselgeld_cent: number; abweichung_cent: number;
  sicher: boolean; hinweis: string;
};
type Zahlungsuebersicht = {
  bar_anzahl: number; bar_cent: number;
  karte_anzahl: number; karte_cent: number;
  unbekannt_anzahl: number;
  bar_anteil: number | null; karte_anteil: number | null;
  auffaellig: Zahlungsbefund[];
};

function euro(cent: number | null | undefined): string {
  if (cent === null || cent === undefined) return '–';
  return (cent / 100).toLocaleString(currentLocaleTag(), {
    style: 'currency', currency: 'EUR',
  });
}

type Machine = {
  id: string; machine_id: string; machine_label: string | null;
  last_seen_at: string | null; offline_minutes: number | null; reachable: boolean;
  probes: Probe[]; devices: Device[];
  /** Geräte, die für diesen Automaten nichts bedeuten (Klarnamen). */
  ausgeblendet?: string[];
  restartable?: Neustartbar[];
  /** Kann der Automat auf Zuruf ein Testfoto machen? */
  can_test_photo?: boolean;
  /** Die Nummer, die der Automat in die Dateinamen schreibt. */
  customer_code?: string | null;
  /** Welche Nummern für diesen Park hinterlegt sind. */
  park_customer_codes?: string[];
  /** true / false / null = nicht prüfbar (älterer Stand). */
  customer_code_registered?: boolean | null;
  /** Wie lange ein Auftrag längstens liegen bleibt, bis der Automat ihn abholt. */
  restart_poll_seconds?: number | null;
  /** Ruhezeit für "heute Nacht", z. B. ["23:30", "05:00"]. */
  night_window?: [string, string] | null;
  coin_inventory?: Muenzbestand | null;
  coin_warnings?: Muenzwarnung[];
  payments?: Zahlungsuebersicht | null;
  payments_days?: number | null;
  monitored_sources: number | null; faults_now: number | null;
  pending_health_events: number | null; agent_version: string | null;
  queue_count: number | null; disk_free_mb: number | null; paper_remaining: number | null;
  paper_capacity?: number | null; paper_warn_remaining?: number | null;
  photos_taken_today: number | null; photos_sold_today: number | null;
  pending_restart: { mode?: string; target?: string } | null;
  last_restart_at: string | null;
};

/* ------------------------------------------------------------------ Zustände
 * Sechs Zustandswörter, jedes mit einem Satz, der es erklärt. Vorher stand auf
 * der Seite "idle" - ein englisches Fachwort, das niemand ausserhalb der
 * Entwicklung liest. Die Erklärungen stehen in der Legende unten auf der Karte.
 */
type Ton = 'ok' | 'warn' | 'bad' | 'ruhig' | 'aus' | 'unklar';

const ZUSTAND_DATEN: Record<Ton, {
  label: string; erklaerung: string; punkt: string; chip: string; rang: number;
}> = {
  bad: {
    label: 'health.state.bad', rang: 5,
    erklaerung: 'health.state.bad_text',
    punkt: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  },
  warn: {
    label: 'health.state.warn', rang: 4,
    erklaerung: 'health.state.warn_text',
    punkt: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  },
  ok: {
    label: 'health.state.ok', rang: 3,
    erklaerung: 'health.state.ok_text',
    punkt: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  },
  ruhig: {
    label: 'health.state.quiet', rang: 2,
    erklaerung: 'health.state.quiet_text',
    punkt: 'bg-sky-400', chip: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  },
  aus: {
    label: 'health.state.off', rang: 1,
    erklaerung: 'health.state.off_text',
    punkt: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
  },
  unklar: {
    label: 'health.state.unknown', rang: 0,
    erklaerung: 'health.state.unknown_text',
    punkt: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200',
  },
};

// Beschriftungen werden beim Zugriff übersetzt, damit ein Sprachwechsel greift.
const ZUSTAND = new Proxy(ZUSTAND_DATEN, {
  get(ziel, schluessel: string) {
    const eintrag = ziel[schluessel as Ton];
    return eintrag ? { ...eintrag, label: t(eintrag.label), erklaerung: t(eintrag.erklaerung) } : undefined;
  },
}) as typeof ZUSTAND_DATEN;

function ton(s: Status): Ton {
  if (s === 'ok' || s === 'operational') return 'ok';
  if (s === 'warn' || s === 'degraded') return 'warn';
  if (s === 'down') return 'bad';
  if (s === 'idle') return 'ruhig';
  if (s === 'off') return 'aus';
  return 'unklar';
}

/** Reihenfolge nach dem Weg, den ein Foto durchs Haus nimmt - nicht nach Technik. */
const ORDER = ['camera', 'process', 'viewer', 'cash', 'terminal', 'printer',
  'uploader', 'network', 'config', 'mail', 'system'];

/** Symbol je Station im Ablauf-Streifen der Automatenkarte. */
const KIND_ICON: Record<string, LucideIcon> = {
  camera: Camera,
  sensor: Radar,
  viewer: Monitor,
  cash: Coins,
  terminal: CreditCard,
  printer: Printer,
  uploader: UploadCloud,
  network: Wifi,
  config: Settings2,
  mail: Mail,
  system: HardDrive,
};

export type Urteil = { ton: 'ok' | 'warn' | 'bad' | 'ruhig' | 'aus' | 'unklar'; titel: string; text: string };

function seit(min: number | null | undefined): string {
  if (min === null || min === undefined) return t('health.time.unknown');
  if (min < 1) return t('health.time.just_now');
  if (min < 90) return t('health.time.min', { n: min });
  const h = min / 60;
  return h < 48 ? t('health.time.hours', { n: h.toFixed(1) }) : t('health.time.days', { n: (h / 24).toFixed(1) });
}

/* ------------------------------------------------------------------ Zusammenführung
 * Ein Gerät kann aus zwei Richtungen beschrieben werden: direkt gemessen
 * ("läuft das Programm gerade?") und aus seiner Protokolldatei ("was hat es
 * zuletzt gesagt?"). Das sind verschiedene Fragen mit verschiedenen Antworten -
 * die Kamera-Software läuft seit 23 Stunden UND hat seit 23 Stunden kein Bild
 * gemacht. Beides gehört in EINE Zeile; zwei Zeilen mit demselben Namen liest
 * niemand als ein Gerät.
 */
type Eintrag = {
  name: string;
  tech: string;
  purpose: string;
  kind: string;
  ton: Ton;
  gemessen: Probe | null;
  protokoll: Device | null;
  /** Gesetzt, wenn sich genau dieses Programm neu starten lässt. */
  neustart: Neustartbar | null;
};

function zusammenfuehren(m: Machine): Eintrag[] {
  const nach = new Map<string, Eintrag>();
  // Zweiter Index über den Klarnamen. Gebraucht, weil die Neustart-Ziele nur
  // ihren Namen mitschicken und keinen merge_key - ohne diesen Index fänden
  // sie ihren Eintrag nicht mehr, sobald der Hauptschlüssel ein merge_key ist.
  const nachKlarname = new Map<string, Eintrag>();

  // Über das Verzeichnis, nicht über den rohen Namen: solange der Automat noch
  // die alte Fassung des Agents fährt, heisst dieselbe Sache in der Messung
  // "Kamera" und im Protokoll "3GerTis Steuerung". Ohne diese Übersetzung
  // stünden sie als zwei Kacheln da - genau die doppelte Lichtschranke.
  // `eigen` ist der `merge_key` des Automaten, wenn er einen mitschickt.
  //
  // Der Agent unterscheidet zwei unbekannte Protokolle derselben Kategorie
  // sauber - beide heissen „Sonstige Protokolle", getrennt werden sie über
  // `merge_key`, der den Dateinamen enthält.
  //
  // `merge_key` gilt aber NUR für unbekannte Protokolle (F-049). Ein bekanntes
  // Gerät wie das Verkaufsprogramm schickt zwei Meldungen: die MESSUNG (eine
  // Probe, ohne merge_key - Prozess läuft oder nicht) und das PROTOKOLL (ein
  // Device, mit merge_key wie "viewer|verkaufsprogramm"). Beide heissen im
  // Klartext "Verkaufsprogramm", aber unterschiedliche Schlüssel ("aus"
  // gemessen, "ruhig" aus dem Protokoll) landeten in zwei Kacheln statt einer -
  // "aus" und "ruhig" nebeneinander, wo eine hätte stehen müssen. Für bekannte
  // Geräte zählt deshalb wieder der Klarname, für unbekannte weiterhin der
  // merge_key.
  const anlegen = (rohname: string, kind: string, eigen?: string | null): Eintrag => {
    const b = benenne(rohname);
    const schluessel = (b.quelle === 'unbekannt' && eigen ? eigen : b.klar).toLowerCase();
    const vorhanden = nach.get(schluessel);
    if (vorhanden) return vorhanden;
    const neu: Eintrag = {
      name: b.klar, tech: b.tech, purpose: b.zweck, kind,
      ton: 'unklar', gemessen: null, protokoll: null, neustart: null,
    };
    nach.set(schluessel, neu);
    // Der erste Eintrag eines Klarnamens gewinnt: bei zwei unbekannten
    // Protokollen soll ein Neustart-Ziel nicht willkürlich beim zweiten landen.
    if (!nachKlarname.has(b.klar.toLowerCase())) {
      nachKlarname.set(b.klar.toLowerCase(), neu);
    }
    return neu;
  };

  for (const p of m.probes || []) {
    const e = anlegen(p.name, p.kind);
    e.gemessen = p;
    // Was der Agent mitschickt, hat Vorrang - es kennt die Anlage genauer als
    // das Verzeichnis, das nur nach Namen rät.
    if (p.tech) e.tech = p.tech;
    if (p.purpose) e.purpose = p.purpose;
    // Die Kategorie der Messung ist aussagekräftiger als "process": sie sagt,
    // an welcher Stelle im Ablauf das Gerät sitzt.
    if (e.kind === 'process' && p.kind !== 'process') e.kind = p.kind;
  }
  for (const d of m.devices || []) {
    const e = anlegen(d.name, d.kind, d.merge_key);
    e.protokoll = d;
    if (d.tech) e.tech = d.tech;
    if (d.purpose) e.purpose = d.purpose;
    if (e.kind === 'process') e.kind = d.kind;
  }

  // Was der Automat neu starten kann, dem passenden Eintrag zuordnen - wieder
  // über den Klarnamen, damit "Kamera-Software" vom Agent und "Kamera-Software"
  // aus dem Verzeichnis zusammenfinden.
  for (const r of m.restartable || []) {
    const eintrag = nachKlarname.get(benenne(r.name).klar.toLowerCase());
    if (eintrag) eintrag.neustart = r;
  }

  for (const e of nach.values()) {
    // Der ernstere der beiden Befunde gewinnt. "Ruhig" verdrängt dabei nie ein
    // gemessenes "läuft": dass ein Programm nichts schreibt, macht es nicht
    // weniger lebendig - der Hinweis steht dann in der Zeile darunter.
    const toene: Ton[] = [];
    if (e.gemessen) toene.push(ton(e.gemessen.status));
    if (e.protokoll) toene.push(ton(e.protokoll.status));
    e.ton = toene.sort((a, b) => ZUSTAND[b].rang - ZUSTAND[a].rang)[0] ?? 'unklar';
  }

  // Für diesen Automaten ausgeblendete Geräte (nicht eingebaut / andere
  // Software). Sie zählen weder als Kachel noch für das Urteil oben.
  const aus = new Set((m.ausgeblendet ?? []).map((n) => n.toLowerCase()));

  return [...nach.values()]
    .filter((e) => !aus.has(e.name.toLowerCase()))
    .sort((a, b) => {
      const ai = ORDER.indexOf(a.kind), bi = ORDER.indexOf(b.kind);
      return ((ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)) || a.name.localeCompare(b.name);
    });
}

/** Die eine Zeile, die in der einfachen Ansicht immer sichtbar ist. */
function kurzText(e: Eintrag): string {
  const g = e.gemessen;
  if (g) {
    if (g.status === 'off') return t('health.short.not_started');
    if (g.since_minutes !== null && g.since_minutes !== undefined) {
      return t('health.short.running_since', { time: seit(g.since_minutes) });
    }
    return g.detail;
  }
  const p = e.protokoll;
  if (p) {
    if (p.idle_minutes !== null && p.idle_minutes > 240) {
      return t('health.short.last_report', { time: seit(p.idle_minutes) });
    }
    return p.plain || p.detail;
  }
  return t('health.short.no_info');
}

/**
 * Der Zusatz, der auch eingeklappt sichtbar bleiben muss.
 *
 * Bewusst NUR der Klartext, nie der Rohtext des Programms: der steht beim
 * Aufklappen. Vorher stand beides eingeklappt und der Rohtext beim Aufklappen
 * ein zweites Mal - dieselbe Meldung zweimal untereinander.
 */
function warnText(e: Eintrag): string | null {
  if (e.ton === 'bad' || e.ton === 'warn') {
    const p = e.protokoll;
    if (p) return p.plain || p.detail;
    return e.gemessen?.detail || null;
  }
  // Läuft, meldet aber seit Stunden nichts - das gehört an die Oberfläche,
  // sonst sieht ein grüner Punkt über einer stillen Kamera zu beruhigend aus.
  if (e.gemessen?.status === 'ok' && e.protokoll?.status === 'idle') {
    return t('health.short.quiet_since', { time: seit(e.protokoll.idle_minutes) });
  }
  return null;
}

/* ------------------------------------------------------------------ Neustart
 * Ein Neustart ist kein Vorgang mit bekannter Dauer, sondern eine Kette von
 * Schritten, deren jeder auf ein echtes Signal wartet:
 *
 *   1. Auftrag gespeichert      - die Antwort des Servers
 *   2. Automat holt ihn ab      - `pending_restart` verschwindet
 *   3. Programm startet neu     - dazwischen
 *   4. Läuft wieder             - die Messung zeigt eine FRISCHE Laufzeit
 *
 * Der vorherige 45-Sekunden-Balken war schlicht erfunden: der Auftrag reist mit
 * dem Asset-Abruf mit, und der lief nur alle fünf Minuten. Der Balken war längst
 * durchgelaufen, bevor der Automat überhaupt gefragt hatte.
 *
 * Schritt 4 ist der wichtigste und wird wirklich gemessen: `since_minutes` sagt,
 * wie lange das Programm schon läuft. Ist das weniger als die Zeit seit unserem
 * Klick, dann ist es seither neu gestartet - und nur dann ist es bewiesen.
 */
type Phase = {
  titel: string;
  zustand: 'fertig' | 'laeuft' | 'offen';
  hinweis?: string;
};

type LaufenderNeustart = {
  machineId: string;
  target: string;
  name: string;
  mode: 'now' | 'tonight';
  /** Zeitpunkt des Klicks, als Bezugspunkt für "seither neu gestartet". */
  seit: number;
};

function phasen(m: Machine, n: LaufenderNeustart, jetzt: number): Phase[] {
  const vergangenMin = (jetzt - n.seit) / 60000;
  const wartetNochAufAbholung =
    Boolean(m.pending_restart)
    && (m.pending_restart?.target || 'viewer') === n.target;

  // Die Messung des betroffenen Programms suchen.
  const eintrag = zusammenfuehren(m).find((e) => e.neustart?.key === n.target);
  const seit = eintrag?.gemessen?.since_minutes;
  const laeuftFrisch =
    eintrag?.gemessen?.status === 'ok'
    && seit !== null && seit !== undefined
    // Kürzer in Betrieb als unser Auftrag alt ist: also seither gestartet.
    && seit <= vergangenMin + 1;

  const abgeholt = !wartetNochAufAbholung;
  // Nur nennen, wenn der Automat den Abstand wirklich gemeldet hat. Die frühere
  // Voreinstellung von 20 Sekunden war eine erfundene Zahl — bei
  // abgeschalteten Neustarts sind es in Wahrheit 300, und der Satz „Der Automat
  // fragt alle 20 Sekunden nach" stand trotzdem da.
  const wartezeit = typeof m.restart_poll_seconds === 'number'
    ? Math.round(m.restart_poll_seconds) : null;
  const nacht = m.night_window;

  return [
    {
      titel: t('health.phase.saved'),
      zustand: 'fertig',
    },
    {
      titel: t('health.phase.pickup'),
      zustand: abgeholt ? 'fertig' : 'laeuft',
      hinweis: abgeholt
        ? undefined
        : n.mode === 'tonight'
          ? t('health.phase.tonight_hint', { window: nacht ? ` (${nacht[0]}–${nacht[1]})` : '' })
          : wartezeit !== null
            ? t('health.phase.poll_hint', { seconds: wartezeit })
            : t('health.phase.next_poll'),
    },
    {
      titel: t('health.phase.restarting'),
      zustand: !abgeholt ? 'offen' : laeuftFrisch ? 'fertig' : 'laeuft',
    },
    {
      titel: t('health.phase.running_again', { name: n.name }),
      zustand: laeuftFrisch ? 'fertig' : 'offen',
      hinweis: laeuftFrisch && seit !== null && seit !== undefined
        ? seit < 1 ? t('health.phase.just_started') : t('health.phase.running_min', { n: seit })
        : undefined,
    },
  ];
}

/**
 * `onVerlauf` reicht den Verlauf des Automaten nach oben durch.
 *
 * Er wird hier geholt (die Function liefert ihn zusammen mit dem Zustand),
 * gehört aber unten auf der Seite neben die Meldungen aus den Protokolldateien:
 * beides sind Ereignislisten, und zwei getrennte Listen an zwei Stellen zu
 * suchen ist genau das, was die Seite unübersichtlich gemacht hat.
 */
export default function AutomatHealth({ onVerlauf, onUrteil, refreshKey }: {
  onVerlauf?: (eintraege: HistoryEntry[], verfuegbar: boolean) => void;
  /** Gesamturteil über die Anlage - die Seite zeigt es oben als Status. */
  onUrteil?: (urteil: Urteil | null) => void;
  /** Ändert sich der Wert, wird neu geladen (gemeinsamer Aktualisieren-Knopf der Seite). */
  refreshKey?: number;
} = {}) {
  useI18n();
  const { parkId } = usePark();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [detailed, setDetailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [busyMachine, setBusyMachine] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [laufend, setLaufend] = useState<LaufenderNeustart | null>(null);
  // Nur damit die Phasenanzeige mitläuft, während nichts Neues geladen wird.
  const [jetzt, setJetzt] = useState(() => Date.now());

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [parkId]);

  useEffect(() => {
    if (refreshKey) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Solange ein Neustart läuft, häufiger nachfragen: eine Minute Wartezeit
  // zwischen zwei Abfragen würde jede Phase verschlucken. Danach wieder Ruhe.
  useEffect(() => {
    if (!laufend) return;
    const t = setInterval(() => { setJetzt(Date.now()); void load(); }, 5_000);
    return () => clearInterval(t);
  }, [laufend]);

  // Ist der Neustart nachweislich durch, verschwindet die Anzeige von selbst -
  // aber erst nach einem Moment, damit der letzte Haken noch zu sehen ist.
  useEffect(() => {
    if (!laufend) return;
    const m = machines.find((x) => x.id === laufend.machineId);
    if (!m) return;
    const fertig = phasen(m, laufend, Date.now()).every((p) => p.zustand === 'fertig');
    if (!fertig) return;
    const t = setTimeout(() => setLaufend(null), 8_000);
    return () => clearTimeout(t);
  }, [machines, laufend]);

  async function headers() {
    const { data: { session } } = await getFunctionSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
  }

  async function load() {
    if (!parkId) { setMachines([]); setLoading(false); return; }
    setError(null);
    const h = await headers();
    if (!h) { setError(t('camera.session_expired_relogin')); setLoading(false); return; }

    try {
      const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}`, { headers: h });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 404) setNotDeployed(true);
        else setError(body?.error || `HTTP ${res.status}`);
      } else {
        setMachines((body?.data?.machines || []) as Machine[]);
        onVerlauf?.(
          (body?.data?.history || []) as HistoryEntry[],
          body?.data?.history_available !== false,
        );
        setNotDeployed(false);
      }
    } catch { setNotDeployed(true); }
    setLoading(false);
  }

  /**
   * Neustart eines bestimmten Programms beauftragen.
   *
   * `programm` ist null beim Zurücknehmen. Bei `now` wird bestätigt und die
   * Folge genannt, die der Automat selbst mitgeteilt hat - der Betreiber soll
   * vorher wissen, was in den nächsten Sekunden passiert.
   */
  async function restart(
    machine: Machine,
    mode: 'now' | 'tonight' | 'cancel' | 'stop',
    programm: Neustartbar | null,
  ) {
    if (mode === 'now' && programm && !confirm(
      t('health.confirm_restart', { name: programm.name, tech: programm.tech, effect: programm.folge }),
    )) return;

    // Beenden ist folgenreicher als neu starten, deshalb eine deutlichere
    // Frage: es startet NICHTS nach. Keines dieser Programme steht in einem
    // Autostart - was hier ausgeht, bleibt aus, bis es jemand wieder startet.
    if (mode === 'stop' && programm && !confirm(
      t('health.confirm_stop', { name: programm.name, tech: programm.tech, effect: programm.folge }),
    )) return;

    setBusyMachine(`${machine.id}:${programm?.key ?? 'cancel'}`);
    setNotice(null);
    const h = await headers();
    if (!h) { setError(t('camera.session_expired')); setBusyMachine(null); return; }

    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          park_id: parkId,
          machine_config_id: machine.id,
          mode,
          target: programm?.key,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
      } else if (mode === 'cancel') {
        setNotice(t('health.restart_cancelled'));
        setLaufend(null);
      } else if (mode === 'stop') {
        setNotice(t('health.stopping', { name: programm?.name ?? t('health.the_program') }));
      } else if (programm) {
        // Ab hier führt die Phasenanzeige - sie zeigt echte Schritte statt
        // eines Satzes, der eine Sekundenzahl behauptet.
        setLaufend({
          machineId: machine.id,
          target: programm.key,
          name: programm.name,
          mode,
          seit: Date.now(),
        });
        setJetzt(Date.now());
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setBusyMachine(null);
  }

  /**
   * Ein Testfoto beauftragen.
   *
   * Reist über denselben Auftragsweg wie ein Neustart, ist aber keiner - es
   * hält nichts an, es löst nur einmal aus. Das Ergebnis erscheint im Verlauf,
   * weil erst der Automat weiß, ob wirklich ein Bild entstanden ist: der
   * Auslöser meldet auch dann Erfolg, wenn die Kamera gar nicht reagiert hat.
   */
  async function testfotoAusloesen(machine: Machine) {
    if (!confirm(t('health.confirm_test_photo'))) return;

    setBusyMachine(`${machine.id}:testphoto`);
    setNotice(null);
    const h = await headers();
    if (!h) { setError(t('camera.session_expired')); setBusyMachine(null); return; }

    try {
      const res = await fetch(ASSETS_URL, {
        method: 'PATCH',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          park_id: parkId,
          machine_config_id: machine.id,
          mode: 'now',
          target: 'testphoto',
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error || `HTTP ${res.status}`);
      else setNotice(t('health.test_photo_ordered'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Auftrag fehlgeschlagen.');
    }
    setBusyMachine(null);
  }

  // Ein Satz, der die ganze Anlage beurteilt - das Erste, was jemand liest.
  const urteil = useMemo(() => {
    const eintraege = machines.flatMap((m) => zusammenfuehren(m));
    const bad = eintraege.filter((e) => e.ton === 'bad');
    const warn = eintraege.filter((e) => e.ton === 'warn');
    const offline = machines.filter((m) => !m.reachable);

    if (machines.length === 0) return null;
    if (offline.length === machines.length) {
      return {
        ton: 'bad' as Ton,
        titel: t('health.verdict.offline_title'),
        text: t('health.verdict.offline_text'),
      };
    }
    // Ein nicht hinterlegter Abholcode wiegt schwerer als jede Gerätestörung:
    // die Anlage läuft, aber Fotos und Umsatz landen beim falschen Park.
    const codeFehlt = machines.filter((m) => m.customer_code_registered === false);
    if (codeFehlt.length) {
      return {
        ton: 'bad' as Ton,
        titel: t('health.verdict.code_title'),
        text: t('health.verdict.code_text'),
      };
    }
    if (bad.length) {
      return {
        ton: 'bad' as Ton,
        titel: bad.length === 1 ? t('health.verdict.faults_one') : t('health.verdict.faults_many', { count: bad.length }),
        text: t('health.verdict.affected', { names: bad.map((e) => e.name).join(', ') }),
      };
    }
    if (warn.length) {
      return {
        ton: 'warn' as Ton,
        titel: warn.length === 1 ? t('health.verdict.warnings_one') : t('health.verdict.warnings_many', { count: warn.length }),
        text: t('health.verdict.affected_selling', { names: warn.map((e) => e.name).join(', ') }),
      };
    }
    // Kein einziger Eintrag heisst NICHT "alles in Ordnung", sondern "wir
    // wissen nichts". Ein Automat mit älterem Stand meldet weder Messungen
    // noch Geräte; ihn deshalb grün zu färben wäre eine Behauptung über etwas,
    // das niemand geprüft hat.
    if (eintraege.length === 0) {
      return {
        ton: 'unklar' as Ton,
        titel: t('health.verdict.no_data_title'),
        text: t('health.verdict.no_data_text'),
      };
    }

    return {
      ton: 'ok' as Ton,
      titel: t('health.verdict.ok_title'),
      text: t('health.verdict.ok_text'),
    };
  }, [machines]);

  useEffect(() => {
    if (!loading) onUrteil?.(urteil);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urteil, loading]);

  if (!parkId) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('health.status_title')}</h3>
          <ZustandsHilfe />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[color:var(--ink-3)]" />}
        </div>
        <div className="inline-flex shrink-0 self-start rounded-md border border-[color:var(--line-strong)] p-0.5 sm:self-auto">
          {[false, true].map((wert) => (
            <button
              key={String(wert)}
              type="button"
              onClick={() => setDetailed(wert)}
              className={`rounded px-3 py-1 text-sm transition ${
                detailed === wert ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
              }`}
            >
              {wert ? t('health.detailed') : t('health.simple')}
            </button>
          ))}
        </div>
      </div>

      {notDeployed && (
        <Hinweis ton="warn">
          {t('health.not_deployed')}
          (<code className="rounded bg-amber-100 px-1">operator-liftpic-health</code>).
        </Hinweis>
      )}
      {error && <Hinweis ton="bad">{error}</Hinweis>}
      {notice && <Hinweis ton="ok">{notice}</Hinweis>}

      {!loading && !notDeployed && machines.length === 0 && (
        <p className="text-sm text-slate-500">{t('health.no_machine')}</p>
      )}

      {machines.length > 0 && (
        <div className={`grid items-start gap-5 ${machines.length > 1 ? '2xl:grid-cols-2' : ''}`}>
          {machines.map((m, index) => (
            <Automat
              key={m.id}
              m={m}
              farbe={automatFarbe(index)}
              mehrere={machines.length > 1}
              detailed={detailed}
              busyKey={busyMachine}
              laufend={laufend?.machineId === m.id ? laufend : null}
              jetzt={jetzt}
              onRestart={(mode, programm) => void restart(m, mode, programm)}
              onTestfoto={() => void testfotoAusloesen(m)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Automat({ m, farbe, mehrere, detailed, busyKey, laufend, jetzt, onRestart, onTestfoto }: {
  m: Machine; farbe: string; mehrere: boolean; detailed: boolean; busyKey: string | null;
  laufend: LaufenderNeustart | null; jetzt: number;
  onRestart: (mode: 'now' | 'tonight' | 'cancel' | 'stop', programm: Neustartbar | null) => void;
  onTestfoto: () => void;
}) {
  const eintraege = useMemo(() => zusammenfuehren(m), [m]);
  const [offen, setOffen] = useState<Set<string>>(new Set());

  function umschalten(name: string) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(name)) neu.delete(name); else neu.add(name);
      return neu;
    });
  }

  // In der einfachen Ansicht bleiben Systemwerte aussen vor, solange sie in
  // Ordnung sind: dass 416 GB frei sind, muss niemand täglich lesen. Sobald
  // etwas davon nicht stimmt, taucht es auf.
  const sichtbar = detailed
    ? eintraege
    : eintraege.filter((e) => e.kind !== 'system' || e.ton === 'bad' || e.ton === 'warn');


  // Der Testfoto-Knopf hing bisher allein an der Kamerakachel. Die entsteht
  // aber nur, solange das Kameraprotokoll juenger als 48 Stunden ist
  // (OPERATIONAL_LOG_DEFUNCT_MINUTES) - und ein Protokoll altert auch dann,
  // wenn die Kamera laeuft und blosss niemand faehrt. Ergebnis: nach zwei
  // ruhigen Tagen verschwand ausgerechnet der Knopf, mit dem man prueft, ob
  // die Kamera noch geht. Der Automat meldet `can_test_photo` voellig
  // unabhaengig davon - also richtet sich der Knopf jetzt danach. (F-043)
  const hatKameraKachel = eintraege.some(
    (e) => e.kind === 'camera' && e.name === 'Kamera-Software',
  );
  const testfotoOhneKachel = Boolean(m.can_test_photo) && !hatKameraKachel;

  /**
   * Läuft der offene Auftrag genau für dieses Programm?
   *
   * Es kann immer nur ein Neustart zugleich vorgemerkt sein - der Automat holt
   * genau einen Auftrag ab. Statt weitere Klicks stillschweigend zu schlucken,
   * zeigen die anderen Kacheln solange keinen Knopf und die betroffene den
   * Status samt "zurücknehmen".
   */
  function wartetAuf(e: Eintrag): boolean {
    if (!m.pending_restart || !e.neustart) return false;
    // Ältere Aufträge tragen kein Ziel und meinten immer das Verkaufsprogramm.
    return (m.pending_restart.target || 'viewer') === e.neustart.key;
  }

  // Ablauf-Streifen: die Stationen, die ein Foto durchläuft, in derselben
  // Reihenfolge wie die Liste darunter. Systemwerte (Speicher usw.) bleiben
  // draussen, ausser sie melden ein Problem.
  const stationen = eintraege.filter((e) => e.kind !== 'system' || e.ton === 'bad' || e.ton === 'warn');
  const inOrdnung = sichtbar.filter((e) => e.ton === 'ok' || e.ton === 'ruhig').length;

  // Lichtlauf: Station für Station leuchtet kurz auf, die Linie davor läuft mit.
  // An der ersten roten Station bleibt er stehen - sie pulsiert dann rot.
  const ersteRote = stationen.findIndex((e) => e.ton === 'bad');
  const letzteLauf = ersteRote === -1 ? stationen.length - 1 : ersteRote - 1;
  const [lauf, setLauf] = useState(-1);
  const [laufRunde, setLaufRunde] = useState(0);
  useEffect(() => {
    if (letzteLauf < 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLauf(-1);
      return;
    }
    const PAUSE = 4; // Takte Ruhe zwischen zwei Durchläufen
    let schritt = -1;
    const timer = window.setInterval(() => {
      schritt = schritt >= letzteLauf + PAUSE ? 0 : schritt + 1;
      setLauf(schritt <= letzteLauf ? schritt : -1);
      if (schritt === 0) setLaufRunde((r) => r + 1);
    }, 650);
    return () => window.clearInterval(timer);
  }, [letzteLauf]);
  const papierWarn = m.paper_warn_remaining ?? 30;

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-[color:var(--line)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: farbe }} />
            <h4 className="text-lg font-semibold text-[color:var(--ink)]">{m.machine_label || m.machine_id}</h4>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              m.reachable ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${m.reachable ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {m.reachable ? t('health.connected') : t('health.no_data_since', { time: seit(m.offline_minutes) })}
            </span>
          </div>
          {eintraege.length > 0 && (
            <p className="mt-1 text-xs text-[color:var(--ink-3)]">
              {t('health.components_ok', { ok: inOrdnung, total: sichtbar.length })}
            </p>
          )}
        </div>

        {(m.photos_taken_today !== null || typeof m.paper_remaining === 'number') && (
          <div className="flex flex-wrap gap-6 lg:justify-end">
            {typeof m.paper_remaining === 'number' && (
              <div className="min-w-[8rem]">
                <p className="text-xs text-[color:var(--ink-3)]">{t('health.paper_left')}</p>
                <p className={`mt-0.5 text-2xl font-light tabular-nums leading-none ${m.paper_remaining <= papierWarn ? 'text-amber-700' : 'text-[color:var(--ink)]'}`}>
                  {m.paper_remaining}
                  {m.paper_capacity ? <span className="text-sm text-[color:var(--ink-3)]"> / {m.paper_capacity}</span> : null}
                </p>
                {m.paper_capacity ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${m.paper_remaining <= papierWarn ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.max(2, (m.paper_remaining / m.paper_capacity) * 100))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {m.photos_taken_today !== null && (
              <div>
                <p className="text-xs text-[color:var(--ink-3)]">{t('health.photos_today')}</p>
                <p className="mt-0.5 text-2xl font-light tabular-nums leading-none text-[color:var(--ink)]">{m.photos_taken_today}</p>
              </div>
            )}
            {/* „0 verkauft" wäre eine Aussage über etwas, das niemand gezählt
                hat. Meldet der Automat die Verkäufe nicht, bleibt die Angabe weg. */}
            {m.photos_sold_today !== null && m.photos_sold_today !== undefined && (
              <div>
                <p className="text-xs text-[color:var(--ink-3)]">{t('health.sold')}</p>
                <p className="mt-0.5 text-2xl font-light tabular-nums leading-none text-[color:var(--ink)]">{m.photos_sold_today}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {stationen.length > 0 && (
        <div className="overflow-x-auto border-b border-[color:var(--line)] bg-slate-50 px-5 py-4">
          <ol className="flex min-w-max items-start sm:min-w-0">
            {stationen.map((e, i) => {
              const Icon = KIND_ICON[e.kind] ?? Cpu;
              const z = ZUSTAND[e.ton];
              const aktiv = lauf === i;
              const glow = e.ton === 'warn'
                ? 'border-amber-400 shadow-[0_0_0_4px_rgba(245,158,11,0.14),0_0_14px_rgba(245,158,11,0.55)]'
                : 'border-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.14),0_0_14px_rgba(16,185,129,0.55)]';
              return [
                i > 0 ? (
                  <li key={`${e.name}-linie`} className="relative mt-[18px] h-px min-w-6 flex-1 overflow-hidden bg-[color:var(--line-strong)]" aria-hidden>
                    {aktiv && (
                      <span
                        key={`${laufRunde}-${i}`}
                        className={`lp-flow-line absolute inset-y-0 left-0 w-full ${
                          e.ton === 'warn'
                            ? 'bg-[linear-gradient(90deg,transparent,rgba(245,158,11,0.9),transparent)]'
                            : 'bg-[linear-gradient(90deg,transparent,rgba(16,185,129,0.9),transparent)]'
                        }`}
                        style={{ height: 2, top: -0.5 }}
                      />
                    )}
                  </li>
                ) : null,
                <li key={e.name} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => umschalten(e.name)}
                    title={`${e.name} · ${z.label}`}
                    className="group flex w-24 flex-col items-center gap-1.5 text-center"
                  >
                    <span
                      className={`relative flex h-9 w-9 items-center justify-center rounded-full border bg-white text-[color:var(--ink-2)] transition-[border-color,box-shadow] duration-500 group-hover:border-brand-400 ${
                        e.ton === 'bad' && i === ersteRote ? 'lp-red-glow border-rose-400' : aktiv ? `${glow} delay-200` : 'border-[color:var(--line-strong)]'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white ${z.punkt}`} />
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-[color:var(--ink-2)] group-hover:text-[color:var(--ink)]">{e.name}</span>
                    <span className="text-[10px] text-[color:var(--ink-3)]">{z.label}</span>
                  </button>
                </li>,
              ];
            })}
          </ol>
        </div>
      )}

      <div className="p-4 sm:p-5">
      {/* Der Abholcode entscheidet, in welchem Park ein Foto landet. Ist die
          Nummer des Automaten hier nicht hinterlegt, ordnet der Server die
          Fotos einem FREMDEN Park zu - samt Umsatz. Das ist am 15.08.2026
          passiert und war vorher nirgends sichtbar. Deshalb ganz oben und
          nicht in einer Kachel versteckt. */}
      {m.customer_code_registered === false && (
        <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-sm font-semibold text-rose-800">
            {t('health.code_missing_title', { code: m.customer_code ?? '' })}
          </p>
          <p className="mt-1 text-xs text-rose-700">
            {t('health.code_missing_text', { code: m.customer_code ?? '' })}
            {m.park_customer_codes?.length ? (
              <> {t('health.code_registered_now', { codes: m.park_customer_codes.join(', ') })}</>
            ) : (
              <> {t('health.code_none')}</>
            )}
          </p>
        </div>
      )}

      {/* Zwei Spalten: die Seite hat links und rechts reichlich Platz, den eine
          einspaltige Liste verschenkt und mit Scrollweg bezahlt. `items-start`
          verhindert, dass eine aufgeklappte Kachel ihre Nachbarin mitzieht. */}
      {/* Ein Automat mit älterem Stand meldet weder Messungen noch Geräte.
          Dann bleibt hier bewusst eine Erklärung statt einer leeren Fläche. */}
      {eintraege.length === 0 && (
        <p className="rounded-lg border border-dashed border-[color:var(--line-strong)] px-3 py-3 text-sm text-[color:var(--ink-3)]">
          {t('health.old_agent', { version: m.agent_version ? t('health.version_suffix', { version: m.agent_version }) : '' })}
        </p>
      )}

      {testfotoOhneKachel && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--line)] px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">{t('health.trigger_test')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              {t('health.test_quiet_note')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTestfoto()}
            disabled={busyKey === `${m.id}:testphoto`}
            className="glass-button-secondary shrink-0 py-1.5 text-sm disabled:opacity-50"
          >
            {busyKey === `${m.id}:testphoto`
              ? t('health.triggering')
              : m.pending_restart?.target === 'testphoto'
                ? t('health.waiting_kiosk')
                : t('health.trigger_test')}
          </button>
        </div>
      )}

      {/* Zwei unabhängige Spalten statt Raster: eine aufgeklappte Zeile soll
          in der Nachbarspalte keine Lücke reissen. */}
      <div className={mehrere ? '' : 'lg:columns-2 lg:gap-2'}>
        {sichtbar.map((e) => (
          <div key={e.name} className="mb-2 break-inside-avoid">
          <Zeile
            key={e.name}
            e={e}
            // Läuft für dieses Programm gerade ein Neustart, klappt die Kachel
            // von selbst auf - der Fortschritt darf sich nicht verstecken.
            offen={
              detailed || offen.has(e.name)
              || Boolean(laufend && laufend.target === e.neustart?.key)
            }
            aufklappbar={!detailed}
            onToggle={() => umschalten(e.name)}
            wartend={wartetAuf(e)}
            gesperrt={Boolean(m.pending_restart) && !wartetAuf(e)}
            busy={busyKey === `${m.id}:${e.neustart?.key}`}
            pendingMode={m.pending_restart?.mode}
            phasen={
              laufend && laufend.target === e.neustart?.key
                ? phasen(m, laufend, jetzt)
                : null
            }
            // Alles zum Geld unter "Münzeinnahmen" - dort sucht man es, und
            // genau von dort stammen die Zahlen auch (CoinStats). Der
            // Münzprüfer bleibt das Gerät: läuft es oder nicht.
            geld={
              e.name === 'Münzeinnahmen'
                ? {
                  bestand: m.coin_inventory ?? null,
                  warnungen: m.coin_warnings ?? [],
                  zahlungen: m.payments ?? null,
                  tage: m.payments_days,
                }
                : null
            }
            testfoto={
              e.kind === 'camera' && e.name === 'Kamera-Software' && m.can_test_photo
                ? {
                  busy: busyKey === `${m.id}:testphoto`,
                  wartend: m.pending_restart?.target === 'testphoto',
                  ausloesen: () => onTestfoto(),
                }
                : null
            }
            onRestart={(mode) => onRestart(mode, e.neustart)}
          />
          </div>
        ))}
      </div>

      <div className="mt-3">
        {detailed && (
          <p className="mt-2 text-[11px] text-slate-400">
            {/* „0 Quellen überwacht" klingt wie ein Ausfall, ist aber eine
                Wissenslücke, wenn der Automat das Feld gar nicht schickt. */}
            {typeof m.monitored_sources === 'number'
              ? t('health.sources_monitored', { count: m.monitored_sources })
              : t('health.sources_unknown')}
            {m.agent_version && <> · {t('health.version', { version: m.agent_version })}</>}
            {(m.pending_health_events || 0) > 0 && <> · {t('health.events_waiting', { count: m.pending_health_events ?? 0 })}</>}
            {m.last_restart_at && <> · {t('health.last_restart', { time: new Date(m.last_restart_at).toLocaleString(currentLocaleTag()) })}</>}
          </p>
        )}
      </div>
      </div>
    </GlassCard>
  );
}

/** Eine Kachel pro Gerät: Punkt, Klarname, ein Satz. Alles Weitere aufklappbar. */
function Zeile({
  e, offen, aufklappbar, onToggle, wartend, gesperrt, busy, pendingMode,
  phasen: schritte, geld, testfoto, onRestart,
}: {
  e: Eintrag; offen: boolean; aufklappbar: boolean; onToggle: () => void;
  wartend: boolean; gesperrt: boolean; busy: boolean;
  pendingMode?: string;
  phasen: Phase[] | null;
  geld?: {
    bestand: Muenzbestand | null;
    warnungen: Muenzwarnung[];
    zahlungen: Zahlungsuebersicht | null;
    tage: number | null | undefined;
  } | null;
  testfoto?: { busy: boolean; wartend: boolean; ausloesen: () => void } | null;
  onRestart: (mode: 'now' | 'tonight' | 'cancel' | 'stop') => void;
}) {
  const z = ZUSTAND[e.ton];
  const warnung = warnText(e);
  const Pfeil = offen ? ChevronDown : ChevronRight;

  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
      <button
        type="button"
        onClick={aufklappbar ? onToggle : undefined}
        aria-expanded={offen}
        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition ${
          aufklappbar ? 'hover:bg-slate-50' : 'cursor-default'
        }`}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${z.punkt}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold text-[color:var(--ink)]">{e.name}</span>
            {e.tech && <span className="text-[11px] text-[color:var(--ink-3)]">{e.tech}</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-[color:var(--ink-3)]">
            {kurzText(e)}
            {warnung && (
              <span className={
                e.ton === 'bad' ? 'text-rose-700'
                  : e.ton === 'warn' ? 'text-amber-800' : 'text-sky-700'
              }>
                {' · '}{warnung}
              </span>
            )}
          </span>
        </span>
        {/* Ein laufender Auftrag muss auch eingeklappt sichtbar sein - sonst
            klickt jemand weiter, weil nichts zu passieren scheint. */}
        {wartend && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            <RotateCw className="h-3 w-3 animate-spin" />
            {pendingMode === 'tonight' ? t('health.tonight') : t('health.restarting_chip')}
          </span>
        )}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${z.chip}`}>
          {z.label}
        </span>
        {aufklappbar && <Pfeil className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {offen && (
        <div className="space-y-2 border-t border-[color:var(--line)] bg-slate-50 px-3.5 py-3 text-xs">
          {e.purpose && <p className="text-[color:var(--ink-2)]">{e.purpose}</p>}
          {/* Beim Bargeld interessiert nicht die letzte Protokollzeile, sondern
              wie viel Wechselgeld noch da ist und wie bezahlt wurde. */}
          {geld?.bestand && (
            <Muenzbestand bestand={geld.bestand} warnungen={geld.warnungen} />
          )}
          {geld?.zahlungen && (
            <Zahlungen uebersicht={geld.zahlungen} tage={geld.tage} />
          )}
          {e.gemessen && (
            <Befund titel={t('health.measured')} text={e.gemessen.detail} />
          )}
          {e.protokoll && (
            <Befund
              titel={t('health.log_ago', { time: seit(e.protokoll.idle_minutes) })}
              text={e.protokoll.detail}
              datei={e.protokoll.source_file?.split('\\').pop()}
            />
          )}

          {/* Testfoto: löst genau das aus, was auch die Lichtschranke auslöst.
              Steht an der Kamera-Kachel, weil man dort nachsieht, wenn kein
              Bild mehr kommt. */}
          {testfoto && (
            <div className="border-t border-[color:var(--line)] pt-2.5">
              <button
                onClick={testfoto.ausloesen}
                disabled={testfoto.busy || testfoto.wartend}
                className="glass-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {testfoto.busy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />}
                {t('health.trigger_test')}
              </button>
              <p className="mt-1 text-slate-400">
                {testfoto.wartend
                  ? t('health.test_running')
                  : t('health.test_note')}
              </p>
            </div>
          )}

          {e.neustart && (
            <div className="border-t border-[color:var(--line)] pt-2.5">
              {gesperrt && !wartend ? (
                <p className="text-slate-400">
                  {t('health.other_restart_pending')}
                </p>
              ) : (
                <>
                  {/* Die Stile des Dashboards (glass-button-*), nur kleiner.
                      Utilities gewinnen gegen die Component-Layer-Klassen, die
                      Groesse laesst sich also einfach ueberschreiben. Der
                      Sofort-Neustart bekommt die Hauptfarbe: er ist die
                      Handlung, wegen der jemand hier ist. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => onRestart('now')}
                      disabled={busy || wartend}
                      className="glass-button-primary px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <RotateCw className="h-3.5 w-3.5" />}
                      {t('health.restart_now')}
                    </button>
                    <button
                      onClick={() => onRestart('tonight')}
                      disabled={busy || wartend}
                      className="glass-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      <Moon className="h-3.5 w-3.5" />
                      {t('health.tonight_button')}
                    </button>
                    {/* Beenden ohne Neustart. Steht bewusst rechts und in
                        gedeckter Farbe: es ist die seltenere Handlung, und
                        danach verkauft der Automat nichts mehr, bis jemand das
                        Programm wieder startet. */}
                    <button
                      onClick={() => onRestart('stop')}
                      disabled={busy || wartend}
                      className="glass-button-secondary px-3 py-1.5 text-xs text-rose-900 disabled:opacity-40"
                    >
                      <Square className="h-3.5 w-3.5" />
                      {t('health.stop')}
                    </button>
                    {wartend && (
                      <button
                        onClick={() => onRestart('cancel')}
                        disabled={busy}
                        className="glass-button-secondary px-3 py-1.5 text-xs text-amber-900 disabled:opacity-40"
                      >
                        {t('health.cancel')}
                      </button>
                    )}
                  </div>

                  {/* Direkt unter den Knöpfen: die Schritte, jeder mit seinem
                      eigenen Signal. Ohne laufenden Auftrag steht hier nur,
                      was der Neustart bedeutet. */}
                  {schritte ? (
                    <ol className="mt-2 space-y-1.5">
                      {schritte.map((p, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                            {p.zustand === 'fertig' ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : p.zustand === 'laeuft' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-slate-300" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className={
                              p.zustand === 'fertig' ? 'text-slate-700'
                                : p.zustand === 'laeuft' ? 'font-medium text-slate-800'
                                  : 'text-slate-400'
                            }>
                              {p.titel}
                            </span>
                            {p.hinweis && (
                              <span className="block text-[11px] text-slate-400">{p.hinweis}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-1 text-slate-400">{e.neustart.folge}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Der Wechselgeldbestand als Balken je Münzsorte.
 *
 * Bewusst je Sorte statt nur als Summe: 60 € klingen üppig, nützen dem Gast
 * aber nichts, wenn ausgerechnet die 2-€-Röhre leer ist und er sein Wechselgeld
 * nicht bekommt. Die Balken sind auf die stückstärkste Sorte skaliert, weil es
 * um "wie viele Münzen liegen noch da" geht, nicht um deren Wert.
 */
function Muenzbestand({ bestand, warnungen }: {
  bestand: Muenzbestand; warnungen: Muenzwarnung[];
}) {
  const groesste = Math.max(1, ...bestand.sorten.map((s) => s.anzahl));
  const nachCent = new Map(warnungen.map((w) => [w.cent, w]));

  return (
    <div className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-[color:var(--ink-2)]">
          {t('health.change_in_machine')}
        </span>
        <span className={`text-sm font-semibold tabular-nums ${
          bestand.verlaesslich === false ? 'text-slate-400 line-through' : 'text-slate-800'
        }`}>
          {euro(bestand.summe_cent)}
        </span>
      </div>

      {/* Steht der Münzprüfer still, ist der Betrag eine Behauptung des
          Verkaufsprogramms, keine Messung. Dann wird er durchgestrichen und
          der Grund genannt, statt ihn als Tatsache zu zeigen. */}
      {bestand.verlaesslich === false && bestand.hinweis && (
        <p className="mb-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
          <b className="font-semibold">{t('health.amount_unreliable')}</b> {bestand.hinweis}
        </p>
      )}

      <div className="space-y-1">
        {bestand.sorten.map((sorte) => {
          const warnung = nachCent.get(sorte.cent);
          const farbe = warnung?.stufe === 'leer' ? 'bg-rose-500'
            : warnung?.stufe === 'knapp' ? 'bg-amber-500' : 'bg-emerald-500';
          return (
            <div key={sorte.cent} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-right tabular-nums text-slate-500">
                {euro(sorte.cent)}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <span
                  className={`block h-full rounded-full ${farbe}`}
                  style={{ width: `${Math.max(sorte.anzahl ? 3 : 0, (sorte.anzahl / groesste) * 100)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 tabular-nums text-slate-500">
                {t('health.pieces', { count: sorte.anzahl })}
              </span>
            </div>
          );
        })}
      </div>

      {warnungen.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {warnungen.map((w) => (
            <li
              key={w.cent}
              className={w.stufe === 'leer' ? 'text-rose-700' : 'text-amber-800'}
            >
              {w.text}
              {w.stufe === 'leer' && t('health.too_little_change')}
            </li>
          ))}
        </ul>
      )}

      {bestand.gemessen_am && (
        <p className="mt-1 text-[11px] text-slate-400">
          {t('health.coin_as_of', { time: new Date(bestand.gemessen_am).toLocaleString(currentLocaleTag()) })}
        </p>
      )}
    </div>
  );
}

/** Bar oder Karte, und ob das Wechselgeld aufgeht. */
function Zahlungen({ uebersicht, tage }: {
  uebersicht: Zahlungsuebersicht; tage: number | null | undefined;
}) {
  const gesamt = uebersicht.bar_anzahl + uebersicht.karte_anzahl;
  // Der Automat liefert die Anteile bewusst als `null`, wenn nichts gezahlt
  // wurde. Sie auf 0 zu setzen ergab einen Balken mit 0 % bar und 100 % Karte —
  // eine erfundene Aufteilung. Ohne Anteile wird der Balken weggelassen.
  const barAnteil = uebersicht.bar_anteil;
  const karteAnteil = uebersicht.karte_anteil;
  const anteileBekannt = typeof barAnteil === 'number' && typeof karteAnteil === 'number';

  return (
    <div className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-semibold text-[color:var(--ink-2)]">
        {t('health.payments')}{tage ? t('health.last_days', { days: tage }) : ''}
      </p>

      {gesamt === 0 ? (
        <p className="text-slate-500">{t('health.no_payments')}</p>
      ) : (
        <>
          {anteileBekannt && (
            <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200">
              <span className="bg-emerald-500" style={{ width: `${barAnteil * 100}%` }} />
              <span className="bg-sky-500" style={{ width: `${karteAnteil * 100}%` }} />
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t('pay.cash')} <b className="tabular-nums">{uebersicht.bar_anzahl}</b>
              <span className="text-slate-400">
                ({anteileBekannt && `${Math.round(barAnteil * 100)} %, `}
                {euro(uebersicht.bar_cent)})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              {t('pay.card')} <b className="tabular-nums">{uebersicht.karte_anzahl}</b>
              <span className="text-slate-400">
                ({anteileBekannt && `${Math.round(karteAnteil * 100)} %, `}
                {euro(uebersicht.karte_cent)})
              </span>
            </span>
          </div>
        </>
      )}

      {uebersicht.auffaellig.length > 0 && (
        <div className="mt-2 rounded-lg bg-rose-50 px-2 py-1.5">
          <p className="font-semibold text-rose-800">
            {t('health.wrong_change', { count: uebersicht.auffaellig.length })}
          </p>
          <ul className="mt-0.5 space-y-0.5 text-rose-700">
            {uebersicht.auffaellig.slice(0, 4).map((b, i) => (
              <li key={i} className="tabular-nums">
                {new Date(b.zeit).toLocaleString(currentLocaleTag())}:{' '}
                {b.abweichung_cent > 0 ? '+' : ''}{euro(b.abweichung_cent)}
                <span className="text-rose-600"> ({b.hinweis})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Ein Befund im aufgeklappten Bereich - immer der Rohtext, nie die Übersetzung. */
function Befund({ titel, text, datei }: {
  titel: string; text: string; datei?: string;
}) {
  return (
    <div className="rounded-md border border-[color:var(--line)] bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-[color:var(--ink-2)]">
        {titel}{datei && <span className="font-normal normal-case"> · {datei}</span>}
      </p>
      <p className="mt-0.5 break-words font-mono text-[11px] text-[color:var(--ink-2)]">{text}</p>
    </div>
  );
}

/**
 * Was die Zustandswörter bedeuten - als Fragezeichen neben der Überschrift.
 *
 * Vorher war das ein Aufklapper unter der Liste: er kostete dauerhaft eine
 * Zeile, obwohl man ihn ein einziges Mal liest. Als Fragezeichen ist die
 * Erklärung dort, wo die Frage entsteht, und nimmt sonst keinen Platz weg.
 * Bewusst per CSS (`group-hover` / `group-focus-within`) statt per State: so
 * öffnet sie auch bei Tastaturbedienung und kann nicht hängen bleiben.
 */
function ZustandsHilfe() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={t('health.states_help')}
        className="flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--ink-3)] transition hover:text-[color:var(--ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-7 z-20 w-72 origin-top-left scale-95 rounded-lg border border-[color:var(--line)] bg-white p-3 opacity-0 shadow-[0_12px_32px_rgba(16,24,40,0.14)] transition group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100"
      >
        <span className="mb-1.5 block text-xs font-semibold text-slate-700">
          {t('health.states_title')}
        </span>
        {(['ok', 'ruhig', 'warn', 'bad', 'aus', 'unklar'] as Ton[]).map((zustand) => (
          <span key={zustand} className="mt-1 flex items-start gap-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ZUSTAND[zustand].punkt}`} />
            <span className="text-xs leading-snug">
              <span className="font-semibold text-slate-800">{ZUSTAND[zustand].label}</span>
              <span className="text-slate-500"> &ndash; {ZUSTAND[zustand].erklaerung}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function Hinweis({ ton, children }: { ton: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const map = {
    ok: { cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
    warn: { cls: 'bg-amber-50 text-amber-800', Icon: AlertTriangle },
    bad: { cls: 'bg-rose-50 text-rose-700', Icon: MinusCircle },
  }[ton];
  const Icon = map.Icon;
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${map.cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
