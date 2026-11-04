// Online-Foto-Parks (z. B. Kalahari): kein Kassenautomat, Gäste kaufen per QR-Code online über Stripe.
// Die normalen Seiten (Übersicht, Umsatz, Fotos, Käufe) bleiben dieselben – nur ihre Daten kommen
// hier aus der Function operator-online-park statt aus Kasse/Drucker. kioskSales.ts und
// photoBrowser.ts schalten für diese Parks auf die Funktionen unten um.
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export const ONLINE_PARKS: Record<string, { currency: string; path: string }> = {
  'cd65690a-3e83-414a-8e38-5482cfe1c482': { currency: 'usd', path: 'kalahari-virginia' }, // Kalahari Resorts Virginia
};

export function isOnlinePark(parkId: string | null | undefined): parkId is string {
  return Boolean(parkId && ONLINE_PARKS[parkId]);
}

/** Währung der Verkaufszahlen: Online-Parks in ihrer Shop-Währung, Automaten in Euro. */
export function parkCurrency(parkId: string | null | undefined): string {
  return (parkId && ONLINE_PARKS[parkId]?.currency) || 'eur';
}

export interface DeliveryStep {
  id: string;
  position: number;
  title: string;
  description: string | null;
  status: 'done' | 'current' | 'upcoming';
  step_date: string | null;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
}

export interface OnlineSummary {
  park: { name: string; timezone: string };
  shop: {
    unlock_mode: 'purchase' | 'email';
    price_cents: number;
    currency: string;
    is_test: boolean;
    enabled: boolean;
    path: string;
    stripe_connected: boolean;
    shop_url: string;
    screen_url: string;
  } | null;
  revenue: {
    currency: string;
    test_mode: boolean;
    real: { payments: number; net_cents: number };
    test: { payments: number; net_cents: number };
  } | null;
  today: string;
  days: { day: string; photos: number; sales: number; test_sales: number; revenue_cents: number; test_revenue_cents: number; unlocks: number }[];
  hours: { hour: number; photos: number; sales: number }[];
  delivery: { steps: DeliveryStep[]; customer_note: string | null; updated_at: string | null };
  as_of: string;
}

type AssetRef = { claim_code: string; photo_number?: string | null; captured_at: string } | null;
export interface OnlineOrder { id: string; paid_at: string; amount_cents: number; refunded_cents: number; currency?: string; is_test: boolean; asset: AssetRef }
export interface OnlineUnlock { id: string; created_at: string; email: string | null; full_name: string | null; is_test: boolean; asset: AssetRef }
export interface OnlinePhoto { id: string; code: string; number: string | null; captured_at: string; is_test: boolean; image_url: string | null; is_paid: boolean; claim_url: string }

export async function callOnlinePark<T>(parkId: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Authentication required');
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-online-park`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
    body: JSON.stringify({ park_id: parkId, ...body }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error || `HTTP ${res.status}`);
  return json.data as T;
}

// Mehrere Seitenteile fragen die Zusammenfassung gleichzeitig ab – einmal holen, kurz merken.
const summaryCache = new Map<string, { at: number; promise: Promise<OnlineSummary> }>();
export function fetchOnlineSummary(parkId: string, fresh = false): Promise<OnlineSummary> {
  const hit = summaryCache.get(parkId);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.promise;
  const promise = callOnlinePark<OnlineSummary>(parkId);
  summaryCache.set(parkId, { at: Date.now(), promise });
  promise.catch(() => summaryCache.delete(parkId));
  return promise;
}

/**
 * Was als „verkauft“ zählt: bezahlte Fotos plus per E-Mail freigeschaltete. Solange der Shop im
 * Testmodus läuft, zählen Testkäufe mit (die Übersicht zeigt dann „Testmodus“), danach nur echte.
 */
export function soldOf(day: OnlineSummary['days'][number], testMode: boolean) {
  return day.sales + day.unlocks + (testMode ? day.test_sales : 0);
}
export function revenueOf(day: OnlineSummary['days'][number], testMode: boolean) {
  return day.revenue_cents + (testMode ? day.test_revenue_cents : 0);
}
