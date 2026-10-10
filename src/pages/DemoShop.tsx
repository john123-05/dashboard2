import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Truck,
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
  const collage = photos.slice(0, 3);
  const heading = 'font-black uppercase italic tracking-tight';
  const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-sm px-5 py-3 text-sm font-black uppercase italic tracking-wide transition hover:brightness-95 disabled:opacity-50';

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#faf9f6] text-[#1a1a1a]" style={{ fontFamily: font.family }}>
      <div className="bg-[#1a1a1a] px-4 py-1.5 text-center text-[11px] text-white/75">
        Vorschau im Testmodus – keine echten Bestellungen. Testkarte: 4242 4242 4242 4242, beliebiges Datum &amp; Prüfnummer.
      </div>

      <header className="sticky top-0 z-30 border-b border-black/10 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <button type="button" onClick={() => setSelected(null)} className="flex min-w-0 items-center gap-3 text-left">
            {shop.logoUrl ? (
              <img src={shop.logoUrl} alt="" className="h-9 w-auto max-w-[120px] object-contain" />
            ) : (
              <span
                className="h-9 w-3.5 shrink-0"
                style={{ backgroundColor: accent, clipPath: 'polygon(65% 0%, 100% 0%, 35% 100%, 0% 100%)' }}
                aria-hidden="true"
              />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-black uppercase leading-tight tracking-tight">{title}</span>
              <span className="block text-[11px] uppercase tracking-widest text-[#6b6a63]">Foto-Shop</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-sm border border-black/20 bg-white px-3.5 py-2 text-sm font-bold uppercase tracking-wide hover:bg-black/5"
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Warenkorb</span>
            {cartCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold" style={{ backgroundColor: accent, color: onAccent }}>
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {checkoutResult === 'success' && (
        <div className="mx-auto mt-6 max-w-6xl px-4">
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
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
          <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white p-4 text-sm">
            <span>Zahlung abgebrochen – dein Warenkorb ist noch da.</span>
            <button type="button" onClick={dismissResult} className="text-[#6b6a63]" aria-label="Schließen" title="Schließen">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {selected ? (
        <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:pb-10">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6b6a63] hover:text-[#1a1a1a]"
          >
            <ArrowLeft className="h-4 w-4" /> Alle Fotos
          </button>
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div className="min-w-0">
              <div className="relative overflow-hidden rounded-md border border-black/10 bg-white p-2 shadow-sm">
                <div className="relative overflow-hidden rounded-sm">
                  <img src={selected.thumb} alt="" className={`${tileAspect} w-full scale-[1.02] object-cover blur-[1.5px]`} />
                  <span className="absolute inset-0" style={WATERMARK_STYLE} />
                </div>
              </div>
              <p className="mt-2 text-xs text-[#6b6a63]">
                Foto #{selected.id.slice(0, 6).toUpperCase()} · {photoTime(selected.capturedAt)} Uhr · nach dem Kauf
                in voller Auflösung, ohne Wasserzeichen
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{brandName}</p>
              <h1 className={`mt-1 text-2xl sm:text-3xl ${heading}`}>Was möchtest du mit diesem Foto?</h1>
              <div className="mt-4 divide-y divide-black/10 border-y border-black/10">
                {perPhotoProducts.map((product) => (
                  <div key={product.key} className="flex items-center gap-3 py-3">
                    <ProductMockup
                      productKey={product.key}
                      photo={selected.thumb}
                      accent={accent}
                      parkName={brandName}
                      className="h-14 w-16 shrink-0 sm:h-16 sm:w-20"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight">{product.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#6b6a63]">{product.description}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-sm font-black tabular-nums">{formatEuro(product.price_cents)}</span>
                      <button
                        type="button"
                        onClick={() => addToCart(product, selected.id)}
                        className="whitespace-nowrap rounded-sm px-3 py-1.5 text-[11px] font-black uppercase italic tracking-wide sm:text-xs"
                        style={{ backgroundColor: accent, color: onAccent }}
                      >
                        In den Warenkorb
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-[#6b6a63]">
                <li className="flex items-center gap-2"><Download className="h-3.5 w-3.5" /> Download sofort nach dem Kauf</li>
                <li className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Gedrucktes kommt per Post zu dir nach Hause</li>
                <li className="flex items-center gap-2"><Lock className="h-3.5 w-3.5" /> Sichere Zahlung über Stripe</li>
              </ul>
            </div>
          </div>
        </main>
      ) : (
        <main className="pb-24 sm:pb-0">
          <section className="border-b border-black/10 bg-white">
            <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.05fr_1fr] md:py-14">
              <div>
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>{brandName}</p>
                <h1 className={`mt-2 text-4xl leading-[0.95] sm:text-5xl ${heading}`}>Deine Fahrt.<br />Dein Foto.</h1>
                <p className="mt-4 max-w-md text-base text-[#6b6a63]">
                  {shop.welcomeText ||
                    'Hol dir dein Foto von heute – als Download, Abzug oder auf Tasse, T-Shirt und mehr.'}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a href="#fotos" className={primaryButton} style={{ backgroundColor: accent, color: onAccent }}>
                    Fotos von heute ansehen
                  </a>
                  {minPhotoPrice !== null && <span className="text-sm text-[#6b6a63]">ab {formatEuro(minPhotoPrice)}</span>}
                </div>
                <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#6b6a63]">
                  <li className="flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Sofort-Download</li>
                  <li className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Versand nach Hause</li>
                  <li className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Sichere Zahlung</li>
                </ul>
              </div>
              <div className="relative hidden h-64 md:block">
                {collage.length >= 3 ? (
                  collage.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="absolute w-[52%] bg-white p-2 pb-6 shadow-lg ring-1 ring-black/10"
                      style={{
                        left: `${index * 24}%`,
                        top: `${index === 1 ? 0 : 12}%`,
                        transform: `rotate(${[-5, 2, 6][index]}deg)`,
                        zIndex: index === 1 ? 3 : 1,
                      }}
                    >
                      <div className="relative overflow-hidden">
                        <img src={photo.thumb} alt="" className="aspect-[4/3] w-full scale-[1.02] object-cover blur-[1px]" />
                        <span className="absolute inset-0" style={WATERMARK_STYLE} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center gap-2">
                    <ProductMockup productKey="print" photo={heroPhoto} accent={accent} parkName={brandName} className="h-48 w-56" />
                    <ProductMockup productKey="mug" photo={heroPhoto} accent={accent} parkName={brandName} className="h-44 w-52" />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section id="fotos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className={`text-2xl ${heading}`}>Fotos von heute</h2>
                <p className="mt-1 text-sm text-[#6b6a63]">Tippe auf dein Foto, um es zu kaufen oder auf ein Produkt zu drucken.</p>
              </div>
              {photos.length > 0 && <p className="text-xs uppercase tracking-widest text-[#6b6a63]">{photos.length} Fotos</p>}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.length === 0
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex aspect-[4/3] items-center justify-center rounded-md border border-black/10 bg-white text-black/20">
                      <Camera className="h-6 w-6" />
                    </div>
                  ))
                : photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => setSelected(photo)}
                      className={`group overflow-hidden rounded-md border border-black/10 bg-white text-left transition hover:border-black/30 hover:shadow-md ${index >= 6 && !showAllPhotos ? 'hidden sm:block' : ''}`}
                    >
                      <div className="relative overflow-hidden">
                        <img src={photo.thumb} alt="" className={`${tileAspect} w-full scale-[1.02] object-cover blur-[1px] transition duration-300 group-hover:scale-105`} />
                        <span className="absolute inset-0" style={WATERMARK_STYLE} />
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs">
                        <span className="text-[#6b6a63]">{photoTime(photo.capturedAt)} Uhr</span>
                        {minPhotoPrice !== null && <span className="font-black tabular-nums">ab {formatEuro(minPhotoPrice)}</span>}
                      </div>
                    </button>
                  ))}
            </div>
            {photos.length > 6 && !showAllPhotos && (
              <button
                type="button"
                onClick={() => setShowAllPhotos(true)}
                className="mt-4 w-full rounded-sm border border-black/20 bg-white py-3 text-sm font-black uppercase italic tracking-wide sm:hidden"
              >
                Weitere Fotos anzeigen ({photos.length - 6})
              </button>
            )}
          </section>

          {dayPass && (
            <section className="mx-auto max-w-6xl px-4 pb-10">
              <div className="flex flex-col items-center gap-4 overflow-hidden rounded-md border border-black/10 bg-white sm:flex-row">
                <span className="hidden w-1.5 self-stretch sm:block" style={{ backgroundColor: accent }} />
                <ProductMockup productKey="daypass" photo={heroPhoto} accent={accent} className="mt-4 h-28 w-36 shrink-0 sm:my-4" />
                <div className="flex-1 px-4 text-center sm:px-0 sm:text-left">
                  <p className={`text-lg ${heading}`}>{dayPass.label}</p>
                  <p className="text-sm text-[#6b6a63]">{dayPass.description}</p>
                </div>
                <div className="flex w-full flex-col items-center gap-1 border-t border-black/10 p-4 sm:w-auto sm:border-l sm:border-t-0 sm:px-6">
                  <span className="text-xl font-black tabular-nums">{formatEuro(dayPass.price_cents)}</span>
                  <button type="button" onClick={() => addToCart(dayPass, null)} className={primaryButton} style={{ backgroundColor: accent, color: onAccent }}>
                    In den Warenkorb
                  </button>
                </div>
              </div>
            </section>
          )}

          {perPhotoProducts.length > 1 && (
            <section className="border-t border-black/10 bg-white">
              <div className="mx-auto max-w-6xl px-4 py-10">
                <h2 className={`text-2xl ${heading}`}>Dein Foto auf …</h2>
                <p className="mt-1 text-sm text-[#6b6a63]">Wähle oben dein Foto – diese Produkte kannst du damit bestellen.</p>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {perPhotoProducts.map((product) => (
                    <div key={product.key} className="rounded-md border border-black/10 bg-[#faf9f6] p-3 text-center">
                      <ProductMockup
                        productKey={product.key}
                        photo={heroPhoto}
                        accent={accent}
                        parkName={brandName}
                        className="mx-auto h-24 w-full"
                      />
                      <p className="mt-2 text-sm font-bold leading-tight">{product.label}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-[#6b6a63]">{formatEuro(product.price_cents)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      <footer className="bg-[#1a1a1a] px-4 py-8 text-center text-xs text-white/60">
        <p className="font-black uppercase tracking-widest text-white">{brandName}</p>
        <p className="mt-2">Foto-Shop powered by Liftpictures · Impressum · Datenschutz · AGB</p>
      </footer>

      {added && (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-sm bg-[#1a1a1a] px-4 py-2 text-sm text-white shadow-lg sm:bottom-5">
          {added} liegt im Warenkorb
        </div>
      )}

      {/* Handy: fester Balken, sobald etwas im Warenkorb liegt */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-white p-3 sm:hidden">
          <button type="button" onClick={() => setCartOpen(true)} className={`${primaryButton} w-full`} style={{ backgroundColor: accent, color: onAccent }}>
            <ShoppingBag className="h-4 w-4" /> Warenkorb ({cartCount}) · {formatEuro(cartTotal)}
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setCartOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
              <h2 className={`text-xl ${heading}`}>Warenkorb</h2>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Schließen">
                <X className="h-5 w-5 text-[#6b6a63]" />
              </button>
            </div>
            <div className="flex-1 divide-y divide-black/10 overflow-y-auto px-5">
              {cart.length === 0 && <p className="py-6 text-sm text-[#6b6a63]">Dein Warenkorb ist leer.</p>}
              {cart.map((item, index) => {
                const product = productByKey.get(item.key);
                if (!product) return null;
                const photo = item.photoId ? photoById.get(item.photoId) : null;
                return (
                  <div key={`${item.key}-${item.photoId}`} className="flex items-center gap-3 py-4">
                    <ProductMockup
                      productKey={item.key}
                      photo={photo?.thumb ?? heroPhoto}
                      accent={accent}
                      parkName={brandName}
                      className="h-14 w-16 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{product.label}</p>
                      <p className="text-xs text-[#6b6a63]">
                        {item.photoId ? `Foto #${item.photoId.slice(0, 6).toUpperCase()}` : 'Alle Fotos des Tages'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <button type="button" onClick={() => changeQuantity(index, -1)} className="rounded-sm border border-black/20 p-1" aria-label="Weniger">
                          {item.quantity === 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        </button>
                        <span className="w-4 text-center text-sm tabular-nums">{item.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(index, 1)} className="rounded-sm border border-black/20 p-1" aria-label="Mehr">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <span className="text-sm font-black tabular-nums">{formatEuro(product.price_cents * item.quantity)}</span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-black/10 px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-base font-black">
                <span className="uppercase tracking-wide">Summe</span>
                <span className="tabular-nums">{formatEuro(cartTotal)}</span>
              </div>
              {checkoutError && <p className="mb-2 text-sm text-rose-600">{checkoutError}</p>}
              <button
                type="button"
                disabled={cart.length === 0 || checkingOut}
                onClick={() => void checkout()}
                className={`${primaryButton} w-full`}
                style={{ backgroundColor: accent, color: onAccent }}
              >
                {checkingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                Zur Kasse
              </button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#6b6a63]">
                <Lock className="h-3 w-3" /> Sichere Zahlung über Stripe · Testmodus
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
