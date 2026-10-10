import { Link, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from '../lib/vendor/qrcode.bundle.js';
import { ArrowLeft, CheckCircle2, ChevronDown, ExternalLink, Image as ImageIcon, Monitor, Pencil, Send, Smartphone, X } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import ProductMockup from '../components/shop/ProductMockup';
import { usePark } from '../contexts/ParkContext';
import { aggregateByDate, fetchKioskSales, type AggregatedDay } from '../lib/kioskSales';
import {
  fetchShopOverview,
  saveShopSettings,
  uploadShopLogo,
  type ShopRedemptions,
  type ShopRevenue,
  type ShopSettings,
} from '../lib/shop';
import { formatEuro } from '../lib/demoShop';
import { SHOP_FONTS } from '../lib/shopFonts';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { UpgradeBadge, UpgradePageHeader } from '../components/upgrade/UpgradeHero';

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

function toEditable(settings: ShopSettings, locale: string): EditableProduct[] {
  return settings.products.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    enabled: p.enabled,
    price: (p.price_cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }));
}

function priceToCents(value: string, locale: string): number {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  const group = parts.find((part) => part.type === 'group')?.value;
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const normalized = value.replace(/\s/g, '').split(group ?? '\u0000').join('').replace(decimal, '.');
  return Math.round(Number(normalized) * 100);
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
    <div className="flex flex-col gap-1.5 px-1 py-4 sm:px-6 sm:py-1 sm:first:pl-0">
      <p className={`text-[40px] font-light leading-none tracking-tight ${tone === 'green' ? 'text-brand-600' : 'text-[color:var(--ink)]'}`}>
        {value}
      </p>
      <p className="mt-1 text-sm font-semibold leading-snug text-[color:var(--ink)]">{text}</p>
      {note && <p className="text-xs text-[color:var(--ink-3)]">{note}</p>}
    </div>
  );
}

// Renders the shop at its real size (phone 390px / desktop 1280px) and scales it down to fit.
function PreviewFrame({ src, mode }: { src: string; mode: 'phone' | 'desktop' }) {
  const { t } = useI18n();
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
          title={t('shop.preview_title')}
          src={src}
          style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }}
        />
      </div>
    </div>
  );
}

