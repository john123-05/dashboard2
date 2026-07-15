import { externalSupabase } from './supabase';

export interface BrowsablePhoto {
  id: string;
  externalCode: string | null;
  imageUrl: string | null;
  capturedAt: string;
  isPaid: boolean;
  speedKmh: number | null;
}

const SELECT_COLUMNS =
  'id, external_code, storage_bucket, storage_path, captured_at, created_at, is_paid, speed_kmh';

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

export async function searchPhotosByDateTime(parkId: string, isoDateTime: string): Promise<BrowsablePhoto[]> {
  const center = new Date(isoDateTime);
  if (Number.isNaN(center.getTime())) return [];

  const windowMinutes = 30;
  const from = new Date(center.getTime() - windowMinutes * 60_000).toISOString();
  const to = new Date(center.getTime() + windowMinutes * 60_000).toISOString();

  const { data, error } = await externalSupabase
    .from('photos')
    .select(SELECT_COLUMNS)
    .eq('park_id', parkId)
    .gte('captured_at', from)
    .lt('captured_at', to)
    .order('captured_at', { ascending: true })
    .limit(60);

  if (error) throw new Error(error.message);
  return (data || []).map(toBrowsablePhoto);
}
