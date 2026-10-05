import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export type EquipmentKategorie = 'Automat' | 'Kamera' | 'Zubehoer' | 'Software' | 'Sonstiges';
export type EquipmentStatus = 'vorhanden' | 'empfohlen' | 'bestellt';

export interface EquipmentItem {
  id: string;
  kategorie: EquipmentKategorie;
  titel: string;
  beschreibung: string | null;
  status: EquipmentStatus;
  geschaetzter_mehrumsatz_cents: number | null;
  sortierung: number;
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
