import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, AlertTriangle, CheckCircle2, MinusCircle, RotateCw, Moon,
  ChevronDown, ChevronRight, HelpCircle, Camera, Square,
} from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { benenne } from '../lib/geraeteNamen';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';

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
  return (cent / 100).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
  });
}

type Machine = {
  id: string; machine_id: string; machine_label: string | null;
  last_seen_at: string | null; offline_minutes: number | null; reachable: boolean;
  probes: Probe[]; devices: Device[];
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

const ZUSTAND: Record<Ton, {
  label: string; erklaerung: string; punkt: string; chip: string; rang: number;
}> = {
  bad: {
    label: 'Ausgefallen', rang: 5,
    erklaerung: 'Arbeitet nicht mehr.',
    punkt: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700',
  },
  warn: {
    label: 'Eingeschränkt', rang: 4,
    erklaerung: 'Läuft, meldet aber ein Problem.',
    punkt: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800',
  },
  ok: {
    label: 'Läuft', rang: 3,
    erklaerung: 'Arbeitet normal.',
    punkt: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700',
  },
  ruhig: {
    label: 'Ruhig', rang: 2,
    erklaerung: 'Läuft, meldet aber länger nichts. Nachts normal.',
    punkt: 'bg-sky-400', chip: 'bg-sky-100 text-sky-700',
  },
  aus: {
    label: 'Aus', rang: 1,
    erklaerung: 'Nicht gestartet oder nicht angeschlossen.',
    punkt: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500',
  },
  unklar: {
    label: 'Unklar', rang: 0,
    erklaerung: 'Zustand nicht ermittelbar.',
    punkt: 'bg-slate-300', chip: 'bg-slate-100 text-slate-500',
  },
};

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

function seit(min: number | null | undefined): string {
  if (min === null || min === undefined) return 'unbekannt';
  if (min < 1) return 'gerade eben';
  if (min < 90) return `${min} Min.`;
  const h = min / 60;
  return h < 48 ? `${h.toFixed(1)} Std.` : `${(h / 24).toFixed(1)} Tagen`;
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
  // `merge_key`, der den Dateinamen enthält. Das Dashboard bekam den Schlüssel
  // bisher nicht und führte beide über den Klarnamen wieder zusammen: das
  // zweite überschrieb das erste. Der Test auf Agentenseite war erfüllt, in der
  // Anzeige war er aufgehoben.
  const anlegen = (rohname: string, kind: string, eigen?: string | null): Eintrag => {
    const b = benenne(rohname);
    const schluessel = (eigen || b.klar).toLowerCase();
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

  return [...nach.values()].sort((a, b) => {
    const ai = ORDER.indexOf(a.kind), bi = ORDER.indexOf(b.kind);
    return ((ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)) || a.name.localeCompare(b.name);
  });
}

/** Die eine Zeile, die in der einfachen Ansicht immer sichtbar ist. */
function kurzText(e: Eintrag): string {
  const g = e.gemessen;
  if (g) {
    if (g.status === 'off') return 'Nicht gestartet';
    if (g.since_minutes !== null && g.since_minutes !== undefined) {
      return `Läuft seit ${seit(g.since_minutes)}`;
    }
    return g.detail;
  }
  const p = e.protokoll;
  if (p) {
    if (p.idle_minutes !== null && p.idle_minutes > 240) {
      return `Letzte Meldung vor ${seit(p.idle_minutes)}`;
    }
    return p.plain || p.detail;
  }
  return 'Keine Angabe';
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
    return `Still seit ${seit(e.protokoll.idle_minutes)}`;
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
      titel: 'Auftrag gespeichert',
      zustand: 'fertig',
    },
    {
      titel: 'Automat holt den Auftrag ab',
      zustand: abgeholt ? 'fertig' : 'laeuft',
      hinweis: abgeholt
        ? undefined
        : n.mode === 'tonight'
          ? `Wird in der Ruhezeit ausgeführt${nacht ? ` (${nacht[0]}–${nacht[1]})` : ''}.`
          : wartezeit !== null
            ? `Der Automat fragt alle ${wartezeit} Sekunden nach.`
            : 'Der Automat holt den Auftrag beim nächsten Abruf.',
    },
    {
      titel: 'Programm wird neu gestartet',
      zustand: !abgeholt ? 'offen' : laeuftFrisch ? 'fertig' : 'laeuft',
    },
    {
      titel: `${n.name} läuft wieder`,
      zustand: laeuftFrisch ? 'fertig' : 'offen',
      hinweis: laeuftFrisch && seit !== null && seit !== undefined
        ? seit < 1 ? 'Gerade eben gestartet.' : `Läuft seit ${seit} Min.`
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
export default function AutomatHealth({ onVerlauf }: {
  onVerlauf?: (eintraege: HistoryEntry[], verfuegbar: boolean) => void;
} = {}) {
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
  }

  async function load() {
    if (!parkId) { setMachines([]); setLoading(false); return; }
    setError(null);
    const h = await headers();
    if (!h) { setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.'); setLoading(false); return; }

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
      `${programm.name} (${programm.tech}) wird beendet und neu gestartet.\n\n`
      + `${programm.folge}\n\n`
      + 'Nur ausführen, wenn gerade niemand am Automaten steht.\n\nFortfahren?'
    )) return;

    // Beenden ist folgenreicher als neu starten, deshalb eine deutlichere
    // Frage: es startet NICHTS nach. Keines dieser Programme steht in einem
    // Autostart - was hier ausgeht, bleibt aus, bis es jemand wieder startet.
    if (mode === 'stop' && programm && !confirm(
      `${programm.name} (${programm.tech}) wird beendet und NICHT wieder gestartet.\n\n`
      + `${programm.folge}\n\n`
      + 'Es startet nichts nach. Das Programm bleibt aus, bis du es hier wieder '
      + 'startest oder jemand es am Automaten von Hand startet.\n\n'
      + 'Beim Verkaufsprogramm heisst das: der Automat verkauft ab sofort nichts mehr.'
      + '\n\nWirklich beenden?'
    )) return;

    setBusyMachine(`${machine.id}:${programm?.key ?? 'cancel'}`);
    setNotice(null);
    const h = await headers();
    if (!h) { setError('Sitzung abgelaufen.'); setBusyMachine(null); return; }

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
        setNotice('Der geplante Neustart wurde zurückgenommen.');
        setLaufend(null);
      } else if (mode === 'stop') {
        setNotice(
          `${programm?.name ?? 'Das Programm'} wird beendet. Das Ergebnis steht `
          + 'gleich unten im Verlauf – auch, wenn es sich nicht beenden ließ.',
        );
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
    if (!confirm(
      'Der Automat nimmt jetzt ein Foto auf und schickt es durch die ganze '
      + 'Kette – bis zum Upload.\n\nFortfahren?'
    )) return;

    setBusyMachine(`${machine.id}:testphoto`);
    setNotice(null);
    const h = await headers();
    if (!h) { setError('Sitzung abgelaufen.'); setBusyMachine(null); return; }

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
      else setNotice(
        'Testfoto beauftragt. Das Ergebnis erscheint gleich unten im Verlauf – '
        + 'auch wenn kein Bild zustande kam.',
      );
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
        titel: 'Der Automat meldet sich nicht',
        text: 'Seit einigen Minuten kommen keine Daten mehr an. Prüfe Strom und '
          + 'Internetverbindung am Automaten.',
      };
    }
    // Ein nicht hinterlegter Abholcode wiegt schwerer als jede Gerätestörung:
    // die Anlage läuft, aber Fotos und Umsatz landen beim falschen Park.
    const codeFehlt = machines.filter((m) => m.customer_code_registered === false);
    if (codeFehlt.length) {
      return {
        ton: 'bad' as Ton,
        titel: 'Abholcode nicht hinterlegt',
        text: 'Fotos werden einem fremden Park zugeordnet. Details unten beim Automaten.',
      };
    }
    if (bad.length) {
      return {
        ton: 'bad' as Ton,
        titel: bad.length === 1 ? '1 Störung' : `${bad.length} Störungen`,
        text: `Betroffen: ${bad.map((e) => e.name).join(', ')}.`,
      };
    }
    if (warn.length) {
      return {
        ton: 'warn' as Ton,
        titel: warn.length === 1 ? '1 Warnung' : `${warn.length} Warnungen`,
        text: `Betroffen: ${warn.map((e) => e.name).join(', ')}. Der Verkauf läuft weiter.`,
      };
    }
    // Kein einziger Eintrag heisst NICHT "alles in Ordnung", sondern "wir
    // wissen nichts". Ein Automat mit älterem Stand meldet weder Messungen
    // noch Geräte; ihn deshalb grün zu färben wäre eine Behauptung über etwas,
    // das niemand geprüft hat.
    if (eintraege.length === 0) {
      return {
        ton: 'unklar' as Ton,
        titel: 'Keine Gerätedaten',
        text: 'Dieser Automat meldet noch keinen Zustand seiner Programme. '
          + 'Das ist bei einer älteren Version der Automaten-Software normal – '
          + 'Fotos und Umsatz laufen davon unberührt weiter.',
      };
    }

    return {
      ton: 'ok' as Ton,
      titel: 'Alles in Ordnung',
      text: 'Alle Programme und Geräte am Automaten arbeiten normal.',
    };
  }, [machines]);

  if (!parkId) return null;

  return (
    <GlassCard className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-800">Anlagenstatus</h3>
            <ZustandsHilfe />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Was gerade am Automaten läuft &ndash; direkt dort gemessen.
            Aktualisiert sich jede Minute.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex rounded-xl bg-white/50 p-1">
            <button
              onClick={() => setDetailed(false)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${!detailed ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Einfach
            </button>
            <button
              onClick={() => setDetailed(true)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${detailed ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Ausführlich
            </button>
          </div>
          <button onClick={() => void load()} className="glass-button-secondary" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {notDeployed && (
        <Hinweis ton="warn">
          Diese Ansicht ist auf dem Server noch nicht freigeschaltet
          (<code className="rounded bg-amber-100 px-1">operator-liftpic-health</code>).
        </Hinweis>
      )}
      {error && <Hinweis ton="bad">{error}</Hinweis>}
      {notice && <Hinweis ton="ok">{notice}</Hinweis>}

      {!loading && !notDeployed && machines.length === 0 && (
        <p className="text-sm text-slate-500">Für diesen Park ist kein Automat eingerichtet.</p>
      )}

      {urteil && (
        <div className={`mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl px-3 py-2.5 ${
          urteil.ton === 'bad' ? 'bg-rose-50/80'
            : urteil.ton === 'warn' ? 'bg-amber-50/80'
              : urteil.ton === 'unklar' ? 'bg-white/50' : 'bg-emerald-50/80'
        }`}>
          <span className={`self-center h-2.5 w-2.5 shrink-0 rounded-full ${ZUSTAND[urteil.ton].punkt}`} />
          <span className={`text-sm font-semibold ${
            urteil.ton === 'bad' ? 'text-rose-800'
              : urteil.ton === 'warn' ? 'text-amber-900'
                : urteil.ton === 'unklar' ? 'text-slate-700' : 'text-emerald-800'
          }`}>
            {urteil.titel}
          </span>
          <span className="text-sm text-slate-600">{urteil.text}</span>
        </div>
      )}

      {machines.length > 0 && (
        <div className="space-y-5">
          {machines.map((m) => (
            <Automat
              key={m.id}
              m={m}
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
    </GlassCard>
  );
}

function Automat({ m, detailed, busyKey, laufend, jetzt, onRestart, onTestfoto }: {
  m: Machine; detailed: boolean; busyKey: string | null;
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

  const versteckt = eintraege.length - sichtbar.length;
  const keinNeustartMoeglich = !(m.restartable || []).length;

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

  return (
    <div className="rounded-2xl border border-white/40 bg-white/30 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-slate-800">{m.machine_label || m.machine_id}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          m.reachable ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}>
          {m.reachable ? 'verbunden' : `keine Daten seit ${seit(m.offline_minutes)}`}
        </span>
        {m.photos_taken_today !== null && (
          <span className="ml-auto text-xs text-slate-500">
            heute <b className="tabular-nums text-slate-700">{m.photos_taken_today}</b> Fotos
            {/* „0 verkauft" wäre eine Aussage über etwas, das niemand gezählt
                hat — die Bedingung oben prüft nur die aufgenommenen Fotos.
                Meldet der Automat die Verkäufe nicht, bleibt die Angabe weg. */}
            {m.photos_sold_today !== null && m.photos_sold_today !== undefined && (
              <> · <b className="tabular-nums text-slate-700">{m.photos_sold_today}</b> verkauft</>
            )}
          </span>
        )}
      </div>

      {/* Der Abholcode entscheidet, in welchem Park ein Foto landet. Ist die
          Nummer des Automaten hier nicht hinterlegt, ordnet der Server die
          Fotos einem FREMDEN Park zu - samt Umsatz. Das ist am 15.08.2026
          passiert und war vorher nirgends sichtbar. Deshalb ganz oben und
          nicht in einer Kachel versteckt. */}
      {m.customer_code_registered === false && (
        <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50/90 p-3">
          <p className="text-sm font-semibold text-rose-800">
            Abholcode {m.customer_code} ist für diesen Park nicht hinterlegt
          </p>
          <p className="mt-1 text-xs text-rose-700">
            Fotos dieses Automaten werden dadurch einem fremden Park zugeordnet –
            mitsamt Umsatz. Bitte {m.customer_code} für diesen Park eintragen
            lassen.
            {m.park_customer_codes?.length ? (
              <> Hinterlegt ist derzeit: {m.park_customer_codes.join(', ')}.</>
            ) : (
              <> Für diesen Park ist bisher gar keine Nummer hinterlegt.</>
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
        <p className="rounded-xl bg-white/40 px-3 py-3 text-sm text-slate-500">
          Dieser Automat meldet noch keine einzelnen Programme und Geräte, und
          deshalb auch keine Neustart-Knöpfe. Das ist bei einem älteren Stand
          der Automaten-Software normal
          {m.agent_version && <> (hier Version {m.agent_version})</>} &ndash;
          beides erscheint von selbst, sobald dort die neue Version läuft.
          Fotos, Verkäufe und Umsatz laufen davon unberührt weiter.
        </p>
      )}

      {testfotoOhneKachel && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/40 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">Testfoto auslösen</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Die Kamera meldet seit über zwei Tagen nichts &ndash; das heißt nicht,
              dass sie defekt ist, sondern nur, dass niemand gefahren ist. Ein
              Testfoto sagt dir, ob sie antwortet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTestfoto()}
            disabled={busyKey === `${m.id}:testphoto`}
            className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busyKey === `${m.id}:testphoto`
              ? 'wird ausgelöst…'
              : m.pending_restart?.target === 'testphoto'
                ? 'wartet auf den Automaten…'
                : 'Testfoto auslösen'}
          </button>
        </div>
      )}

      <div className="grid items-start gap-2 lg:grid-cols-2">
        {sichtbar.map((e) => (
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
        ))}
      </div>

      {versteckt > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          {versteckt} unauffällige Systemwerte ausgeblendet &ndash; unter
          &bdquo;Ausführlich&ldquo; sichtbar.
        </p>
      )}

      <div className="mt-3">
        {/* Meldet der Automat gar nichts, steht die Erklärung schon oben statt
            der Kacheln - hier wäre sie nur eine Wiederholung. */}
        {keinNeustartMoeglich && eintraege.length > 0 && (
          <p className="rounded-lg bg-white/40 px-3 py-2 text-xs text-slate-500">
            <b className="font-semibold text-slate-700">Keine Neustart-Knöpfe:</b>{' '}
            dieser Automat meldet nicht, welche Programme er neu starten kann.
            Das ist bei einem älteren Stand der Automaten-Software normal
            {m.agent_version && <> (hier Version {m.agent_version})</>} &ndash;
            nach deren Aktualisierung erscheinen die Knöpfe von selbst.
          </p>
        )}
        {detailed && (
          <p className="mt-2 text-[11px] text-slate-400">
            {/* „0 Quellen überwacht" klingt wie ein Ausfall, ist aber eine
                Wissenslücke, wenn der Automat das Feld gar nicht schickt. */}
            {typeof m.monitored_sources === 'number'
              ? `${m.monitored_sources} Quellen überwacht`
              : 'Anzahl überwachter Quellen unbekannt'}
            {m.agent_version && <> · Version {m.agent_version}</>}
            {(m.pending_health_events || 0) > 0 && <> · {m.pending_health_events} Meldung(en) warten</>}
            {m.last_restart_at && <> · zuletzt neu gestartet {new Date(m.last_restart_at).toLocaleString()}</>}
          </p>
        )}
      </div>
    </div>
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
    <div className="overflow-hidden rounded-xl border border-white/50 bg-white/40">
      <button
        type="button"
        onClick={aufklappbar ? onToggle : undefined}
        aria-expanded={offen}
        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
          aufklappbar ? 'hover:bg-white/60' : 'cursor-default'
        }`}
      >
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${z.punkt}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm font-semibold text-slate-800">{e.name}</span>
            {e.tech && <span className="text-[11px] text-slate-400">({e.tech})</span>}
          </span>
          <span className="mt-px block truncate text-xs text-slate-600">
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
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            <RotateCw className="h-3 w-3 animate-spin" />
            {pendingMode === 'tonight' ? 'heute Nacht' : 'startet neu'}
          </span>
        )}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${z.chip}`}>
          {z.label}
        </span>
        {aufklappbar && <Pfeil className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>

      {offen && (
        <div className="space-y-1.5 border-t border-white/50 bg-white/30 px-3 py-2.5 text-xs">
          {e.purpose && <p className="text-slate-500">{e.purpose}</p>}
          {/* Beim Bargeld interessiert nicht die letzte Protokollzeile, sondern
              wie viel Wechselgeld noch da ist und wie bezahlt wurde. */}
          {geld?.bestand && (
            <Muenzbestand bestand={geld.bestand} warnungen={geld.warnungen} />
          )}
          {geld?.zahlungen && (
            <Zahlungen uebersicht={geld.zahlungen} tage={geld.tage} />
          )}
          {e.gemessen && (
            <Befund titel="Gemessen" text={e.gemessen.detail} />
          )}
          {e.protokoll && (
            <Befund
              titel={`Protokoll · vor ${seit(e.protokoll.idle_minutes)}`}
              text={e.protokoll.detail}
              datei={e.protokoll.source_file?.split('\\').pop()}
            />
          )}

          {/* Testfoto: löst genau das aus, was auch die Lichtschranke auslöst.
              Steht an der Kamera-Kachel, weil man dort nachsieht, wenn kein
              Bild mehr kommt. */}
          {testfoto && (
            <div className="border-t border-white/60 pt-2">
              <button
                onClick={testfoto.ausloesen}
                disabled={testfoto.busy || testfoto.wartend}
                className="glass-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {testfoto.busy
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Camera className="h-3.5 w-3.5" />}
                Testfoto auslösen
              </button>
              <p className="mt-1 text-slate-400">
                {testfoto.wartend
                  ? 'Auftrag läuft – das Ergebnis steht gleich im Verlauf.'
                  : 'Nimmt ein Bild auf und schickt es durch die ganze Kette. '
                    + 'Erfolg zählt erst, wenn wirklich eine Bilddatei entstanden ist.'}
              </p>
            </div>
          )}

          {e.neustart && (
            <div className="border-t border-white/60 pt-2">
              {gesperrt && !wartend ? (
                <p className="text-slate-400">
                  Ein anderer Neustart ist bereits vorgemerkt. Der Automat führt
                  einen nach dem anderen aus.
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
                      Jetzt neu starten
                    </button>
                    <button
                      onClick={() => onRestart('tonight')}
                      disabled={busy || wartend}
                      className="glass-button-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      <Moon className="h-3.5 w-3.5" />
                      Heute Nacht
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
                      Beenden
                    </button>
                    {wartend && (
                      <button
                        onClick={() => onRestart('cancel')}
                        disabled={busy}
                        className="glass-button-secondary px-3 py-1.5 text-xs text-amber-900 disabled:opacity-40"
                      >
                        Zurücknehmen
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
    <div className="rounded-lg bg-white/60 px-2.5 py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Wechselgeld im Gerät
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
          <b className="font-semibold">Betrag nicht gesichert:</b> {bestand.hinweis}
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
                {sorte.anzahl}&nbsp;St.
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
              {w.stufe === 'leer' && ' – Gäste bekommen zu wenig zurück.'}
            </li>
          ))}
        </ul>
      )}

      {bestand.gemessen_am && (
        <p className="mt-1 text-[11px] text-slate-400">
          Stand {new Date(bestand.gemessen_am).toLocaleString('de-DE')} &ndash; der
          Automat schreibt ihn etwa zweimal täglich.
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
    <div className="rounded-lg bg-white/60 px-2.5 py-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Zahlungen{tage ? ` · letzte ${tage} Tage` : ''}
      </p>

      {gesamt === 0 ? (
        <p className="text-slate-500">Keine Zahlungen in diesem Zeitraum.</p>
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
              Bar <b className="tabular-nums">{uebersicht.bar_anzahl}</b>
              <span className="text-slate-400">
                ({anteileBekannt && `${Math.round(barAnteil * 100)} %, `}
                {euro(uebersicht.bar_cent)})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Karte <b className="tabular-nums">{uebersicht.karte_anzahl}</b>
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
            {uebersicht.auffaellig.length} Verkäufe mit falschem Wechselgeld
          </p>
          <ul className="mt-0.5 space-y-0.5 text-rose-700">
            {uebersicht.auffaellig.slice(0, 4).map((b, i) => (
              <li key={i} className="tabular-nums">
                {new Date(b.zeit).toLocaleString('de-DE')}:{' '}
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
    <div className="rounded-lg bg-white/60 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {titel}{datei && <span className="font-normal normal-case"> · {datei}</span>}
      </p>
      <p className="mt-0.5 break-words text-slate-700">{text}</p>
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
        aria-label="Was bedeuten die Zustände?"
        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/60 text-slate-500 transition hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-7 z-20 w-72 origin-top-left scale-95 rounded-xl border border-white/60 bg-white/95 p-3 opacity-0 shadow-lg backdrop-blur transition group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100"
      >
        <span className="mb-1.5 block text-xs font-semibold text-slate-700">
          Was die Zustände bedeuten
        </span>
        {(['ok', 'ruhig', 'warn', 'bad', 'aus', 'unklar'] as Ton[]).map((t) => (
          <span key={t} className="mt-1 flex items-start gap-2">
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ZUSTAND[t].punkt}`} />
            <span className="text-xs leading-snug">
              <span className="font-semibold text-slate-800">{ZUSTAND[t].label}</span>
              <span className="text-slate-500"> &ndash; {ZUSTAND[t].erklaerung}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function Hinweis({ ton, children }: { ton: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  const map = {
    ok: { cls: 'bg-emerald-50/80 text-emerald-700', Icon: CheckCircle2 },
    warn: { cls: 'bg-amber-50/80 text-amber-800', Icon: AlertTriangle },
    bad: { cls: 'bg-rose-50/80 text-rose-700', Icon: MinusCircle },
  }[ton];
  const Icon = map.Icon;
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${map.cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
