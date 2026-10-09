import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from '../lib/vendor/qrcode.bundle.js';
import { CheckCircle2, ExternalLink, Image as ImageIcon, Monitor, Send, X } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import ProductMockup from '../components/shop/ProductMockup';
import { usePark } from '../contexts/ParkContext';
import { aggregateByDate, fetchKioskSales, type AggregatedDay } from '../lib/kioskSales';
import {
  fetchShopOverview,
  saveShopSettings,
  uploadShopLogo,
  type ShopRedemptions,
  type ShopSettings,
} from '../lib/shop';
import { formatEuro } from '../lib/demoShop';
import { SHOP_FONTS } from '../lib/shopFonts';

// The public shop lives on the claim site (imst repo), so phones and customers can open it.
const PUBLIC_SHOP_URL = 'https://liftpictures-fotos.de';
const POTENTIAL_DAYS = 30;

type EditableProduct = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  price: string;
};

function toEditable(settings: ShopSettings): EditableProduct[] {
  return settings.products.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    enabled: p.enabled,
    price: (p.price_cents / 100).toFixed(2).replace('.', ','),
  }));
}

function priceToCents(value: string): number {
  return Math.round(Number(value.replace(',', '.')) * 100);
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </GlassCard>
  );
}

function BigFact({ value, text, note, tone }: { value: string; text: string; note?: string; tone?: 'green' }) {
  return (
    <div className="flex flex-col gap-1.5 px-1 py-3 sm:px-5 sm:py-0">
      <p className={`text-4xl font-black leading-none tracking-tight ${tone === 'green' ? 'text-emerald-600' : 'text-slate-800'}`}>
        {value}
      </p>
      <p className="text-sm font-semibold leading-snug text-slate-800">{text}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}

// Renders the shop at its real size (phone 390px / desktop 1280px) and scales it down to fit.
function PreviewFrame({ src, mode }: { src: string; mode: 'phone' | 'desktop' }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const frameWidth = mode === 'phone' ? 390 : 1280;
  const frameHeight = mode === 'phone' ? 780 : 820;

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = width ? Math.min(1, width / frameWidth) : 1;
  return (
    <div ref={wrapperRef} className="w-full">
      <div
        className={`mx-auto overflow-hidden bg-white shadow-xl ${mode === 'phone' ? 'rounded-[2rem] ring-8 ring-slate-900' : 'rounded-xl ring-1 ring-slate-200'}`}
        style={{ width: frameWidth * scale, height: frameHeight * scale }}
      >
        <iframe
          title="Shop-Vorschau"
          src={src}
          style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }}
        />
      </div>
    </div>
  );
}

