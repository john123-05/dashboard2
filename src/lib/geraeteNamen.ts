/**
 * Ein Verzeichnis für alle Namen, die im Dashboard auftauchen können.
 *
 * Warum zentral: dieselben Dinge erreichen die Seite aus drei Richtungen -
 * direkt vom Automaten (`operator-liftpic-health`), über die Auswertung der
 * hochgeladenen Dateien (`park-dashboard-data`) und aus der älteren
 * `system-health`. Jede Quelle schreibt den Namen anders, und keine davon
 * liefert eine Erklärung mit. Ohne ein gemeinsames Verzeichnis steht auf
 * derselben Seite "3GerTis Steuerung", "Kamera" und "Kamera-Software"
 * nebeneinander - für den Betreiber drei verschiedene Dinge.
 *
 * Regel für jeden Eintrag: **vorne, was es tut. Dahinter, wie es auf dem PC
 * heisst.** Der Klarname muss ohne Vorwissen verständlich sein; der technische
 * Name ist das, was ein Techniker am Telefon hören will.
 */

import { translate } from './i18n';

export type Quelle = 'automat' | 'server' | 'unbekannt';

export type Benennung = {
  /** Was es tut - in Worten, die keine Vorkenntnis brauchen. */
  klar: string;
  /** Wie es auf dem PC heisst. Leer, wenn es keinen eigenen Namen hat. */
  tech: string;
  /** Ein Satz dazu, wofür es gut ist. */
  zweck: string;
  /** Steht es am Automaten oder auf unseren Servern? */
  quelle: Quelle;
};

type Eintrag = Benennung & { muster: RegExp };

/**
 * Reihenfolge zählt: das erste passende Muster gewinnt. Speziellere Muster
 * stehen deshalb vor allgemeineren ("Kartenterminal-Prüfung" vor
 * "Kartenterminal").
 */
