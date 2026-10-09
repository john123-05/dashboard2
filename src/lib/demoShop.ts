import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';

export interface DemoShopProduct {
  key: string;
  label: string;
  description: string;
  price_cents: number;
  per_photo: boolean;
}

export interface DemoShopPhoto {
  id: string;
  thumb: string;
  capturedAt: string;
}

export interface DemoShopData {
  shop: {
    parkName: string;
    shopName: string | null;
    welcomeText: string | null;
    accentColor: string;
    logoUrl: string | null;
    fontFamily?: string;
    photoRotation?: number;
    products: DemoShopProduct[];
  };
  photos: DemoShopPhoto[];
}

export interface DemoCartItem {
  key: string;
  photoId: string | null;
  quantity: number;
}

const headers = {
  apikey: EXTERNAL_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
};

export async function fetchDemoShop(token: string): Promise<DemoShopData> {
  // Always fresh: the photos change all day and an old cached answer showed outdated crops.
  const res = await fetch(
    `${EXTERNAL_SUPABASE_URL}/functions/v1/demo-shop-config?token=${encodeURIComponent(token)}&_=${Date.now()}`,
    { headers, cache: 'no-store' },
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as DemoShopData;
}

export async function startDemoCheckout(token: string, items: DemoCartItem[]): Promise<string> {
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/demo-shop-checkout`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, items, returnUrl: window.location.origin }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.url) throw new Error(body?.error || `HTTP ${res.status}`);
  return body.url as string;
}

export function formatEuro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// Some cameras are mounted rotated and write no orientation tag (Tarzans: 270°).
// Same fix as the claim page: turn the thumbnail upright in the browser.
export async function rotateThumb(dataUrl: string, degrees: number): Promise<string> {
  if (!degrees) return dataUrl;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const swap = degrees === 90 || degrees === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? image.height : image.width;
  canvas.height = swap ? image.width : image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toDataURL('image/jpeg', 0.8);
}
