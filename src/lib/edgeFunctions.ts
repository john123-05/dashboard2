import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';

interface EdgeFunctionResponse<T = any> {
  data: T | null;
  error: string | null;
}

async function parseEdgeErrorResponse(response: Response): Promise<string> {
  const errorText = await response.text();
  let errorData;
  try {
    errorData = JSON.parse(errorText);
  } catch {
    errorData = { error: errorText };
  }

  return errorData.error || `HTTP ${response.status}: ${response.statusText}`;
}

export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    query?: Record<string, string | number | boolean | null | undefined>;
    useSessionAuth?: boolean;
  } = {}
): Promise<EdgeFunctionResponse<T>> {
  const { method = 'GET', body, query, useSessionAuth = false } = options;

  try {
    const qs =
      query && Object.keys(query).length > 0
        ? `?${new URLSearchParams(
            Object.entries(query)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => [k, String(v)])
          ).toString()}`
        : '';
    const url = `${SUPABASE_URL}/functions/v1/${functionName}${qs}`;

    let accessToken = SUPABASE_ANON_KEY;
    if (useSessionAuth) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? SUPABASE_ANON_KEY;
    }

    const createHeaders = (token: string): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    });

    const fetchOptions: RequestInit = {
      method,
      headers: createHeaders(accessToken),
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    console.log(`Invoking Edge Function: ${functionName}`, { url, method });

    let response = await fetch(url, fetchOptions);

    if (response.status === 401 && useSessionAuth && accessToken !== SUPABASE_ANON_KEY) {
      console.warn(`Edge Function ${functionName} returned 401 with session token, retrying with anon token.`);
      response = await fetch(url, {
        ...fetchOptions,
        headers: createHeaders(SUPABASE_ANON_KEY),
      });
    }

    if (!response.ok) {
      const parsedError = await parseEdgeErrorResponse(response);

      console.error(`Edge Function ${functionName} failed:`, {
        status: response.status,
        statusText: response.statusText,
        error: parsedError,
      });

      return {
        data: null,
        error: parsedError,
      };
    }

    const data = await response.json();
    console.log(`Edge Function ${functionName} success:`, data);

    if (data.error) {
      return {
        data: null,
        error: data.error + (data.details ? ` - ${data.details}` : ''),
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    console.error(`Exception calling Edge Function ${functionName}:`, error);
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function isEdgeSourceUnavailable(error: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504') ||
    lower.includes('edge function') ||
    lower.includes('function not found')
  );
}

export function getOptionalSourceWarning(sourceName: string, error: string | null): string {
  return `${sourceName} is temporarily unavailable. ${error ? `Details: ${error}` : 'Please try again later.'}`;
}