const VERZEICHNIS: Eintrag[] = [
  // ---------------------------------------------------------------- Automat
  {
    muster: /^(kamera[- ]?software|3ger\s*tis.*|kamera(\s*\(tiscapture\))?|tiscapture|camera_?capture|camera26)$/i,
    klar: 'Kamera-Software', tech: '3GerTis', quelle: 'automat',
    zweck: 'Nimmt das Foto auf, sobald die Lichtschranke auslöst.',
  },
  {
    muster: /^(lichtschranke.*|aidatest|speedshot)$/i,
    klar: 'Lichtschranke', tech: 'AidaTest', quelle: 'automat',
    zweck: 'Erkennt Gäste und löst die Kamera aus.',
  },
  {
    muster: /^(verkaufsprogramm.*|photoviewer.*)$/i,
    klar: 'Verkaufsprogramm', tech: 'PhotoViewer', quelle: 'automat',
    zweck: 'Bildschirm am Automaten: Fotos, Zahlung, Druck.',
  },
  {
    muster: /^(münzeinnahmen|muenzeinnahmen|münzstatistik|muenzstatistik|coinstats)$/i,
    klar: 'Münzeinnahmen', tech: 'CoinStats', quelle: 'automat',
    zweck: 'Tagesabrechnung der Münzkasse.',
  },
  {
    muster: /^(münzprüfer|muenzpruefer|nri.*|coin\s*changer)$/i,
    klar: 'Münzprüfer', tech: 'NRI CoinCharger', quelle: 'automat',
    zweck: 'Nimmt Münzen an und gibt Wechselgeld.',
  },
  {
    muster: /^(kartenterminal[- ]?prüfung|kartenterminal[- ]?pruefung|terminal[- ]?prüfung|checkingtool)$/i,
    klar: 'Kartenterminal-Prüfung', tech: 'CheckingTool', quelle: 'automat',
    zweck: 'Prüft, ob das Terminal antwortet.',
  },
  {
    muster: /^(kartenterminal|zvt.*|easyzvt)$/i,
    klar: 'Kartenterminal', tech: 'ZVT', quelle: 'automat',
    zweck: 'Bezahlterminal für EC und Kreditkarte.',
  },
  {
    muster: /^(drucker|printer|printsettings)$/i,
    klar: 'Drucker', tech: 'Windows-Drucker', quelle: 'automat',
    zweck: 'Gibt die gekauften Bilder aus.',
  },
  {
    // "Liftpic Sync 7623" kommt mit angehängtem Kameracode aus park-dashboard-data.
    muster: /^(uploader|bild[- ]?upload|liftpic[- ]?sync.*)$/i,
    klar: 'Uploader', tech: 'liftpic-sync', quelle: 'automat',
    zweck: 'Lädt die Fotos zu Liftpictures hoch.',
  },
  {
    muster: /^(statistik[- ]?e-?mail|tagesbericht.*)$/i,
    klar: 'Statistik-E-Mail', tech: 'Tagesbericht', quelle: 'automat',
    zweck: 'Täglicher Umsatzbericht. Nebenfunktion.',
  },
  {
    muster: /^(abholcode|code-?vorschrift)$/i,
    klar: 'Abholcode', tech: 'Settings.xml', quelle: 'automat',
    zweck: 'Legt fest, welche Nummer auf den Beleg gedruckt wird.',
  },
  {
    muster: /^(internetverbindung|netzwerk|internetconnection)$/i,
    klar: 'Internetverbindung', tech: 'Netzwerk', quelle: 'automat',
    zweck: 'Nötig für Upload und Kartenzahlung.',
  },
  {
    muster: /^(anschlüsse|anschluesse|com-?schnittstellen)$/i,
    klar: 'Anschlüsse', tech: 'COM-Schnittstellen', quelle: 'automat',
    zweck: 'Steckplätze für Lichtschranke und Münzprüfer.',
  },
  {
    muster: /^(speicherplatz|festplatte|disk)$/i,
    klar: 'Speicherplatz', tech: 'Festplatte', quelle: 'automat',
    zweck: 'Freier Speicher für neue Fotos.',
  },
  {
    muster: /^(arbeitsspeicher|ram|memory)$/i,
    klar: 'Arbeitsspeicher', tech: 'RAM', quelle: 'automat',
    zweck: 'Arbeitsspeicher des PCs.',
  },
  {
    muster: /^(pc-?laufzeit|uptime)$/i,
    klar: 'PC-Laufzeit', tech: 'Windows', quelle: 'automat',
    zweck: 'Laufzeit seit dem letzten Neustart.',
  },
  {
    muster: /^(uhrzeit|clock)$/i,
    klar: 'Uhrzeit', tech: 'Windows-Zeitdienst', quelle: 'automat',
    zweck: 'Steht im Abholcode jedes Fotos. Geht sie falsch, finden Gäste ihre Bilder nicht.',
  },

  // ----------------------------------------------------------------- Server
  {
    muster: /^external database$/i,
    klar: 'Datenbank', tech: 'Supabase', quelle: 'server',
    zweck: 'Speichert Fotos, Verkäufe und Einstellungen.',
  },
  {
    muster: /^photo upload service$/i,
    klar: 'Foto-Ablage', tech: 'Storage', quelle: 'server',
    zweck: 'Nimmt die hochgeladenen Bilder entgegen.',
  },
  {
    muster: /^payment processing$/i,
    klar: 'Zahlungsabwicklung', tech: 'Payments', quelle: 'server',
    zweck: 'Verbucht die Online-Käufe der Gäste.',
  },
  {
    muster: /^cdn \/ image delivery$/i,
    klar: 'Bild-Auslieferung', tech: 'CDN', quelle: 'server',
    zweck: 'Liefert die Fotos schnell an die Gäste aus.',
  },
  {
    muster: /^stripe api$/i,
    klar: 'Online-Bezahlung', tech: 'Stripe', quelle: 'server',
    zweck: 'Wickelt Kartenzahlungen im Webshop ab.',
  },
];

/**
 * Namen in Klarname + technischen Namen zerlegen.
 *
 * Unbekannte Namen kommen unverändert zurück und gelten als `unbekannt` - sie
 * verschwinden dadurch nirgends, werden aber auch nicht falsch einsortiert.
 * Trägt der Name die Technik bereits in Klammern ("Kamera (TIScapture)"), wird
 * sie herausgelöst statt doppelt angezeigt.
 */
export function benenne(rohname: string | null | undefined): Benennung {
  const name = (rohname || '').trim();
  if (!name) return { klar: 'Unbenannt', tech: '', zweck: '', quelle: 'unbekannt' };

  for (const eintrag of VERZEICHNIS) {
    if (eintrag.muster.test(name)) {
      return {
        klar: eintrag.klar, tech: eintrag.tech,
        zweck: eintrag.zweck, quelle: eintrag.quelle,
      };
    }
  }

  const klammer = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (klammer) {
    return {
      klar: klammer[1].trim(), tech: klammer[2].trim(),
      zweck: '', quelle: 'unbekannt',
    };
  }
  return { klar: name, tech: '', zweck: '', quelle: 'unbekannt' };
}

/** Steht dieses Ding am Automaten? Entscheidet, wo es angezeigt gehört. */
export function stehtAmAutomaten(name: string | null | undefined): boolean {
  return benenne(name).quelle === 'automat';
}

/* ------------------------------------------------------------------ Anzeige in anderen Sprachen
 * Die Namen oben bleiben die internen (deutschen) Schlüssel – der Server blendet z. B. Geräte über diese
 * Namen aus. Übersetzt wird erst beim Anzeigen. Unbekanntes bleibt, wie es ist.
 */