export default function Shop() {
  const { parkId, parkName, isKioskPark, kioskPriceCents } = usePark();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [days, setDays] = useState<AggregatedDay[] | null>(null);
  const [redemptions, setRedemptions] = useState<ShopRedemptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [welcomeText, setWelcomeText] = useState('');
  const [color, setColor] = useState('#C6A233');
  const [fontFamily, setFontFamily] = useState('system');
  const [products, setProducts] = useState<EditableProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [qr, setQr] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  function applySettings(next: ShopSettings) {
    setSettings(next);
    setShopName(next.shop_name ?? '');
    setWelcomeText(next.welcome_text ?? '');
    setColor(next.accent_color);
    setFontFamily(next.font_family ?? 'system');
    setProducts(toEditable(next));
  }

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    fetchShopOverview(parkId)
      .then(({ settings: s, redemptions: r }) => {
        if (!active) return;
        applySettings(s);
        setRedemptions(r);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    if (isKioskPark) {
      fetchKioskSales(parkId)
        .then((result) => active && setDays(aggregateByDate(result.days, result.priceCents ?? 0)))
        .catch(() => active && setDays([]));
    }
    return () => {
      active = false;
    };
  }, [parkId, isKioskPark]);

  // Keep the big numbers live: refresh sales + redemptions every minute while the
  // tab is visible. Only these two are touched - never the form the operator is editing.
  useEffect(() => {
    if (!parkId || !isKioskPark) return;
    let active = true;
    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      const [sales, overview] = await Promise.allSettled([fetchKioskSales(parkId!), fetchShopOverview(parkId!)]);
      if (!active) return;
      if (sales.status === 'fulfilled') setDays(aggregateByDate(sales.value.days, sales.value.priceCents ?? 0));
      if (overview.status === 'fulfilled') setRedemptions(overview.value.redemptions);
    }
    const timer = window.setInterval(() => void refresh(), 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [parkId, isKioskPark]);

  const demoUrl = settings ? `${window.location.origin}/demo-shop/${settings.demo_token}` : null;
  const qrUrl = settings ? `${PUBLIC_SHOP_URL}/demo-shop/${settings.demo_token}` : null;

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [qrUrl]);

  const potential = useMemo(() => {
    if (!days) return null;
    const cutoff = new Date(Date.now() - POTENTIAL_DAYS * 86_400_000).toISOString().slice(0, 10);
    const recent = days.filter((d) => d.businessDate > cutoff);
    // Only days where ride count AND sales are both recorded and plausible
    // (sales never exceed rides) - old days with rides but no sales record, or
    // a broken ride counter, would otherwise fake "100 % unsold".
    const withRides = recent.filter(
      (d) => d.expectedCount !== null && d.expectedCount > 0 && d.soldCount > 0 && d.soldCount <= d.expectedCount,
    );
    const rides = withRides.reduce((sum, d) => sum + (d.expectedCount ?? 0), 0);
    const soldOnRideDays = withRides.reduce((sum, d) => sum + d.soldCount, 0);
    const sold = recent.reduce((sum, d) => sum + d.soldCount, 0);
    const unsold = Math.max(0, rides - soldOnRideDays);
    const reliable = withRides.length >= 3;
    const soldPercent = rides > 0 ? Math.round((soldOnRideDays / rides) * 100) : 0;
    return { rides, sold, unsold, reliable, soldPercent, unsoldPercent: rides > 0 ? 100 - soldPercent : 0 };
  }, [days]);

  async function handleSave() {
    if (!parkId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await saveShopSettings(parkId, {
        shop_name: shopName,
        welcome_text: welcomeText,
        accent_color: color,
        font_family: fontFamily,
        products: products.map((p) => ({ key: p.key, enabled: p.enabled, price_cents: priceToCents(p.price) })),
      });
      applySettings(updated);
      setPreviewVersion((v) => v + 1);
      setStatus('Gespeichert – die Vorschau ist aktualisiert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(file: File) {
    if (!parkId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      applySettings(await uploadShopLogo(parkId, file));
      setPreviewVersion((v) => v + 1);
      setStatus('Logo gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo-Upload fehlgeschlagen.');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  const requestedAt = settings?.activation_requested_at ? new Date(settings.activation_requested_at) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Shop</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/shop/preise"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Preise und Pakete ansehen
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${requestedAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
        >
          {requestedAt ? 'Aktivierung angefragt' : 'Stripe-Modus: Test'}
        </span>
        </div>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {status && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p>}

      {isKioskPark && (
        <GlassCard className="p-4 sm:p-5">
          {!potential ? (
            <p className="text-sm text-slate-400">Wird berechnet…</p>
          ) : potential.reliable ? (
            <div className="grid grid-cols-1 divide-y divide-slate-200/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <BigFact
                value={`${potential.soldPercent} %`}
                text="deiner Besucher kaufen ihr Bild sofort am Automaten."
                note={`${potential.sold.toLocaleString('de-DE')} Bilder in den letzten ${POTENTIAL_DAYS} Tagen`}
              />
              <BigFact
                value={`${potential.unsoldPercent} %`}
                text="deiner Bilder sind vorhanden – wurden aber nie wieder zum Kauf angeboten."
                note={`${potential.unsold.toLocaleString('de-DE')} unverkaufte Bilder`}
                tone="green"
              />
              {redemptions && redemptions.total >= 10 && (
                <BigFact
                  value={`${Math.round((redemptions.delayed / redemptions.total) * 100)} %`}
                  text="deiner Besucher lösen ihr Bild erst am nächsten Tag oder nach Parkschluss digital ein."
                  note={`${redemptions.delayed.toLocaleString('de-DE')} von ${redemptions.total.toLocaleString('de-DE')} Einlösungen`}
                />
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-600">
              Sobald die Fahrtenzählung deines Parks läuft, siehst du hier live, wie viele deiner Bilder nie verkauft
              wurden.
            </p>
          )}
          {potential && (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base font-bold leading-snug text-slate-800">
                {potential.reliable
                  ? `Biete ${potential.unsold.toLocaleString('de-DE')} unverkaufte Bilder deinen Kunden erneut zum Kauf an – als Download oder personalisiert auf Tasse, T-Shirt & Co.`
                  : 'Biete deine unverkauften Bilder deinen Kunden erneut zum Kauf an – als Download oder auf Tasse, T-Shirt & Co.'}
              </p>
              {requestedAt ? (
                <div className="flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Angefragt am {requestedAt.toLocaleDateString('de-DE')}
                </div>
              ) : (
                <Link
                  to="/shop/preise"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Send className="h-4 w-4" />
                  Preise ansehen
                </Link>
              )}
            </div>
          )}
        </GlassCard>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-6">
          <SectionCard title="Aussehen" subtitle="Name, Begrüßung, Farbe und Logo deines Shops">
            {loading ? (
              <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
            ) : (
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Shop-Name</span>
                  <input
                    value={shopName}
                    maxLength={60}
                    placeholder={parkName ?? 'Foto-Shop'}
                    onChange={(e) => setShopName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Begrüßungstext</span>
                  <textarea
                    value={welcomeText}
                    maxLength={240}
                    rows={2}
                    placeholder="Hol dir dein Foto von heute – als Download, Abzug oder auf Tasse, T-Shirt und mehr."
                    onChange={(e) => setWelcomeText(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Schriftart</span>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                  >
                    {SHOP_FONTS.map((font) => (
                      <option key={font.key} value={font.key}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-white"
                    />
                    <span className="text-sm text-slate-500">{color.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white/60">
                      {settings?.logo_url ? (
                        <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleLogoChange(file);
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {uploadingLogo ? 'Wird hochgeladen…' : 'Logo hochladen'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Produkte & Preise" subtitle="Was deine Gäste im Shop kaufen können">
            {loading ? (
              <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {products.map((product, index) => (
                  <div key={product.key} className="flex items-center gap-3 py-2.5">
                    <ProductMockup productKey={product.key} photo={null} accent={color} parkName={parkName ?? ''} className="h-12 w-14 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${product.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{product.label}</p>
                      <p className="truncate text-xs text-slate-500">{product.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        value={product.price}
                        inputMode="decimal"
                        disabled={!product.enabled}
                        onChange={(e) =>
                          setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, price: e.target.value } : p)))
                        }
                        className="w-20 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-right text-sm text-slate-700 focus:border-sky-400 focus:outline-none disabled:opacity-50"
                      />
                      <span className="text-sm text-slate-500">€</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={product.enabled}
                      aria-label={`${product.label} anbieten`}
                      onClick={() =>
                        setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p)))
                      }
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${product.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${product.enabled ? 'left-[22px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>
                ))}
                <p className="pt-3 text-xs text-slate-500">
                  Merchandise wird nach der Aktivierung über einen Druckpartner produziert und direkt an deine Gäste
                  verschickt{kioskPriceCents ? ` – zum Vergleich: am Automaten kostet ein Foto ${formatEuro(kioskPriceCents)}` : ''}.
                </p>
              </div>
            )}
          </SectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
            >
              {saving ? 'Speichert…' : 'Speichern & Vorschau aktualisieren'}
            </button>
          </div>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <SectionCard title="Live-Vorschau" subtitle="So sehen deine Gäste den Shop">
            {demoUrl ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDesktopOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Desktop-Version
                  </button>
                  <a
                    href={qrUrl ?? demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Demo im Browser öffnen
                  </a>
                </div>
                <PreviewFrame key={previewVersion} src={`${demoUrl}?embed=1`} mode="phone" />
                {qr && (
                  <div className="flex items-center gap-4 rounded-xl bg-white/60 p-3">
                    <img src={qr} alt="QR-Code zur Shop-Vorschau" className="h-24 w-24 shrink-0 rounded" />
                    <p className="text-xs text-slate-600">
                      Mit dem Handy scannen und den Shop selbst ausprobieren – inklusive Test-Checkout mit der Karte
                      4242 4242 4242 4242.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">{loading ? 'Wird geladen…' : 'Vorschau nicht verfügbar.'}</p>
            )}
          </SectionCard>
        </div>
      </div>

      {desktopOpen && demoUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 sm:p-6" onClick={() => setDesktopOpen(false)}>
          <div
            className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-700">Desktop-Version deines Shops</p>
              <div className="flex items-center gap-2">
                <a
                  href={qrUrl ?? demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Demo im Browser öffnen
                </a>
                <button type="button" onClick={() => setDesktopOpen(false)} aria-label="Schließen" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <iframe title="Shop Desktop-Version" src={`${demoUrl}?embed=1`} className="w-full flex-1 border-0" />
          </div>
        </div>
      )}
    </div>
  );
}
