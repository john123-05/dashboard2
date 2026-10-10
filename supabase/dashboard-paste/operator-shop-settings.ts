// Eine Datei für den Supabase-Editor (Dashboard → Edge Functions). Inhalt = _shared + index.ts.
// Quelle im Repo: supabase/functions/operator-shop-settings/index.ts (erzeugt mit scripts/build-paste.py)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';


// For functions deployed directly onto the shared LiftPictures production
// project (kvpcwlcfgmsmarjtwpsx) — admin_users lives right here, so no
// cross-project lookup is needed (contrast with ../staffAuth.ts, which is
// for functions deployed on dashboard2's own project that need to verify
// staff membership against that other project instead).
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabaseService = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

export async function requireAdminFromRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const { data: userData, error: userError } = await supabaseService.auth.getUser(token);
  if (userError || !userData.user) {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  const { data: adminRow, error: adminError } = await supabaseService
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    return { ok: false, status: 500, message: adminError.message };
  }

  if (!adminRow) {
    return { ok: false, status: 403, message: 'Not an admin user' };
  }

  return { ok: true, userId: userData.user.id };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export const LEAD_TEMPERATURES = ['heiss', 'warm', 'kalt'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export function isValidTemperature(value: unknown): value is LeadTemperature {
  return typeof value === 'string' && (LEAD_TEMPERATURES as readonly string[]).includes(value);
}


const OPERATOR_SUPABASE_URL = Deno.env.get("OPERATOR_SUPABASE_URL") ??
  "https://xcrxltiiovpoladpaewd.supabase.co";
const OPERATOR_SUPABASE_ANON_KEY = Deno.env.get("OPERATOR_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ";

export type OperatorAuthResult =
  | { ok: true; userId: string; parkId: string; organizationId: string | null }
  | { ok: false; status: number; message: string };

type OperatorUser = {
  id: string;
  app_metadata?: Record<string, unknown> | null;
};

function normalizeParkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getAllowedParkIds(user: OperatorUser | null): string[] {
  const metadata = user?.app_metadata ?? {};
  return normalizeParkIds(metadata.allowed_park_ids ?? metadata.park_ids);
}

async function fetchOperatorUser(token: string): Promise<OperatorUser | null> {
  const response = await fetch(`${OPERATOR_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: OPERATOR_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id
    ? { id: String(user.id), app_metadata: user.app_metadata ?? null }
    : null;
}

async function fetchAccessiblePark(
  token: string,
  parkId: string,
): Promise<{ id: string; organization_id: string | null } | null> {
  const response = await fetch(
    `${OPERATOR_SUPABASE_URL}/rest/v1/parks?select=id,organization_id&id=eq.${
      encodeURIComponent(parkId)
    }`,
    {
      headers: {
        apikey: OPERATOR_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.id
    ? {
      id: String(row.id),
      organization_id: row.organization_id ? String(row.organization_id) : null,
    }
    : null;
}

async function requireOperatorForParkBase(
  req: Request,
  parkId: string,
): Promise<OperatorAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer token" };
  }

  const user = await fetchOperatorUser(token);
  if (!user) {
    // Kein Betreiber-Token: im Staff-CRM kommt das Token des gemeinsamen Projekts.
    // Staff (admin_users) darf jeden Park sehen.
    const staff = await requireAdminFromRequest(req);
    if (staff.ok) {
      const { data: park } = await supabaseService
        .from("parks")
        .select("id, organization_id")
        .eq("id", parkId)
        .maybeSingle();
      if (!park) return { ok: false, status: 404, message: "Park not found" };
      return {
        ok: true,
        userId: staff.userId,
        parkId: String(park.id),
        organizationId: park.organization_id ? String(park.organization_id) : null,
      };
    }
    return { ok: false, status: 401, message: "Invalid operator auth token" };
  }

  const allowedParkIds = getAllowedParkIds(user);
  if (allowedParkIds.length > 0 && !allowedParkIds.includes(parkId)) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  const park = await fetchAccessiblePark(token, parkId);
  if (!park) {
    return { ok: false, status: 403, message: "No access to this park" };
  }

  return {
    ok: true,
    userId: user.id,
    parkId: park.id,
    organizationId: park.organization_id,
  };
}

/**
 * Prüft zusätzlich die Seitenrechte eines Mitarbeiters (docs/PRODUKT_PLAN.md, H3).
 * `pages`: Seiten-Schlüssel (wie src/lib/permissions.ts), von denen eine reichen muss.
 * Nur Mitarbeiter mit eigener Seitenauswahl (`allowed_pages` gesetzt) oder deaktiviertem Zugang
 * werden abgewiesen; Inhaber, Staff-Admins und Mitarbeiter ohne Auswahl bleiben wie bisher.
 * Schlägt die Abfrage fehl, wird NICHT gesperrt (kein Aussperren durch einen Ausfall).
 */
export async function requireOperatorForPark(
  req: Request,
  parkId: string,
  pages?: string[],
): Promise<OperatorAuthResult> {
  const auth = await requireOperatorForParkBase(req, parkId);
  if (!auth.ok || !pages || pages.length === 0) return auth;

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return auth;
  try {
    const response = await fetch(
      `${OPERATOR_SUPABASE_URL}/rest/v1/organization_memberships?select=role,allowed_pages,disabled_at&user_id=eq.${
        encodeURIComponent(auth.userId)
      }`,
      { headers: { apikey: OPERATOR_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return auth; // Staff-Admin (anderes Projekt) oder Ausfall
    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return auth;
    if (row.disabled_at) return { ok: false, status: 403, message: "Access disabled" };
    if (row.role === "staff" && Array.isArray(row.allowed_pages)) {
      const allowed = row.allowed_pages as string[];
      if (!pages.some((page) => allowed.includes(page))) {
        return { ok: false, status: 403, message: "No permission for this page" };
      }
    }
  } catch {
    // bewusst offen: ein Ausfall darf niemanden aussperren
  }
  return auth;
}

// Product catalog of the operator demo shop. The server is the only source of
// truth for prices: operators override price/enabled per park, the checkout
// never trusts a price sent by the browser.

export type CatalogProduct = {
  key: string;
  label: string;
  description: string;
  default_price_cents: number;
  // false: one item for the whole visit (e.g. day pass), not tied to one photo
  per_photo: boolean;
};

export const SHOP_CATALOG: CatalogProduct[] = [
  { key: 'digital', label: 'Digitaler Download', description: 'Dein Foto in voller Auflösung zum Herunterladen', default_price_cents: 499, per_photo: true },
  { key: 'print', label: 'Fotoabzug 13×18', description: 'Hochglanzabzug, per Post zu dir nach Hause', default_price_cents: 799, per_photo: true },
  { key: 'postcard', label: 'Postkarte', description: 'Dein Foto als Postkarte mit Park-Logo', default_price_cents: 399, per_photo: true },
  { key: 'magnet', label: 'Kühlschrankmagnet', description: 'Erinnerung für jeden Tag', default_price_cents: 699, per_photo: true },
  { key: 'mug', label: 'Tasse', description: 'Keramiktasse mit deinem Foto, spülmaschinenfest', default_price_cents: 1499, per_photo: true },
  { key: 'tshirt', label: 'T-Shirt', description: 'Bio-Baumwolle, dein Foto auf der Brust', default_price_cents: 2499, per_photo: true },
  { key: 'daypass', label: 'Tagespass', description: 'Alle deine Fotos des Tages als Download', default_price_cents: 1499, per_photo: false },
];

export type ShopProduct = CatalogProduct & { enabled: boolean; price_cents: number };

type StoredProduct = { key?: unknown; enabled?: unknown; price_cents?: unknown };

export function mergeProducts(stored: unknown): ShopProduct[] {
  const byKey = new Map<string, StoredProduct>();
  if (Array.isArray(stored)) {
    for (const item of stored as StoredProduct[]) {
      if (item && typeof item.key === 'string') byKey.set(item.key, item);
    }
  }
  return SHOP_CATALOG.map((product) => {
    const override = byKey.get(product.key);
    const price = Number(override?.price_cents);
    return {
      ...product,
      enabled: typeof override?.enabled === 'boolean' ? override.enabled : true,
      price_cents: Number.isInteger(price) && price >= 50 ? price : product.default_price_cents,
    };
  });
}

/** Validated {key, enabled, price_cents}[] ready to store, or an error message. */
export function sanitizeProducts(input: unknown): { products: StoredProduct[] } | { error: string } {
  if (!Array.isArray(input)) return { error: 'products muss eine Liste sein' };
  const known = new Set(SHOP_CATALOG.map((p) => p.key));
  const products: StoredProduct[] = [];
  for (const raw of input as StoredProduct[]) {
    if (!raw || typeof raw.key !== 'string' || !known.has(raw.key)) return { error: 'Unbekanntes Produkt' };
    const price = Math.round(Number(raw.price_cents));
    if (!Number.isFinite(price) || price < 50 || price > 100000) {
      return { error: 'Preise müssen zwischen 0,50 € und 1000 € liegen' };
    }
    products.push({ key: raw.key, enabled: raw.enabled !== false, price_cents: price });
  }
  return { products };
}


/**
 * operator-shop-settings
 *
 * Betreiber-Selbstverwaltung fuer den Online-Shop (Vorschau/Demo): Branding,
 * Produkte, geheimer Vorschau-Link und "Shop beantragen". Laeuft mit
 * verify_jwt=false - der Operator-Token stammt aus dem anderen Projekt,
 * requireOperatorForPark prueft ihn selbst (Cross-Projekt-Token wird vom
 * API-Gateway sonst schon abgelehnt).
 *
 *   GET  ?park_id=...                                    -> { settings, revenue }
 *   POST { park_id, accent_color?, shop_name?, welcome_text?, products?, price_cents? }
 *   POST { park_id, action: 'request_activation' }       -> Anfrage an Liftpictures
 *   POST multipart/form-data { park_id, logo }            -> Logo hochladen
 */

const BUCKET = 'shop-branding';
const FONT_KEY = /^[a-z0-9-]{1,40}$/;
const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const COLUMNS =
  'price_cents, accent_color, logo_url, shop_name, welcome_text, font_family, products, demo_token, activation_requested_at';

type SettingsRow = {
  price_cents: number;
  accent_color: string;
  logo_url: string | null;
  shop_name: string | null;
  welcome_text: string | null;
  font_family: string;
  products: unknown;
  demo_token: string;
  activation_requested_at: string | null;
};

function present(row: SettingsRow) {
  return { ...row, products: mergeProducts(row.products) };
}

async function loadSettings(parkId: string): Promise<SettingsRow> {
  // Every park gets a row on first visit - that is where its preview link lives.
  const { error: insertError } = await supabaseService
    .from('park_shop_settings')
    .upsert({ park_id: parkId }, { onConflict: 'park_id', ignoreDuplicates: true });
  if (insertError) throw new Error(insertError.message);
  const { data, error } = await supabaseService
    .from('park_shop_settings')
    .select(COLUMNS)
    .eq('park_id', parkId)
    .single();
  if (error) throw new Error(error.message);
  return data as SettingsRow;
}

async function loadRevenue(parkId: string) {
  const { data, error } = await supabaseService
    .from('photo_claims')
    .select('amount_cents')
    .eq('park_id', parkId)
    .like('claim_code', 'SHOP-%');
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const totalCents = rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);
  return { salesCount: rows.length, totalCents };
}


function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    weekday: get('weekday').toLowerCase().slice(0, 3),
  };
}

function closingMinutes(openingHours: Record<string, unknown> | null, weekday: string): number {
  const entry = openingHours?.[weekday];
  const close = Array.isArray(entry) ? String(entry[1] ?? '') : '';
  const match = /^(\d{1,2}):(\d{2})/.exec(close);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 17 * 60;
}

// Share of guests who redeem their photo only on a later day or after closing time (last 30 days).
async function loadDelayedRedemptions(parkId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: park } = await supabaseService.from('parks').select('timezone, opening_hours').eq('id', parkId).maybeSingle();
  const timeZone = park?.timezone || 'Europe/Vienna';
  const { data: claims, error } = await supabaseService
    .from('photo_claims')
    .select('photo_id, claimed_at')
    .eq('park_id', parkId)
    .eq('status', 'claimed')
    .not('claim_code', 'like', 'SHOP-%')
    .gte('claimed_at', since)
    .limit(2000);
  if (error) throw new Error(error.message);
  const photoIds = [...new Set((claims ?? []).map((c) => c.photo_id).filter(Boolean))];
  const captured = new Map<string, string>();
  for (let i = 0; i < photoIds.length; i += 200) {
    const { data } = await supabaseService.from('photos').select('id, captured_at').in('id', photoIds.slice(i, i + 200));
    for (const p of data ?? []) captured.set(p.id, p.captured_at);
  }
  let total = 0;
  let delayed = 0;
  for (const claim of claims ?? []) {
    const capturedAt = captured.get(claim.photo_id);
    if (!capturedAt || !claim.claimed_at) continue;
    total++;
    const photo = localParts(capturedAt, timeZone);
    const redeemed = localParts(claim.claimed_at, timeZone);
    if (redeemed.date > photo.date || redeemed.minutes >= closingMinutes(park?.opening_hours ?? null, photo.weekday)) delayed++;
  }
  return { total, delayed };
}

async function updateSettings(parkId: string, update: Record<string, unknown>) {
  await loadSettings(parkId);
  const { data, error } = await supabaseService
    .from('park_shop_settings')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('park_id', parkId)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return present(data as SettingsRow);
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

async function requestActivation(parkId: string, userId: string) {
  const { data: park } = await supabaseService.from('parks').select('name').eq('id', parkId).maybeSingle();
  const settings = await updateSettings(parkId, {
    activation_requested_at: new Date().toISOString(),
    activation_requested_by: userId,
  });
  const { error } = await supabaseService.from('staff_notifications').insert({
    title: `Shop-Anfrage: ${park?.name || 'Unbekannter Park'}`,
    body: 'Der Betreiber möchte den Online-Shop (Nachkauf & Merchandise) aktivieren. Eigenes Stripe-Konto einrichten.',
    url: '/kundenmanagement',
  });
  if (error) throw new Error(error.message);
  return settings;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (req.method === 'GET') {
      const parkId = (new URL(req.url).searchParams.get('park_id') || '').trim();
      if (!parkId) return json({ error: 'park_id fehlt' }, 400);
      const auth = await requireOperatorForPark(req, parkId, ['shop']);
      if (!auth.ok) return json({ error: auth.message }, auth.status);

      const [settings, revenue, redemptions] = await Promise.all([
        loadSettings(auth.parkId),
        loadRevenue(auth.parkId),
        loadDelayedRedemptions(auth.parkId).catch(() => ({ total: 0, delayed: 0 })),
      ]);
      return json({ settings: present(settings), revenue, redemptions });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      if (!form) return json({ error: 'Invalid form data' }, 400);
      const parkId = String(form.get('park_id') || '').trim();
      if (!parkId) return json({ error: 'park_id fehlt' }, 400);
      const auth = await requireOperatorForPark(req, parkId, ['shop']);
      if (!auth.ok) return json({ error: auth.message }, auth.status);

      const logo = form.get('logo');
      if (!(logo instanceof File) || logo.size === 0) return json({ error: 'Logo fehlt' }, 400);
      if (logo.size > MAX_LOGO_BYTES) return json({ error: 'Logo zu groß (max. 3 MB)' }, 400);
      if (!logo.type.startsWith('image/')) return json({ error: 'Nur Bilder erlaubt' }, 400);

      const ext = logo.name.includes('.') ? logo.name.slice(logo.name.lastIndexOf('.')) : '.png';
      const storagePath = `${auth.parkId}/${crypto.randomUUID()}${ext}`;
      const { error: uploadError } = await supabaseService.storage
        .from(BUCKET)
        .upload(storagePath, logo, { contentType: logo.type || undefined });
      if (uploadError) return json({ error: uploadError.message }, 400);

      const { data: pub } = supabaseService.storage.from(BUCKET).getPublicUrl(storagePath);
      const settings = await updateSettings(auth.parkId, { logo_url: pub.publicUrl });
      return json({ ok: true, settings });
    }

    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const parkId = typeof payload?.park_id === 'string' ? payload.park_id.trim() : '';
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId, ['shop']);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    if (payload?.action === 'request_activation') {
      return json({ ok: true, settings: await requestActivation(auth.parkId, auth.userId) });
    }

    const update: Record<string, unknown> = {};
    if (payload?.price_cents != null) {
      const cents = Math.round(Number(payload.price_cents));
      if (!Number.isFinite(cents) || cents < 50 || cents > 100000) {
        return json({ error: 'Preis muss zwischen 0,50 € und 1000 € liegen' }, 400);
      }
      update.price_cents = cents;
    }
    if (typeof payload?.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(payload.accent_color)) {
      update.accent_color = payload.accent_color;
    }
    if (typeof payload?.font_family === 'string' && FONT_KEY.test(payload.font_family)) {
      update.font_family = payload.font_family;
    }
    const shopName = optionalText(payload?.shop_name, 60);
    if (shopName !== undefined) update.shop_name = shopName;
    const welcomeText = optionalText(payload?.welcome_text, 240);
    if (welcomeText !== undefined) update.welcome_text = welcomeText;
    if (payload?.products !== undefined) {
      const result = sanitizeProducts(payload.products);
      if ('error' in result) return json({ error: result.error }, 400);
      update.products = result.products;
    }

    return json({ ok: true, settings: await updateSettings(auth.parkId, update) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Fehler' }, 500);
  }
});
