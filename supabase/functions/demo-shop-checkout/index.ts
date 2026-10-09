import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { mergeProducts } from '../_shared/shopCatalog.ts';

/**
 * demo-shop-checkout
 *
 * Stripe checkout for the operator demo shop - TEST MODE ONLY. Prices come
 * from park_shop_settings, never from the browser. Nothing is fulfilled: the
 * session only shows the operator what a real purchase would look like.
 *
 *   POST { token, items: [{ key, photoId?, quantity }], returnUrl } -> { url }
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHYSICAL = new Set(['print', 'postcard', 'magnet', 'mug', 'tshirt']);
const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?dashboard-liftpictures\.com$/,
  /^https:\/\/[a-z0-9-]+\.netlify\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/,
];

// Own name first; the old webshop's STRIPE_SECRET_KEY only as long as it is a test key.
const stripeKey = Deno.env.get('SHOP_STRIPE_SECRET_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const isTestKey = stripeKey.startsWith('sk_test_') || stripeKey.startsWith('rk_test_');

type RequestItem = { key?: unknown; photoId?: unknown; quantity?: unknown };

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isTestKey) {
    return json({ error: 'Für die Shop-Vorschau ist kein Stripe-Testschlüssel hinterlegt.', code: 'no_test_key' }, 503);
  }

  const payload = (await req.json().catch(() => null)) as
    | { token?: unknown; items?: unknown; returnUrl?: unknown }
    | null;
  const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
  if (!UUID.test(token)) return json({ error: 'Ungültiger Link' }, 404);

  let origin = '';
  try {
    origin = new URL(String(payload?.returnUrl ?? '')).origin;
  } catch {
    origin = '';
  }
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) return json({ error: 'Ungültige Rücksprungadresse' }, 400);

  const items = Array.isArray(payload?.items) ? (payload!.items as RequestItem[]) : [];
  if (items.length === 0 || items.length > 20) return json({ error: 'Warenkorb ist leer oder zu groß' }, 400);

  const { data: settings, error } = await supabaseService
    .from('park_shop_settings')
    .select('park_id, shop_name, products')
    .eq('demo_token', token)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!settings) return json({ error: 'Ungültiger Link' }, 404);

  const { data: park } = await supabaseService.from('parks').select('name').eq('id', settings.park_id).maybeSingle();
  const shopLabel = settings.shop_name || park?.name || 'Foto-Shop';
  const products = new Map(mergeProducts(settings.products).filter((p) => p.enabled).map((p) => [p.key, p]));

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  let needsShipping = false;
  for (const item of items) {
    const product = typeof item.key === 'string' ? products.get(item.key) : undefined;
    if (!product) return json({ error: 'Produkt nicht verfügbar' }, 400);
    const quantity = Math.round(Number(item.quantity ?? 1));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return json({ error: 'Ungültige Menge' }, 400);
    const photoId = typeof item.photoId === 'string' && UUID.test(item.photoId) ? item.photoId : null;
    const name = product.per_photo && photoId
      ? `${product.label} – Foto #${photoId.slice(0, 6).toUpperCase()}`
      : product.label;
    if (PHYSICAL.has(product.key)) needsShipping = true;
    lineItems.push({
      quantity,
      price_data: {
        currency: 'eur',
        unit_amount: product.price_cents,
        product_data: { name, description: `${shopLabel} · Vorschau, keine echte Bestellung` },
      },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const base = `${origin}/demo-shop/${token}`;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    locale: 'de',
    ...(needsShipping
      ? { shipping_address_collection: { allowed_countries: ['DE', 'AT', 'CH', 'IT', 'LV', 'LT', 'EE'] } }
      : {}),
    metadata: { demo_shop: 'true', park_id: settings.park_id },
    success_url: `${base}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}?checkout=cancel`,
  });

  if (!session.url) return json({ error: 'Stripe hat keine Checkout-Adresse geliefert' }, 502);
  return json({ url: session.url });
});
