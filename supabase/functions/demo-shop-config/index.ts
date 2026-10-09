import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { mergeProducts } from '../_shared/shopCatalog.ts';

/**
 * demo-shop-config
 *
 * Public data for the operator's demo shop (/demo-shop/<token> in the
 * dashboard). Only reachable with the park's unguessable demo_token.
 * Photos leave the server as mid-size thumbnails embedded in the response -
 * never their storage path - so the full-size guest photo cannot be pulled
 * from the public bucket through this page.
 *
 *   GET ?token=<uuid> -> { shop, photos: [{ id, thumb, capturedAt }] }
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_COUNT = 16;
const THUMB_WIDTH = 480;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function thumbnail(bucket: string, path: string): Promise<string | null> {
  const { data, error } = await supabaseService.storage
    .from(bucket)
    .download(path, { transform: { width: THUMB_WIDTH, height: THUMB_WIDTH, resize: 'contain', quality: 70 } });
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  return `data:${data.type || 'image/jpeg'};base64,${toBase64(bytes)}`;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!UUID.test(token)) return json({ error: 'Ungültiger Link' }, 404);

  const { data: settings, error } = await supabaseService
    .from('park_shop_settings')
    .select('park_id, accent_color, logo_url, shop_name, welcome_text, font_family, photo_rotation, products')
    .eq('demo_token', token)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!settings) return json({ error: 'Ungültiger Link' }, 404);

  const [{ data: park }, { data: photoRows }] = await Promise.all([
    supabaseService.from('parks').select('name').eq('id', settings.park_id).maybeSingle(),
    supabaseService
      .from('photos')
      .select('id, storage_bucket, storage_path, captured_at')
      .eq('park_id', settings.park_id)
      .eq('is_test', false)
      .order('captured_at', { ascending: false })
      .limit(PHOTO_COUNT),
  ]);

  const photos = (
    await Promise.all(
      (photoRows ?? []).map(async (p) => {
        const thumb = await thumbnail(p.storage_bucket, p.storage_path).catch(() => null);
        return thumb ? { id: p.id, thumb, capturedAt: p.captured_at } : null;
      }),
    )
  ).filter(Boolean);

  return json({
    shop: {
      parkName: park?.name ?? '',
      shopName: settings.shop_name,
      welcomeText: settings.welcome_text,
      accentColor: settings.accent_color,
      logoUrl: settings.logo_url,
      fontFamily: settings.font_family,
      photoRotation: settings.photo_rotation,
      products: mergeProducts(settings.products)
        .filter((p) => p.enabled)
        .map(({ key, label, description, price_cents, per_photo }) => ({ key, label, description, price_cents, per_photo })),
    },
    photos,
  });
});
