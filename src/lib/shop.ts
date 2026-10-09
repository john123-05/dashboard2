import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

export interface ShopProduct {
  key: string;
  label: string;
  description: string;
  price_cents: number;
  per_photo: boolean;
  enabled: boolean;
}

export interface ShopSettings {
  price_cents: number;
  accent_color: string;
  logo_url: string | null;
  shop_name: string | null;
  welcome_text: string | null;
  font_family: string;
  products: ShopProduct[];
  demo_token: string;
  activation_requested_at: string | null;
}

export interface ShopRevenue {
  salesCount: number;
  totalCents: number;
}

export interface ShopRedemptions {
  total: number;
  delayed: number;
}

export interface ShopSettingsChanges {
  accent_color?: string;
  shop_name?: string | null;
  welcome_text?: string | null;
  font_family?: string;
  products?: { key: string; enabled: boolean; price_cents: number }[];
}

const ENDPOINT = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-shop-settings`;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Nicht angemeldet');
  return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY };
}

async function call<T>(init: RequestInit & { query?: string } = {}): Promise<T> {
  const headers = { ...(await authHeaders()), ...(init.headers as Record<string, string> | undefined) };
  const res = await fetch(`${ENDPOINT}${init.query ?? ''}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export async function fetchShopOverview(parkId: string): Promise<{ settings: ShopSettings; revenue: ShopRevenue; redemptions: ShopRedemptions }> {
  return call({ query: `?park_id=${encodeURIComponent(parkId)}` });
}

async function postJson(parkId: string, payload: Record<string, unknown>): Promise<ShopSettings> {
  const body = await call<{ settings: ShopSettings }>({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ park_id: parkId, ...payload }),
  });
  return body.settings;
}

export function saveShopSettings(parkId: string, changes: ShopSettingsChanges): Promise<ShopSettings> {
  return postJson(parkId, { ...changes });
}

export function requestShopActivation(parkId: string): Promise<ShopSettings> {
  return postJson(parkId, { action: 'request_activation' });
}

export async function uploadShopLogo(parkId: string, file: File): Promise<ShopSettings> {
  const form = new FormData();
  form.set('park_id', parkId);
  form.set('logo', file);
  const body = await call<{ settings: ShopSettings }>({ method: 'POST', body: form });
  return body.settings;
}
