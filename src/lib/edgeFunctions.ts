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

type WarningLang = 'de' | 'en' | 'es' | 'fr' | 'it' | 'nl' | 'lv';

const WARNING_TEXT: Record<WarningLang, { unavailable: string; details: string; retry: string }> = {
  de: { unavailable: '{source} ist vorübergehend nicht erreichbar.', details: 'Details: {error}', retry: 'Bitte versuche es später erneut.' },
  en: { unavailable: '{source} is temporarily unavailable.', details: 'Details: {error}', retry: 'Please try again later.' },
  es: { unavailable: '{source} no está disponible temporalmente.', details: 'Detalles: {error}', retry: 'Inténtalo de nuevo más tarde.' },
  fr: { unavailable: '{source} est temporairement indisponible.', details: 'Détails : {error}', retry: 'Veuillez réessayer plus tard.' },
  it: { unavailable: '{source} non è temporaneamente disponibile.', details: 'Dettagli: {error}', retry: 'Riprova più tardi.' },
  nl: { unavailable: '{source} is tijdelijk niet beschikbaar.', details: 'Details: {error}', retry: 'Probeer het later opnieuw.' },
  lv: { unavailable: '{source} īslaicīgi nav pieejams.', details: 'Detaļas: {error}', retry: 'Lūdzu, mēģini vēlreiz vēlāk.' },
};

// Namen der Datenquellen, wie sie in Warnungen erscheinen (Schlüssel = englischer Name im Code).
const SOURCE_NAMES: Record<string, Record<WarningLang, string>> = {
  'Operations feed': { de: 'Der Betriebs-Feed', en: 'Operations feed', es: 'El feed de operaciones', fr: 'Le flux d’exploitation', it: 'Il feed operativo', nl: 'De bedrijfsfeed', lv: 'Darbības plūsma' },
  'Stripe data': { de: 'Die Stripe-Daten', en: 'Stripe data', es: 'Los datos de Stripe', fr: 'Les données Stripe', it: 'I dati Stripe', nl: 'De Stripe-gegevens', lv: 'Stripe dati' },
  'Local sales feed': { de: 'Der Verkaufs-Feed am Automaten', en: 'Local sales feed', es: 'El feed de ventas locales', fr: 'Le flux des ventes locales', it: 'Il feed delle vendite locali', nl: 'De lokale verkoopfeed', lv: 'Vietējo pārdošanas plūsma' },
  'Lead feed': { de: 'Die Kontaktliste', en: 'Lead feed', es: 'La lista de contactos', fr: 'La liste des contacts', it: 'L’elenco dei contatti', nl: 'De contactenlijst', lv: 'Kontaktu saraksts' },
  'User feed': { de: 'Die Gästeliste', en: 'User feed', es: 'La lista de huéspedes', fr: 'La liste des visiteurs', it: 'L’elenco degli ospiti', nl: 'De gastenlijst', lv: 'Viesu saraksts' },
  'Photo feed': { de: 'Die Fotoliste', en: 'Photo feed', es: 'La lista de fotos', fr: 'La liste des photos', it: 'L’elenco delle foto', nl: 'De fotolijst', lv: 'Foto saraksts' },
  'Error log feed': { de: 'Das Fehlerprotokoll', en: 'Error log feed', es: 'El registro de errores', fr: 'Le journal des erreurs', it: 'Il registro degli errori', nl: 'Het foutenlogboek', lv: 'Kļūdu žurnāls' },
  'System health feed': { de: 'Die Systemzustand-Daten', en: 'System health feed', es: 'Los datos del estado del sistema', fr: 'Les données d’état du système', it: 'I dati sullo stato del sistema', nl: 'De systeemstatusgegevens', lv: 'Sistēmas stāvokļa dati' },
  'Legacy health feed': { de: 'Die älteren Systemzustand-Daten', en: 'Legacy health feed', es: 'Los datos antiguos del estado del sistema', fr: 'Les anciennes données d’état du système', it: 'I vecchi dati sullo stato del sistema', nl: 'De oudere systeemstatusgegevens', lv: 'Vecie sistēmas stāvokļa dati' },
  'Stripe products': { de: 'Die Stripe-Produkte', en: 'Stripe products', es: 'Los productos de Stripe', fr: 'Les produits Stripe', it: 'I prodotti Stripe', nl: 'De Stripe-producten', lv: 'Stripe produkti' },
};

function currentWarningLanguage(): WarningLang {
  try {
    const stored = localStorage.getItem('app_language');
    if (stored && stored in WARNING_TEXT) return stored as WarningLang;
  } catch {
    // localStorage nicht verfügbar: Standardsprache
  }
  return 'de';
}

export function getOptionalSourceWarning(sourceName: string, error: string | null): string {
  const lang = currentWarningLanguage();
  const text = WARNING_TEXT[lang];
  const source = SOURCE_NAMES[sourceName]?.[lang] ?? sourceName;
  const tail = error ? text.details.replace('{error}', error) : text.retry;
  return `${text.unavailable.replace('{source}', source)} ${tail}`;
}
