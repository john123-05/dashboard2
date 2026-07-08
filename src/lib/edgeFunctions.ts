import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

interface EdgeFunctionResponse<T = any> {
  data: T | null;
  error: string | null;
}

export async function invokeEdgeFunction<T = any>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    query?: Record<string, string | number | boolean | null | undefined>;
  } = {}
): Promise<EdgeFunctionResponse<T>> {
  const { method = 'GET', body, query } = options;

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

    const headers: Record<string, string> = {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    console.log(`Invoking Edge Function: ${functionName}`, { url, method });

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }

      console.error(`Edge Function ${functionName} failed:`, {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });

      return {
        data: null,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
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
