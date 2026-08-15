import { externalSupabase } from './supabase';

export interface BrowsablePhoto {
  id: string;
  externalCode: string | null;
  imageUrl: string | null;
  capturedAt: string;
  isPaid: boolean;
  speedKmh: number | null;
  /**
   * Vom Dashboard ausgelöstes Testfoto.
   *
   * Sieht aus wie jedes andere Foto, zählt aber nirgends als Verkauf - der
   * Umsatz lässt diese Zeilen bewusst aus.
   */
  isTest: boolean;
}

const SELECT_COLUMNS =
  'id, external_code, storage_bucket, storage_path, captured_at, created_at, is_paid, speed_kmh, is_test';

function toImageUrl(bucket: string | null, path: string | null): string | null {
  if (!bucket || !path) return null;
  return `https://kvpcwlcfgmsmarjtwpsx.supabase.co/storage/v1/object/public/${bucket}/${path}`;
}

function toBrowsablePhoto(row: Record<string, unknown>): BrowsablePhoto {
  const speed = row.speed_kmh as number | null;
  return {
    id: row.id as string,
    externalCode: (row.external_code as string) ?? null,
    imageUrl: toImageUrl(row.storage_bucket as string | null, row.storage_path as string | null),
    capturedAt: (row.captured_at ?? row.created_at) as string,
    isPaid: Boolean(row.is_paid),
    // 0/null both mean "no real speed measurement" (many rows predate speed
    // tracking, or the camera doesn't do speed matching) - only show a value
    // when it's an actual positive reading.
    speedKmh: typeof speed === 'number' && speed > 0 ? speed : null,
    isTest: row.is_test === true,
  };
}

export async function fetchRecentPhotos(parkId: string, limit = 24): Promise<BrowsablePhoto[]> {
  const { data, error } = await externalSupabase
    .from('photos')
    .select(SELECT_COLUMNS)
    .eq('park_id', parkId)
    .order('captured_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []).map(toBrowsablePhoto);
}

export async function searchPhotosByCode(parkId: string, code: string): Promise<BrowsablePhoto[]> {
  const trimmed = code.trim();
  if (!trimmed) return [];

  const { data, error } = await externalSupabase
    .from('photos')
    .select(SELECT_COLUMNS)
    .eq('park_id', parkId)
    .ilike('external_code', `%${trimmed}%`)
    .order('captured_at', { ascending: false })
    .limit(48);

  if (error) throw new Error(error.message);
  return (data || []).map(toBrowsablePhoto);
}

// Fuzzy time search: given a rough time, return the few photos CLOSEST to it
// (within a +/- window), so kiosk staff don't have to hit the exact minute.
export async function searchPhotosByDateTime(
  parkId: string,
  isoDateTime: string,
  opts?: { windowMinutes?: number; limit?: number },
): Promise<BrowsablePhoto[]> {
  const center = new Date(isoDateTime);
  if (Number.isNaN(center.getTime())) return [];

  const windowMinutes = opts?.windowMinutes ?? 10;
  const limit = opts?.limit ?? 4;
  const from = new Date(center.getTime() - windowMinutes * 60_000).toISOString();
  const to = new Date(center.getTime() + windowMinutes * 60_000).toISOString();

  const { data, error } = await externalSupabase
    .from('photos')
    .select(SELECT_COLUMNS)
    .eq('park_id', parkId)
    .gte('captured_at', from)
    .lte('captured_at', to)
    .order('captured_at', { ascending: true })
    .limit(60);

  if (error) throw new Error(error.message);
  const rows = (data || []).map(toBrowsablePhoto);
  // Keep the N closest to the entered time, then show them chronologically.
  return rows
    .map((p) => ({ p, dist: Math.abs(new Date(p.capturedAt).getTime() - center.getTime()) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((x) => x.p)
    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
}

// Per-park claim page. First a fixed mapping (Imst, Tarzans); can become a
// per-park setting later.
const CLAIM_BASE_BY_PARK: Record<string, string> = {
  '85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14': 'https://liftpictures-fotos.de', // Imster Bergbahnen
  'e2da6436-6a83-4c39-add3-5f99eb6bd897': 'https://liftpictures-fotos-tarzans.de', // CSS-Alpine / Tarzans
};

// Claim link a guest can open to get their photo (via email) - the DB code is
// correct even when the printed QR was mis-assigned, so this rescues the
// "Foto nicht gefunden" case at the kiosk.
export function claimLinkFor(parkId: string | null, externalCode: string | null): string | null {
  if (!parkId || !externalCode) return null;
  const base = CLAIM_BASE_BY_PARK[parkId];
  if (!base) return null;
  return `${base}/claim?code=${encodeURIComponent(externalCode)}`;
}
