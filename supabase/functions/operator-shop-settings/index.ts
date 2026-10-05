import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-shop-settings
 *
 * Betreiber-Selbstverwaltung fuer den "Second Chance Sales"-Shop-Prototyp
 * (Preis, Branding, Umsatz). Laeuft mit verify_jwt=false - der Operator-
 * Token stammt aus dem anderen Projekt, requireOperatorForPark prueft ihn
 * selbst (Cross-Projekt-Token wird vom API-Gateway sonst schon abgelehnt).
 *
 *   GET  ?park_id=...                 -> { settings, revenue }
 *   POST { park_id, price_cents?, accent_color? }        -> Preis/Farbe speichern
 *   POST multipart/form-data { park_id, logo }            -> Logo hochladen
 */

const BUCKET = 'shop-branding';
const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const DEFAULT_SETTINGS = { price_cents: 499, accent_color: '#C6A233', logo_url: null as string | null };

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

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method === 'GET') {
    const parkId = (new URL(req.url).searchParams.get('park_id') || '').trim();
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const { data: settingsRow, error: settingsError } = await supabaseService
      .from('park_shop_settings')
      .select('price_cents, accent_color, logo_url')
      .eq('park_id', auth.parkId)
      .maybeSingle();
    if (settingsError) return json({ error: settingsError.message }, 500);

    try {
      const revenue = await loadRevenue(auth.parkId);
      return json({ settings: settingsRow ?? DEFAULT_SETTINGS, revenue });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Fehler beim Laden' }, 500);
    }
  }

  if (req.method === 'POST') {
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

      const { data, error } = await supabaseService
        .from('park_shop_settings')
        .upsert({ park_id: auth.parkId, logo_url: pub.publicUrl, updated_at: new Date().toISOString() })
        .select('price_cents, accent_color, logo_url')
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, settings: data });
    }

    const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const parkId = typeof payload?.park_id === 'string' ? payload.park_id.trim() : '';
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);
    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const update: Record<string, unknown> = { park_id: auth.parkId, updated_at: new Date().toISOString() };
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

    const { data, error } = await supabaseService
      .from('park_shop_settings')
      .upsert(update)
      .select('price_cents, accent_color, logo_url')
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, settings: data });
  }

  return json({ error: 'Method not allowed' }, 405);
});
