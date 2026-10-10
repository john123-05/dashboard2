import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

// Kontakt-Segmente (docs/PRODUKT_PLAN.md, C3): Function `operator-contact-segments`.

export interface ContactSegment {
  id: string;
  name: string;
  member_count: number;
}

async function call<T>(init: RequestInit, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-contact-segments?${new URLSearchParams(query).toString()}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body?.data as T;
}

const post = <T,>(parkId: string, payload: Record<string, unknown>) =>
  call<T>({ method: 'POST', body: JSON.stringify({ park_id: parkId, ...payload }) }, { park_id: parkId });

export const fetchSegments = async (parkId: string): Promise<ContactSegment[]> =>
  (await call<{ segments: ContactSegment[] }>({ method: 'GET' }, { park_id: parkId })).segments ?? [];
export const fetchSegmentMembers = async (parkId: string, segmentId: string): Promise<string[]> =>
  (await call<{ claim_ids: string[] }>({ method: 'GET' }, { park_id: parkId, segment_id: segmentId })).claim_ids ?? [];
export const createSegment = (parkId: string, name: string) => post<{ id: string }>(parkId, { action: 'create', name });
export const deleteSegment = (parkId: string, segmentId: string) => post<unknown>(parkId, { action: 'delete', segment_id: segmentId });
export const addToSegment = (parkId: string, segmentId: string, claimIds: string[]) =>
  post<{ added: number }>(parkId, { action: 'add', segment_id: segmentId, claim_ids: claimIds });
export const removeFromSegment = (parkId: string, segmentId: string, claimIds: string[]) =>
  post<{ removed: number }>(parkId, { action: 'remove', segment_id: segmentId, claim_ids: claimIds });
