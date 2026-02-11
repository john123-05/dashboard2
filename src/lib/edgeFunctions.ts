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
  } = {}
): Promise<EdgeFunctionResponse<T>> {
  const { method = 'GET', body } = options;

  try {
    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

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
