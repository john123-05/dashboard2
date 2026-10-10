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
  // false: neu im Katalog, bleibt aus, bis der Betreiber es einschaltet (bestehende Shops ändern sich nicht)
  default_enabled?: boolean;
};

export const SHOP_CATALOG: CatalogProduct[] = [
  { key: 'digital', label: 'Digitaler Download', description: 'Dein Foto in voller Auflösung zum Herunterladen', default_price_cents: 499, per_photo: true },
  { key: 'print', label: 'Fotoabzug 13×18', description: 'Hochglanzabzug, per Post zu dir nach Hause', default_price_cents: 799, per_photo: true },
  { key: 'postcard', label: 'Postkarte', description: 'Dein Foto als Postkarte mit Park-Logo', default_price_cents: 399, per_photo: true },
  { key: 'magnet', label: 'Kühlschrankmagnet', description: 'Erinnerung für jeden Tag', default_price_cents: 699, per_photo: true },
  { key: 'mug', label: 'Tasse', description: 'Keramiktasse mit deinem Foto, spülmaschinenfest', default_price_cents: 1499, per_photo: true },
  { key: 'tshirt', label: 'T-Shirt', description: 'Bio-Baumwolle, dein Foto auf der Brust', default_price_cents: 2499, per_photo: true },
  { key: 'poster', label: 'Poster 30×40', description: 'Dein Foto groß an der Wand, matt gedruckt', default_price_cents: 1499, per_photo: true, default_enabled: false },
  { key: 'canvas', label: 'Leinwand 30×40', description: 'Auf Keilrahmen gespannt, fertig zum Aufhängen', default_price_cents: 3999, per_photo: true, default_enabled: false },
  { key: 'keychain', label: 'Schlüsselanhänger', description: 'Dein Foto immer dabei', default_price_cents: 899, per_photo: true, default_enabled: false },
  { key: 'puzzle', label: 'Puzzle (120 Teile)', description: 'Dein Foto zum Zusammensetzen', default_price_cents: 1999, per_photo: true, default_enabled: false },
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
      enabled: typeof override?.enabled === 'boolean' ? override.enabled : product.default_enabled !== false,
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
