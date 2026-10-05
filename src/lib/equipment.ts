import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export type EquipmentKategorie = 'Automat' | 'Kamera' | 'Zubehoer' | 'Software' | 'Webshop' | 'Sonstiges';
export type EquipmentStatus = 'vorhanden' | 'empfohlen' | 'bestellt';
export type Bestellstatus = 'bestellung_erhalten' | 'in_bearbeitung' | 'versendet' | 'installiert';

export interface EquipmentItem {
  id: string;
  kategorie: EquipmentKategorie;
  titel: string;
  beschreibung: string | null;
  status: EquipmentStatus;
  geschaetzter_mehrumsatz_cents: number | null;
  mehrwert_text: string | null;
  bestellstatus: Bestellstatus | null;
  sortierung: number;
  image_url: string | null;
  before_image_url: string | null;
  after_image_url: string | null;
}

/** Vom Staff gepflegte "Konfiguration/Shop"-Liste - was der Park hat / haben könnte. */
export async function fetchParkEquipment(parkId: string): Promise<EquipmentItem[]> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) return [];
  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-park-equipment?park_id=${encodeURIComponent(parkId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return (body?.items ?? []) as EquipmentItem[];
}

/**
 * "Jetzt anfragen"-Button: legt eine Staff-Benachrichtigung an, keine Bestellung.
 * Entweder zu einem konkreten Ausstattungs-Eintrag (itemId) oder frei (label,
 * z. B. "Fotopapier nachbestellen") - absichtlich derselbe Mechanismus fuer
 * beides, damit sich das fuer den Betreiber gleich anfuehlt.
 */
export async function meldeAusstattungsInteresse(
  parkId: string,
  target: { itemId: string } | { label: string },
): Promise<void> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Nicht angemeldet');

  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-equipment-interest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      park_id: parkId,
      ...('itemId' in target ? { item_id: target.itemId } : { label: target.label }),
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
}
