import { supabaseBrowser } from './supabase';

const supabaseUrl =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey =
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL|VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY',
  );
}

const resolvedSupabaseUrl = supabaseUrl;
const resolvedAnonKey = anonKey;

const routeMap: Record<string, string> = {
  '/api/admin/parks': 'admin-parks',
  '/api/admin/park-prefixes': 'admin-park-prefixes',
  '/api/admin/attractions': 'admin-attractions',
  '/api/admin/park-cameras': 'admin-park-cameras',
  '/api/admin/preview-parse': 'admin-preview-parse',
  '/api/admin/support': 'admin-support',
  '/api/admin/website-requests': 'admin-website-requests',
  '/api/admin/email-leads': 'admin-email-leads',
  '/api/support-sync': 'support-sync',
};

function isLikelyJwt(token: string): boolean {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token);
}

async function resolveAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabaseBrowser.auth.refreshSession();
    const refreshed = data.session?.access_token;
    return refreshed && isLikelyJwt(refreshed) ? refreshed : null;
  }

  const { data } = await supabaseBrowser.auth.getSession();
  const current = data.session?.access_token;
  if (current && isLikelyJwt(current)) {
    return current;
  }

  const { data: refreshedData } = await supabaseBrowser.auth.refreshSession();
  const refreshed = refreshedData.session?.access_token;
  return refreshed && isLikelyJwt(refreshed) ? refreshed : null;
}

async function normalizeHeaders(initHeaders?: HeadersInit, forceRefreshToken = false): Promise<Headers> {
  const headers = new Headers(initHeaders || {});

  if (!headers.has('apikey')) {
    headers.set('apikey', resolvedAnonKey);
  }

  headers.delete('authorization');
  const token = await resolveAccessToken(forceRefreshToken);
  if (token) headers.set('authorization', `Bearer ${token}`);

  return headers;
}

function toEdgeUrl(input: string | URL): string | null {
  const parsed = new URL(typeof input === 'string' ? input : input.toString(), window.location.origin);
  const mappedFunction = routeMap[parsed.pathname];

  if (!mappedFunction) return null;

  return `${resolvedSupabaseUrl}/functions/v1/${mappedFunction}${parsed.search}`;
}

async function isInvalidJwtResponse(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;

  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return false;

  const payload = body as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message : '';
  const error = typeof payload.error === 'string' ? payload.error : '';
  const combined = `${message} ${error}`.toLowerCase();

  return combined.includes('invalid jwt') || combined.includes('jwt expired');
}

export async function edgeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const edgeUrl = toEdgeUrl(input);
  if (!edgeUrl) {
    return fetch(input, init);
  }

  const headers = await normalizeHeaders(init.headers);
  let response = await fetch(edgeUrl, { ...init, headers });

  if (await isInvalidJwtResponse(response)) {
    const retryHeaders = await normalizeHeaders(init.headers, true);
    response = await fetch(edgeUrl, { ...init, headers: retryHeaders });
    if (await isInvalidJwtResponse(response)) {
      await supabaseBrowser.auth.signOut();
    }
  }

  return response;
}
