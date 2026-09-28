import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export interface GuestActivityRow {
  claimId: string;
  fullName: string | null;
  email: string | null;
  claimedAt: string;
  speedKmh: number | null;
  displayName: string | null;
  avatarUrl: string | null;
}

// Wer heute ein Foto freigeschaltet hat, inkl. Name/Profilbild aus dem
// passwortlosen Gast-Profil (aktuell nur bei Tarzans gefuellt - andere
// Parks bekommen einfach displayName/avatarUrl: null).
export async function fetchGuestActivity(parkId: string): Promise<GuestActivityRow[]> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) return [];

  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-guest-activity?park_id=${encodeURIComponent(parkId)}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
      },
    },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return (body?.data?.guests ?? []) as GuestActivityRow[];
}
