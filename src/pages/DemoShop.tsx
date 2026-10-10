import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import ProductMockup from '../components/shop/ProductMockup';
import { fontByKey } from '../lib/shopFonts';
import {
  fetchDemoShop,
  rotateThumb,
  formatEuro,
  startDemoCheckout,
  type DemoCartItem,
  type DemoShopData,
  type DemoShopPhoto,
  type DemoShopProduct,
} from '../lib/demoShop';

const WATERMARK_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="190" height="120"><text x="95" y="66" transform="rotate(-24 95 60)" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="800" letter-spacing="3" fill="white" fill-opacity="0.55" stroke="black" stroke-opacity="0.18" stroke-width="0.6">VORSCHAU</text></svg>',
  )}")`,
  backgroundSize: '190px 120px',
};

function readableTextOn(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#ffffff';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff';
}

function photoTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function loadCart(token: string): DemoCartItem[] {
  try {
    const raw = sessionStorage.getItem(`demo-shop-cart:${token}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(token: string, cart: DemoCartItem[]) {
  try {
    sessionStorage.setItem(`demo-shop-cart:${token}`, JSON.stringify(cart));
  } catch {
    // private mode etc. - the cart just won't survive a reload
  }
}

export default function DemoShop() {
  const { token = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const embedded = searchParams.get('embed') === '1';
  const checkoutResult = searchParams.get('checkout');

  const [data, setData] = useState<DemoShopData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DemoShopPhoto | null>(null);
  const [cart, setCart] = useState<DemoCartItem[]>(() => loadCart(token));
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDemoShop(token)
      .then(async (result) => {
        const degrees = result.shop.photoRotation ?? 0;
        const photos = degrees
          ? await Promise.all(result.photos.map(async (p) => ({ ...p, thumb: await rotateThumb(p.thumb, degrees).catch(() => p.thumb) })))
          : result.photos;
        if (active) setData({ ...result, photos });
      })
      .catch((e) => active && setLoadError(e instanceof Error ? e.message : 'Shop konnte nicht geladen werden'));
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => saveCart(token, cart), [token, cart]);

  useEffect(() => {
    if (checkoutResult === 'success') setCart([]);
  }, [checkoutResult]);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(null), 1800);
    return () => window.clearTimeout(timer);
  }, [added]);

  const shop = data?.shop;
  const font = fontByKey(shop?.fontFamily);

  useEffect(() => {
    if (!font.googleCss) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.googleCss}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [font.googleCss]);
  const accent = shop?.accentColor || '#C6A233';
  const onAccent = readableTextOn(accent);
  const title = shop?.shopName || shop?.parkName || 'Foto-Shop';
  const brandName = shop?.shopName || shop?.parkName || '';
  const photos = data?.photos ?? [];
  const portrait = shop?.photoRotation === 90 || shop?.photoRotation === 270;
  const tileAspect = portrait ? 'aspect-[3/4]' : 'aspect-[4/3]';
  const products = shop?.products ?? [];
  const perPhotoProducts = products.filter((p) => p.per_photo);
  const dayPass = products.find((p) => !p.per_photo);
  const minPhotoPrice = perPhotoProducts.length ? Math.min(...perPhotoProducts.map((p) => p.price_cents)) : null;
  const productByKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + (productByKey.get(item.key)?.price_cents ?? 0) * item.quantity, 0);

  function addToCart(product: DemoShopProduct, photoId: string | null) {
    setCart((prev) => {
      const index = prev.findIndex((item) => item.key === product.key && item.photoId === photoId);
      if (index === -1) return [...prev, { key: product.key, photoId, quantity: 1 }];
      return prev.map((item, i) => (i === index ? { ...item, quantity: Math.min(10, item.quantity + 1) } : item));
    });
    setAdded(product.label);
  }

  function changeQuantity(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) => (i === index ? { ...item, quantity: Math.min(10, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  async function checkout() {
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const url = await startDemoCheckout(token, cart);
      // Stripe refuses to load inside an iframe - the dashboard preview opens it in a new tab.
      if (embedded) window.open(url, '_blank', 'noopener');
      else window.location.href = url;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Checkout fehlgeschlagen');
    } finally {
      setCheckingOut(false);
    }
  }

  function dismissResult() {
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-800">Diese Shop-Vorschau gibt es nicht.</p>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  const heroPhoto = photos[0]?.thumb ?? null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-800" style={{ fontFamily: font.family }}>
      <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">
        Vorschau – keine echten Bestellungen. Testkarte: 4242 4242 4242 4242, beliebiges Datum &amp; Prüfnummer.
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <button type="button" onClick={() => setSelected(null)} className="flex min-w-0 items-center gap-3 text-left">
            {shop.logoUrl ? (
              <img src={shop.logoUrl} alt="" className="h-9 w-auto max-w-[120px] object-contain" />
            ) : (
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: accent, color: onAccent }}
              >
                <Camera className="h-5 w-5" />
              </span>
            )}
            <span className="truncate text-base font-bold">{title}</span>
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: accent, color: onAccent }}
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Warenkorb</span>
            {cartCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-slate-900">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {checkoutResult === 'success' && (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-emerald-900">Danke für deine Bestellung!</p>
              <p className="mt-0.5 text-emerald-800">
                Im echten Shop käme jetzt die Bestätigung per E-Mail mit Download-Link, Merchandise geht in den Druck.
                Das hier war eine Testzahlung – es wurde nichts berechnet.
              </p>
            </div>
            <button type="button" onClick={dismissResult} className="text-emerald-700" aria-label="Schließen" title="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {checkoutResult === 'cancel' && (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <span>Zahlung abgebrochen – dein Warenkorb ist noch da.</span>
            <button type="button" onClick={dismissResult} className="text-slate-500" aria-label="Schließen" title="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selected ? (
        <main className="mx-auto max-w-6xl px-4 py-6">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" /> Alle Fotos
          </button>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-3xl bg-slate-200 shadow-sm">
                <img src={selected.thumb} alt="" className={`${tileAspect} w-full scale-[1.02] object-cover blur-[1.5px]`} />
                <span className="absolute inset-0" style={WATERMARK_STYLE} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Foto #{selected.id.slice(0, 6).toUpperCase()} · {photoTime(selected.capturedAt)} Uhr · nach dem Kauf
                in voller Auflösung, ohne Wasserzeichen
              </p>
            </div>
            <div className="min-w-0 space-y-3">
              <h1 className="text-xl font-bold sm:text-2xl">Was möchtest du mit diesem Foto?</h1>
              {perPhotoProducts.map((product) => (
                <div key={product.key} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-2.5 sm:gap-3 sm:p-3">
                  <ProductMockup
                    productKey={product.key}
                    photo={selected.thumb}
                    accent={accent}
                    parkName={brandName}
                    className="h-14 w-16 shrink-0 sm:h-16 sm:w-20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{product.label}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{product.description}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm font-bold">{formatEuro(product.price_cents)}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product, selected.id)}
                      className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold sm:px-3 sm:text-xs"
                      style={{ backgroundColor: accent, color: onAccent }}
                    >
                      In den Warenkorb
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <main>
          <section style={{ backgroundColor: accent, color: onAccent }}>
            <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-10 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest opacity-80">{brandName}</p>
                <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Deine Fahrt. Dein Foto.</h1>
                <p className="mt-3 max-w-md text-sm opacity-90">
                  {shop.welcomeText ||
                    'Hol dir dein Foto von heute – als Download, Abzug oder auf Tasse, T-Shirt und mehr.'}
                </p>
              </div>
              <div className="hidden justify-center md:flex">
                <ProductMockup productKey="mug" photo={heroPhoto} accent={accent} parkName={brandName} className="h-48 w-60" />
                <ProductMockup productKey="tshirt" photo={heroPhoto} accent={accent} parkName={brandName} className="h-48 w-60" />
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-4 py-8">
            <h2 className="text-lg font-bold">Fotos von heute</h2>
            <p className="text-sm text-slate-500">Tippe auf dein Foto, um es zu kaufen oder auf ein Produkt zu drucken.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
                      <Camera className="h-6 w-6" />
                    </div>
                  ))
                : photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setSelected(photo)}
                      className={`group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200 transition hover:shadow-md ${index >= 6 && !showAllPhotos ? 'hidden sm:block' : ''}`}
                    >
                      <div className="relative overflow-hidden">
                        <img src={photo.thumb} alt="" className={`${tileAspect} w-full scale-[1.02] object-cover blur-[1px]`} />
                        <span className="absolute inset-0" style={WATERMARK_STYLE} />
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-slate-500">{photoTime(photo.capturedAt)} Uhr</span>
                        {minPhotoPrice !== null && (
                          <span className="font-semibold" style={{ color: accent }}>
                            ab {formatEuro(minPhotoPrice)}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
            </div>
            {photos.length > 6 && !showAllPhotos && (
              <button
                type="button"
                onClick={() => setShowAllPhotos(true)}
                className="mt-4 w-full rounded-full border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-700 sm:hidden"
              >
                Weitere Fotos anzeigen ({photos.length - 6})
              </button>
            )}
          </section>

          {dayPass && (
            <section className="mx-auto max-w-6xl px-4 pb-8">
              <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:flex-row">
                <ProductMockup productKey="daypass" photo={heroPhoto} accent={accent} className="h-28 w-36 shrink-0" />
                <div className="flex-1 text-center sm:text-left">
                  <p className="text-base font-bold">{dayPass.label}</p>
                  <p className="text-sm text-slate-500">{dayPass.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(dayPass, null)}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: accent, color: onAccent }}
                >
                  {formatEuro(dayPass.price_cents)} · In den Warenkorb
                </button>
              </div>
            </section>
          )}

          {perPhotoProducts.length > 1 && (
            <section className="mx-auto max-w-6xl px-4 pb-12">
              <h2 className="text-lg font-bold">Dein Foto auf …</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {perPhotoProducts.map((product) => (
                  <div key={product.key} className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200">
                    <ProductMockup
                      productKey={product.key}
                      photo={heroPhoto}
                      accent={accent}
                      parkName={brandName}
                      className="mx-auto h-24 w-full"
                    />
                    <p className="mt-2 text-sm font-semibold">{product.label}</p>
                    <p className="text-xs text-slate-500">{formatEuro(product.price_cents)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        {brandName} · Foto-Shop powered by Liftpictures
      </footer>

      {added && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {added} liegt im Warenkorb
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setCartOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold">Warenkorb</h2>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Schließen">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {cart.length === 0 && <p className="text-sm text-slate-500">Dein Warenkorb ist leer.</p>}
              {cart.map((item, index) => {
                const product = productByKey.get(item.key);
                if (!product) return null;
                const photo = item.photoId ? photoById.get(item.photoId) : null;
                return (
                  <div key={`${item.key}-${item.photoId}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
                    <ProductMockup
                      productKey={item.key}
                      photo={photo?.thumb ?? heroPhoto}
                      accent={accent}
                      parkName={brandName}
                      className="h-14 w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{product.label}</p>
                      <p className="text-xs text-slate-500">
                        {item.photoId ? `Foto #${item.photoId.slice(0, 6).toUpperCase()}` : 'Alle Fotos des Tages'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button type="button" onClick={() => changeQuantity(index, -1)} className="rounded-full border p-1" aria-label="Weniger">
                          {item.quantity === 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        </button>
                        <span className="w-4 text-center text-sm">{item.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(index, 1)} className="rounded-full border p-1" aria-label="Mehr">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <span className="text-sm font-bold">{formatEuro(product.price_cents * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-slate-200 px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-base font-bold">
                <span>Summe</span>
                <span>{formatEuro(cartTotal)}</span>
              </div>
              {checkoutError && <p className="mb-2 text-sm text-rose-600">{checkoutError}</p>}
              <button
                type="button"
                disabled={cart.length === 0 || checkingOut}
                onClick={() => void checkout()}
                className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold disabled:opacity-50"
                style={{ backgroundColor: accent, color: onAccent }}
              >
                {checkingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                Zur Kasse
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">Sichere Zahlung über Stripe · Testmodus</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
