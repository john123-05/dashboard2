// Deliberately uses the main dashboard's own Supabase client (../../lib/supabase,
// project xcrxltiiovpoladpaewd) rather than this staff area's usual `supabaseBrowser`
// (project kvpcwlcfgmsmarjtwpsx). media_assets lives in dashboard2's own project,
// not the shared Plose/Oderwitz/Imst production project.
import { supabase } from '../../lib/supabase';
import { supabaseBrowser } from './supabase';

export interface MediaAsset {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  keywords: string[];
  storage_path: string;
  media_type: 'image' | 'video';
  file_size_bytes: number | null;
  source_folder: string | null;
  created_at: string;
}

const MEDIA_LIBRARY_BASE =
  'https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/media-library';

export function mediaAssetUrl(storagePath: string): string {
  return `${MEDIA_LIBRARY_BASE}/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
}

export async function fetchCategories(): Promise<string[]> {
  const { data, error } = await supabase.from('media_assets').select('category');
  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.category))).sort();
}

export async function fetchSubcategories(category?: string): Promise<string[]> {
  let query = supabase.from('media_assets').select('subcategory');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) throw error;

  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.subcategory?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
}

const MEDIA_PAGE_SIZE = 200;

export interface MediaSearchResult {
  items: MediaAsset[];
  total: number;
}

export async function searchMediaAssets(params: {
  query?: string;
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
}): Promise<MediaSearchResult> {
  const limit = params.limit ?? MEDIA_PAGE_SIZE;
  const offset = params.offset ?? 0;

  let q = supabase
    .from('media_assets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (params.category) {
    q = q.eq('category', params.category);
  }

  if (params.subcategory) {
    q = q.eq('subcategory', params.subcategory);
  }

  if (params.query && params.query.trim()) {
    const term = params.query.trim().toLowerCase();
    q = q.or(
      `title.ilike.%${term}%,subcategory.ilike.%${term}%,keywords.cs.{${term}}`,
    );
  }

  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

const FUNCTIONS_BASE = 'https://xcrxltiiovpoladpaewd.supabase.co/functions/v1';

async function getStaffAccessToken(): Promise<string> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Keine aktive Staff-Sitzung gefunden. Bitte neu einloggen.');
  }
  return token;
}

export interface UploadMediaAssetInput {
  file: File;
  title: string;
  category: string;
  subcategory?: string;
  keywords?: string;
}

// Goes through the upload-media-asset edge function rather than writing
// directly — the function verifies the caller against the real admin_users
// list (in the other project) before touching storage or the table.
export async function uploadMediaAsset(input: UploadMediaAssetInput): Promise<MediaAsset> {
  const staffAccessToken = await getStaffAccessToken();

  const form = new FormData();
  form.set('staffAccessToken', staffAccessToken);
  form.set('file', input.file, input.file.name);
  form.set('title', input.title);
  form.set('category', input.category);
  if (input.subcategory) form.set('subcategory', input.subcategory);
  if (input.keywords) form.set('keywords', input.keywords);

  const res = await fetch(`${FUNCTIONS_BASE}/upload-media-asset`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body?.error || `Upload fehlgeschlagen (${res.status})`);
  }

  return body.asset as MediaAsset;
}

export interface UpdateMediaAssetInput {
  id: string;
  title?: string;
  category?: string;
  subcategory?: string;
  keywords?: string[];
}

export async function updateMediaAsset(input: UpdateMediaAssetInput): Promise<MediaAsset> {
  const staffAccessToken = await getStaffAccessToken();

  const res = await fetch(`${FUNCTIONS_BASE}/update-media-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffAccessToken, ...input }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body?.error || `Aktualisierung fehlgeschlagen (${res.status})`);
  }

  return body.asset as MediaAsset;
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const staffAccessToken = await getStaffAccessToken();

  const res = await fetch(`${FUNCTIONS_BASE}/delete-media-asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffAccessToken, id }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(body?.error || `Löschen fehlgeschlagen (${res.status})`);
  }
}
