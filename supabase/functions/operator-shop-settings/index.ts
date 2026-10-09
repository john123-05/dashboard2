import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';
import { mergeProducts, sanitizeProducts } from '../_shared/shopCatalog.ts';

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
      const auth = await requireOperatorForPark(req, parkId);
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
      const auth = await requireOperatorForPark(req, parkId);
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
    const auth = await requireOperatorForPark(req, parkId);
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
