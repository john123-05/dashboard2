import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

// Wie lange der Automat still sein darf, bevor die Kamerasoftware als nicht
// erreichbar gilt (der Agent meldet sich etwa alle 75 Sekunden).
const MAX_OFFLINE_MINUTES = 15;

type HealthMachine = {
  camera_settings?: { fehler?: string | null } | null;
  offline_minutes?: number | null;
};

/**
 * Kann der Betreiber die Kamera hier wirklich einstellen? Nur wenn mindestens
 * ein Automat gerade erreichbar ist und seine Kameraeinstellungen gemeldet hat.
 * Sonst bleibt die Seite „Kamera“ verborgen, weil Einstellen und Neustarten
 * ohnehin nicht ankommen würde.
 */
export async function fetchCameraControlAvailable(parkId: string): Promise<boolean> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) return false;
  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health?park_id=${encodeURIComponent(parkId)}`,
    { headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY } },
  );
  if (!res.ok) return false;
  const body = await res.json().catch(() => null);
  const machines = (body?.data?.machines ?? []) as HealthMachine[];
  return machines.some(
    (m) =>
      !!m.camera_settings &&
      !m.camera_settings.fehler &&
      (m.offline_minutes == null || m.offline_minutes <= MAX_OFFLINE_MINUTES),
  );
}
