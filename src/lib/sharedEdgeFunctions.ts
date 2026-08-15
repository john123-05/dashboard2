import { EXTERNAL_SUPABASE_ANON_KEY, EXTERNAL_SUPABASE_URL, supabase } from './supabase';

interface SharedEdgeResponse<T = any> {
  data: T | null;
  error: string | null;
}

async function parseEdgeError(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed.error || parsed.message || raw || `HTTP ${response.status}`;
  } catch {
    return raw || `HTTP ${response.status}`;
  }
}

export async function invokeSharedEdgeFunction<T = any>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    query?: Record<string, string | number | boolean | null | undefined>;
  } = {},
): Promise<SharedEdgeResponse<T>> {
  const { method = 'GET', body, query } = options;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Ohne Sitzung gar nicht erst losschicken.
    //
    // Frueher ging ersatzweise der anonyme Schluessel des GETEILTEN Projekts
    // raus - an eine Function, die gegen das OPERATOR-Projekt prueft. Die
    // antwortete dann voellig zu Recht "Invalid operator auth token", und man
    // suchte den Fehler beim Schluessel statt bei der fehlenden Anmeldung.
    // Besonders irrefuehrend auf localhost: eigener Ursprung, eigener
    // Sitzungsspeicher - dort ist man abgemeldet, waehrend die
    // veroeffentlichte Seite laengst angemeldet ist.
    if (!session?.access_token) {
      return { data: null, error: 'Nicht angemeldet - bitte neu einloggen.' };
    }

    const qs =
      query && Object.keys(query).length > 0
        ? `?${new URLSearchParams(
            Object.entries(query)
              .filter(([, value]) => value !== null && value !== undefined)
              .map(([key, value]) => [key, String(value)]),
          ).toString()}`
        : '';

    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/${functionName}${qs}`, {
      method,
      headers: {
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      return {
        data: null,
        error: await parseEdgeError(response),
      };
    }

    const data = await response.json().catch(() => null);
    if (data?.error) {
      return {
        data: null,
        error: String(data.error),
      };
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
