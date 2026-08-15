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