export default function Shop() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { parkId, parkName, isKioskPark, kioskPriceCents } = usePark();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [days, setDays] = useState<AggregatedDay[] | null>(null);
  const [redemptions, setRedemptions] = useState<ShopRedemptions | null>(null);
  const [revenue, setRevenue] = useState<ShopRevenue | null>(null);
  const editing = useLocation().pathname.endsWith('/bearbeiten');
  const [openSection, setOpenSection] = useState<'design' | 'texts' | 'products' | 'layout' | 'payments' | null>('design');
  const [previewMode, setPreviewMode] = useState<'phone' | 'desktop'>('phone');
  const [dirty, setDirty] = useState(false);
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
    setProducts(toEditable(next, locale));
  }

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    fetchShopOverview(parkId)
      .then(({ settings: s, redemptions: r, revenue: rev }) => {
        if (!active) return;
        applySettings(s);
        setRedemptions(r);
        setRevenue(rev ?? null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : t('shop.load_failed')))
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
        products: products.map((p) => ({ key: p.key, enabled: p.enabled, price_cents: priceToCents(p.price, locale) })),
      });
      applySettings(updated);
      setPreviewVersion((v) => v + 1);
      setDirty(false);
      setStatus(t('shop.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('shop.save_failed'));
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
      setStatus(t('shop.logo_saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('shop.logo_failed'));
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  const requestedAt = settings?.activation_requested_at ? new Date(settings.activation_requested_at) : null;
  const productLabel = (product: EditableProduct) =>
    t(`shop.catalog.${product.key}.label`) === `shop.catalog.${product.key}.label` ? product.label : t(`shop.catalog.${product.key}.label`);
  const productDescription = (product: EditableProduct) =>
    t(`shop.catalog.${product.key}.description`) === `shop.catalog.${product.key}.description` ? product.description : t(`shop.catalog.${product.key}.description`);
  const activeProducts = products.filter((p) => p.enabled);
  const NEW_KEYS = ['poster', 'canvas', 'keychain', 'puzzle'];
  const field = 'mt-1 w-full rounded-lg border border-[color:var(--line-strong)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] focus:border-brand-500 focus:outline-none';
  const touch = () => { setDirty(true); setStatus(null); };

  const statusChip = (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${requestedAt ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'}`}
    >
      {requestedAt ? t('shop.activation_requested') : t('shop.stripe_test')}
    </span>
  );

  const shownMode = editing ? previewMode : 'phone';
  const preview = demoUrl ? (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5">
          {(['phone', 'desktop'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => (mode === 'desktop' && !editing ? setDesktopOpen(true) : setPreviewMode(mode))}
              aria-pressed={shownMode === mode}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs transition-colors ${
                shownMode === mode ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
              }`}
            >
              {mode === 'phone' ? <Smartphone className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
              {mode === 'phone' ? t('shop2.phone') : t('shop.desktop_version')}
            </button>
          ))}
        </div>
        <a
          href={qrUrl ?? demoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('shop.open_demo')}
        </a>
      </div>
      <PreviewFrame key={`${previewVersion}-${shownMode}`} src={`${demoUrl}?embed=1`} mode={shownMode} />
      {qr && !editing && (
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-3">
          <img src={qr} alt={t('shop.preview_qr')} className="h-24 w-24 shrink-0 rounded" />
          <p className="text-xs text-slate-600">
            {t('shop.scan_qr')}
          </p>
        </div>
      )}
    </div>
  ) : (
    <p className="text-sm text-slate-400">{loading ? t('app.loading') : t('shop.preview_unavailable')}</p>
  );

  const desktopDialog = desktopOpen && demoUrl && (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 sm:p-6" onClick={() => setDesktopOpen(false)}>
      <div
        className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-700">{t('shop.desktop_title')}</p>
          <div className="flex items-center gap-2">
            <a
              href={qrUrl ?? demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('shop.open_demo')}
            </a>
            <button type="button" onClick={() => setDesktopOpen(false)} aria-label={t('app.dismiss')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <iframe title={t('shop.desktop_title')} src={`${demoUrl}?embed=1`} className="w-full flex-1 border-0" />
      </div>
    </div>
  );

  // ---------------------------------------------------------------- Editor (/shop/bearbeiten)
  if (editing) {
    const section = (
      key: NonNullable<typeof openSection>,
      title: string,
      subtitle: string,
      children: React.ReactNode,
      badge?: string,
    ) => (
      <div className="border-b border-[color:var(--line)] last:border-0">
        <button
          type="button"
          onClick={() => setOpenSection(openSection === key ? null : key)}
          aria-expanded={openSection === key}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
              {title}
              {badge && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{badge}</span>}
            </span>
            <span className="mt-0.5 block text-xs text-[color:var(--ink-3)]">{subtitle}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${openSection === key ? 'rotate-180' : ''}`} />
        </button>
        {openSection === key && <div className="px-5 pb-5">{children}</div>}
      </div>
    );

    return (
      <div className="space-y-6">
        <UpgradePageHeader
          back={
            <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
              <ArrowLeft className="h-4 w-4" /> {t('shop2.back')}
            </Link>
          }
          title={t('shop2.edit_shop')}
          subtitle={t('shop2.editor_sub')}
          actions={statusChip}
        />

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <GlassCard className="self-start overflow-hidden p-0">
            {loading ? (
              <p className="p-5 text-sm text-slate-400">{t('app.loading')}</p>
            ) : (
              <>
                {section('design', t('shop2.sec_design'), t('shop2.sec_design_sub'), (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-6">
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => { setColor(e.target.value); touch(); }}
                          className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-white"
                        />
                        <span className="text-sm text-slate-500">{color.toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
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
                          {uploadingLogo ? t('shop.uploading') : t('shop.upload_logo')}
                        </button>
                      </div>
                    </div>
                    <label className="block text-xs font-medium text-slate-600">
                      {t('shop.font')}
                      <select value={fontFamily} onChange={(e) => { setFontFamily(e.target.value); touch(); }} className={field}>
                        {SHOP_FONTS.map((font) => (
                          <option key={font.key} value={font.key}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}

                {section('texts', t('shop2.sec_texts'), t('shop2.sec_texts_sub'), (
                  <div className="space-y-4">
                    <label className="block text-xs font-medium text-slate-600">
                      {t('shop.name')}
                      <input value={shopName} maxLength={60} placeholder={parkName ?? t('shop.photo_shop')} onChange={(e) => { setShopName(e.target.value); touch(); }} className={field} />
                    </label>
                    <label className="block text-xs font-medium text-slate-600">
                      {t('shop.welcome_text')}
                      <textarea value={welcomeText} maxLength={240} rows={3} placeholder={t('shop.welcome_placeholder')} onChange={(e) => { setWelcomeText(e.target.value); touch(); }} className={field} />
                    </label>
                  </div>
                ))}

                {section('products', t('shop.products_prices'), t('shop2.active_products', { count: activeProducts.length }), (
                  <div className="divide-y divide-slate-100">
                    {products.map((product, index) => (
                      <div key={product.key} className="flex items-center gap-3 py-2.5">
                        <ProductMockup productKey={product.key} photo={null} accent={color} parkName={parkName ?? ''} className="h-12 w-14 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className={`flex items-center gap-1.5 text-sm font-medium ${product.enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                            <span className="truncate">{productLabel(product)}</span>
                            {NEW_KEYS.includes(product.key) && (
                              <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{t('shop2.new')}</span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500">{productDescription(product)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            value={product.price}
                            inputMode="decimal"
                            disabled={!product.enabled}
                            onChange={(e) => {
                              setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, price: e.target.value } : p)));
                              touch();
                            }}
                            className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm text-slate-700 focus:border-sky-400 focus:outline-none disabled:opacity-50"
                          />
                          <span className="text-sm text-slate-500">€</span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={product.enabled}
                          aria-label={t('shop.offer_product', { product: productLabel(product) })}
                          onClick={() => {
                            setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, enabled: !p.enabled } : p)));
                            touch();
                          }}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition ${product.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${product.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                        </button>
                      </div>
                    ))}
                    <p className="pt-3 text-xs text-slate-500">
                      {t('shop.merch_note')}{kioskPriceCents ? t('shop.kiosk_comparison', { amount: formatEuro(kioskPriceCents, locale) }) : ''}.
                    </p>
                  </div>
                ))}

                {section('layout', t('shop2.sec_layout'), t('shop2.layout_text'), (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-[color:var(--ink-3)]">{t('shop2.layout_text')}</p>
                ), t('plans.soon'))}

                {section('payments', t('shop2.sec_payments'), t('shop.stripe_test'), (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-[color:var(--ink-2)]">{t('shop2.payments_text')}</p>
                ))}
              </>
            )}
          </GlassCard>

          <div className="xl:sticky xl:top-6 xl:self-start">
            <SectionCard title={t('shop.live_preview')} subtitle={t('shop.preview_desc')}>
              <div className="mt-4">{preview}</div>
            </SectionCard>
          </div>
        </div>

        {/* Feste Speichern-Leiste */}
        <div className="sticky bottom-4 z-30 rounded-lg border border-[color:var(--line-strong)] bg-white/95 px-4 py-3 shadow-lg backdrop-blur max-[900px]:bottom-[calc(84px+env(safe-area-inset-bottom,0px))]">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {status && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {status}</span>}
            {dirty && <span className="text-sm text-amber-700">{t('shop2.unsaved')}</span>}
            <button type="button" onClick={() => void handleSave()} disabled={saving || loading || !dirty} className="glass-button-primary disabled:opacity-50">
              {saving ? t('shop.saving') : t('shop.save_preview')}
            </button>
          </div>
        </div>
        {desktopDialog}
      </div>
    );
  }

  // ---------------------------------------------------------------- Übersicht (/shop)
  const hasSales = (revenue?.salesCount ?? 0) > 0;
  const tile = (label: string, value: string | null) => (
    <div className="rounded-lg border border-[color:var(--line)] bg-white p-4">
      <p className="text-xs text-[color:var(--ink-3)]">{label}</p>
      {value !== null ? (
        <p className="mt-1.5 text-[26px] font-light leading-none tracking-tight text-[color:var(--ink)]">{value}</p>
      ) : (
        <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{t('shop2.a_later')}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <UpgradePageHeader
        title={t('nav.shop')}
        actions={
          <>
            {statusChip}
            <Link to="/shop/preise" className="glass-button-secondary">
              {t('shop.view_plans')}
            </Link>
            <Link to="/shop/bearbeiten" className="glass-button-primary">
              <Pencil className="h-4 w-4" />
              {t('shop2.edit_shop')}
            </Link>
          </>
        }
      />

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {isKioskPark && (
        <div className="rounded-xl border border-[color:var(--line)] bg-white p-6 sm:p-8">
          {!requestedAt && (
            <div className="mb-5">
              <UpgradeBadge>{t('nav.upgrade')}</UpgradeBadge>
            </div>
          )}
          {!potential ? (
            <p className="text-sm text-slate-400">{t('shop.calculating')}</p>
          ) : potential.reliable ? (
            <div className="grid grid-cols-1 divide-y divide-[color:var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <BigFact
                value={`${potential.soldPercent} %`}
                text={t('shop.fact_buy_now')}
                note={t('shop.fact_sold_note', { count: potential.sold.toLocaleString(locale), days: POTENTIAL_DAYS })}
              />
              <BigFact
                value={`${potential.unsoldPercent} %`}
                text={t('shop.fact_unsold')}
                note={t('shop.fact_unsold_note', { count: potential.unsold.toLocaleString(locale) })}
                tone="green"
              />
              {redemptions && redemptions.total >= 10 && (
                <BigFact
                  value={`${Math.round((redemptions.delayed / redemptions.total) * 100)} %`}
                  text={t('shop.fact_delayed')}
                  note={t('shop.fact_delayed_note', { delayed: redemptions.delayed.toLocaleString(locale), total: redemptions.total.toLocaleString(locale) })}
                />
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-600">
              {t('shop.no_ride_count')}
            </p>
          )}
          {potential && (
            <div className="mt-6 flex flex-col gap-4 border-t border-[color:var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-3xl text-xl font-light leading-snug text-[color:var(--ink)]">
                {potential.reliable
                  ? t('shop.potential', { count: potential.unsold.toLocaleString(locale) })
                  : t('shop.potential_no_count')}
              </p>
              {requestedAt ? (
                <div className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('shop.requested_on', { date: requestedAt.toLocaleDateString(locale) })}
                </div>
              ) : (
                <Link
                  to="/shop/preise"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[color:var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black"
                >
                  <Send className="h-4 w-4" />
                  {t('shop.view_prices')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-6">
          <SectionCard title={t('shop2.your_shop')} subtitle={loading ? undefined : t('shop2.active_products', { count: activeProducts.length })}>
            {loading ? (
              <p className="mt-4 text-sm text-slate-400">{t('app.loading')}</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
                    {settings?.logo_url ? <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" /> : <ImageIcon className="h-5 w-5 text-slate-300" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{shopName || parkName || t('shop.photo_shop')}</p>
                    <p className="line-clamp-2 text-xs text-[color:var(--ink-3)]">{welcomeText || t('shop.welcome_placeholder')}</p>
                  </div>
                  <span className="h-8 w-8 shrink-0 rounded-full border border-[color:var(--line)]" style={{ backgroundColor: color }} title={color.toUpperCase()} />
                </div>
                <ul className="divide-y divide-[color:var(--line)] border-y border-[color:var(--line)]">
                  {activeProducts.map((product) => (
                    <li key={product.key} className="flex items-center gap-3 py-2">
                      <ProductMockup productKey={product.key} photo={null} accent={color} parkName={parkName ?? ''} className="h-9 w-11 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--ink-2)]">{productLabel(product)}</span>
                      <span className="text-sm font-medium tabular-nums text-[color:var(--ink)]">{product.price} €</span>
                    </li>
                  ))}
                </ul>
                <Link to="/shop/bearbeiten" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                  <Pencil className="h-3.5 w-3.5" /> {t('shop2.edit_shop')}
                </Link>
              </div>
            )}
          </SectionCard>

          <SectionCard title={t('shop2.analytics')} subtitle={hasSales ? t('shop2.a_test_note') : undefined}>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {tile(t('shop2.a_orders'), hasSales ? (revenue?.salesCount ?? 0).toLocaleString(locale) : null)}
              {tile(t('shop2.a_revenue'), hasSales ? formatEuro(revenue?.totalCents ?? 0, locale) : null)}
              {tile(t('shop2.a_rate'), null)}
              {tile(t('shop2.a_top'), null)}
            </div>
          </SectionCard>

          <SectionCard title={t('shop2.roadmap')}>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['shop2.r_orders', 'shop2.r_orders_text'],
                ['shop2.sec_layout', 'shop2.layout_text'],
                ['shop2.r_discount', 'shop2.r_discount_text'],
                ['shop2.r_stats', 'shop2.r_stats_text'],
              ].map(([title, text]) => (
                <li key={title} className="rounded-lg border border-[color:var(--line)] bg-white p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
                    {t(title)}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{t('plans.soon')}</span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--ink-3)]">{t(text)}</p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <SectionCard title={t('shop.live_preview')} subtitle={t('shop.preview_desc')}>
            <div className="mt-4">{preview}</div>
          </SectionCard>
        </div>
      </div>

      {desktopDialog}
    </div>
  );
}
