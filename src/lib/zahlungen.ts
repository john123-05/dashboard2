/**
 * Zahlungsdaten des Automaten: bar oder Karte, Wechselgeld, Münzbestand.
 *
 * Eine Stelle für beide Seiten - Umsatz zeigt die Übersicht, Käufe verknüpft
 * die Einzelkäufe. Der Automat wertet seine eigenen Protokolle aus (Münzen,
 * Kartenbelege, Verkaufsliste) und schickt das Ergebnis im Heartbeat mit; hier
 * wird es nur abgeholt.
 */
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;

export type Muenzbestand = {
  gemessen_am: string | null;
  sorten: { cent: number; anzahl: number; wert_cent: number }[];
  summe_cent: number;
};

export type Muenzwarnung = {
  cent: number; anzahl: number; stufe: 'leer' | 'knapp'; text: string;
};

export type Zahlungsbefund = {
  zeit: string;
  foto: string;
  /** Bildnummer des Automaten - der Schlüssel zum Foto in der Datenbank. */
  bildnummer: number | null;
  betrag_cent: number;
  zahlungsart: 'bar' | 'karte' | 'unbekannt' | string;
  eingeworfen_cent: number;
  ausgezahlt_cent: number;
  erwartetes_wechselgeld_cent: number;
  abweichung_cent: number;
  sicher: boolean;
  hinweis: string;
};

export type Zahlungsuebersicht = {
  bar_anzahl: number; bar_cent: number;
  karte_anzahl: number; karte_cent: number;
  unbekannt_anzahl: number;
  bar_anteil: number | null; karte_anteil: number | null;
  auffaellig: Zahlungsbefund[];
  letzte?: Zahlungsbefund[];
};

export type ZahlungsAutomat = {
  id: string; machine_id: string; machine_label: string | null;
  coin_inventory?: Muenzbestand | null;
  coin_warnings?: Muenzwarnung[];
  payments?: Zahlungsuebersicht | null;
  payments_days?: number | null;
  prices_cent?: number[] | null;
};

export async function ladeZahlungen(parkId: string): Promise<ZahlungsAutomat[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json().catch(() => null);
  return (body?.data?.machines || []) as ZahlungsAutomat[];
}

/**
 * Zahlungen nach Bildnummer, über alle Automaten des Parks.
 *
 * Bewusst über die Bildnummer und nicht über die Uhrzeit: der Aufnahmezeitpunkt
 * eines Fotos ist nicht sein Kaufzeitpunkt - dazwischen liegt, wie lange der
 * Gast am Bildschirm stand. Eine Zuordnung über die Zeit wäre geraten.
 */
export function nachBildnummer(
  automaten: ZahlungsAutomat[],
): Map<number, Zahlungsbefund> {
  const karte = new Map<number, Zahlungsbefund>();
  for (const automat of automaten) {
    for (const befund of automat.payments?.letzte ?? []) {
      if (befund.bildnummer === null || befund.bildnummer === undefined) continue;
      // Bei mehreren Treffern gewinnt der neuere: Bildnummern laufen taeglich
      // neu los, der juengste Eintrag gehoert zum aktuellen Foto.
      const vorhanden = karte.get(befund.bildnummer);
      if (!vorhanden || befund.zeit > vorhanden.zeit) {
        karte.set(befund.bildnummer, befund);
      }
    }
  }
  return karte;
}

export function euro(cent: number | null | undefined): string {
  if (cent === null || cent === undefined) return '–';
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
