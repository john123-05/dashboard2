import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export interface GuestUser {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  leaderboardOptOut: boolean;
  createdAt: string;
  claimCount: number;
  bestSpeedKmh: number | null;
  lastClaimAt: string | null;
}

export interface LeaderboardRow {
  rank: number;
  speedKmh: number;
  capturedAt: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface GuestOverview {
  users: GuestUser[];
  leaderboard: { date: string; totalToday: number; rows: LeaderboardRow[] };
}

export type GuestDeleteAction = 'delete_profile' | 'delete_user';

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
  };
}

// Registrierte Gaeste (Profil mit Namen = in der Tagesbestenliste eingetragen)
// und die Live-Bestenliste von heute.
export async function fetchGuestOverview(parkId: string): Promise<GuestOverview> {
  const headers = await authHeaders();
  if (!headers) return { users: [], leaderboard: { date: '', totalToday: 0, rows: [] } };

  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-guest-users?park_id=${encodeURIComponent(parkId)}`,
    { headers },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.data as GuestOverview;
}

// delete_profile: Profil weg (Name, Bild, Bestenliste), Freischaltungen bleiben.
// delete_user:    zusaetzlich Name/E-Mail/Telefon/Adresse in den Freischaltungen
//                 geleert und Marketing-Opt-in entzogen.
export async function deleteGuest(parkId: string, email: string, action: GuestDeleteAction): Promise<void> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Nicht angemeldet');

  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-guest-users`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ park_id: parkId, email, action }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
}