const NAME_KEY: Record<string, string> = {
  'Kamera-Software': 'camera_sw', 'Lichtschranke': 'light_barrier', 'Verkaufsprogramm': 'sales_program',
  'Münzeinnahmen': 'coin_income', 'Münzprüfer': 'coin_acceptor', 'Kartenterminal-Prüfung': 'terminal_check',
  'Kartenterminal': 'card_terminal', 'Drucker': 'printer', 'Uploader': 'uploader', 'Statistik-E-Mail': 'stats_mail',
  'Abholcode': 'pickup_code', 'Internetverbindung': 'internet', 'Anschlüsse': 'ports', 'Speicherplatz': 'disk',
  'Arbeitsspeicher': 'ram', 'PC-Laufzeit': 'uptime', 'Uhrzeit': 'clock', 'Datenbank': 'database', 'Foto-Ablage': 'photo_storage',
  'Zahlungsabwicklung': 'payments', 'Bild-Auslieferung': 'delivery', 'Online-Bezahlung': 'online_pay', 'Unbenannt': 'unnamed',
  'Sonstige Protokolle': 'other_logs', 'Testfoto': 'test_photo', 'Kamera eingestellt': 'camera_set',
  'Wechselgeld stimmt nicht': 'change_wrong', 'Wechselgeld': 'change', 'Kamera / Lichtschranke': 'camera_barrier',
  'Neustart fehlgeschlagen': 'restart_failed', 'Testfoto fehlgeschlagen': 'test_failed',
  'Verkaufsprogramm (Fehler)': 'sales_error', 'Verkaufsprogramm (Ablauf)': 'sales_flow',
  'Fehlerprotokoll': 'error_log', 'Windows-Drucker': 'win_printer', 'Netzwerk': 'network', 'COM-Schnittstellen': 'com_ports',
  'Festplatte': 'harddisk', 'Windows-Zeitdienst': 'time_service', 'Tagesbericht': 'daily_report',
};
const PURPOSE_KEY: Record<string, string> = Object.fromEntries(
  VERZEICHNIS.filter((e) => e.zweck && NAME_KEY[e.klar]).map((e) => [e.zweck, `${NAME_KEY[e.klar]}_p`]),
);
function tr(key: string, fallback: string, params?: Record<string, string | number>) {
  const v = translate(`dev.${key}`, params);
  return v === `dev.${key}` ? fallback : v;
}

/** Gerätename in der Sprache des Nutzers (auch zusammengesetzte wie „PhotoViewer, Fehlerprotokoll“). */
export function deviceLabel(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  if (NAME_KEY[n]) return tr(NAME_KEY[n], n);
  if (n.includes(', ')) return n.split(', ').map((p) => (NAME_KEY[p] ? tr(NAME_KEY[p], p) : p)).join(', ');
  return n;
}

/** Beschreibung („Nimmt das Foto auf …“) in der Sprache des Nutzers. */
export function devicePurpose(text: string | null | undefined): string {
  const s = (text ?? '').trim();
  return PURPOSE_KEY[s] ? tr(PURPOSE_KEY[s], s) : s;
}

/** Verlaufseintrag des Automaten („Uploader: Stoerung“, „Verbindung nach 31 Minuten …“) übersetzen. */
export function historyText(text: string | null | undefined): string {
  let s = (text ?? '').trim();
  if (!s) return s;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^Verbindung nach (\d+) Minuten wiederhergestellt$/))) return tr('h_reconnected', s, { n: m[1] });
  if (s === 'Verbindung zum Server verloren') return tr('h_server_lost', s);
  if (/^Keine Verbindung zum Server/.test(s)) return tr('h_no_server', s);
  if (s === 'Ein neues Bild wartet auf einen Neustart des Verkaufsprogramms') return tr('h_new_image', s);
  if ((m = s.match(/^(.+) neu gestartet$/))) return tr('h_restarted', s, { name: deviceLabel(m[1]) });
  s = s.replace(/^Ursache des Ausfalls:/, tr('h_cause', 'Ursache des Ausfalls:'));
  if ((m = s.match(/^([^:]+): (.*)$/s))) {
    const head = deviceLabel(m[1]);
    let rest = m[2];
    if (/^St(oe|ö)rung$/.test(rest)) rest = tr('h_fault', rest);
    else if (rest === 'Warnung') rest = tr('h_warning', rest);
    else if (rest === 'Verkaufsprogramm ist nicht wieder hochgekommen') rest = tr('h_not_back', rest);
    else if (/^Kein Bild entstanden\./.test(rest)) rest = tr('h_no_image', rest);
    else if (/^Testfoto aufgenommen und hochgeladen/.test(rest)) rest = rest.replace(/^Testfoto aufgenommen und hochgeladen/, tr('h_test_ok', 'Testfoto aufgenommen und hochgeladen'));
    return `${head}: ${rest}`;
  }
  return s;
}
