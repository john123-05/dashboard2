import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export interface ShopSettings {
  price_cents: number;
  accent_color: string;
  logo_url: string | null;
}

export interface ShopRevenue {
  salesCount: number;
  totalCents: number;
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Nicht angemeldet');
  return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
}

export async function fetchShopOverview(parkId: string): Promise<{ settings: ShopSettings; revenue: ShopRevenue }> {
  const headers = await authHeaders();
  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-shop-settings?park_id=${encodeURIComponent(parkId)}`,
    { headers },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}

export async function saveShopSettings(
  parkId: string,
  changes: { price_cents?: number; accent_color?: string },
): Promise<ShopSettings> {
  const headers = await authHeaders();
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-shop-settings`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ park_id: parkId, ...changes }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.settings;
}

export async function uploadShopLogo(parkId: string, file: File): Promise<ShopSettings> {
  const headers = await authHeaders();
  const form = new FormData();
  form.set('park_id', parkId);
  form.set('logo', file);
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-shop-settings`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.settings;
}
