// Seite „Online-Shop“ für Online-Foto-Parks (Kalahari) als Baukasten.
// Ansicht: große Live-Vorschau der echten Gästeseiten (Fotoshop, Bildschirm vor Ort, Seite nach dem Kauf),
// links eine Übersicht der Einstellungen. „Bearbeiten“ öffnet den Editor über die ganze Seite: links alle
// Einstellungen (Verkauf, Logo & Farben, Texte, Bildschirm, Nach dem Kauf), rechts die Vorschau, die jede
// Änderung sofort zeigt (per postMessage an die Seite im iframe). Erst „Veröffentlichen“ speichert.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Check, ChevronDown, CreditCard, ExternalLink, Image as ImageIcon, Mail, Monitor, Palette, Pencil, RotateCcw,
  ShoppingBag, Smartphone, Sparkles, Tv, Type, Upload,
} from 'lucide-react';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { DEFAULT_OFFERS, onlineShopSettings, uploadOnlineLogo, type OnlineCustomization, type OnlineOffers, type OnlineShopSettings } from '../lib/onlinePark';
import VoucherManager from './online/VoucherManager';

type Page = 'shop' | 'screen' | 'unlocked';
type Device = 'desktop' | 'mobile';
type Section = 'sale' | 'brand' | 'shop' | 'screen' | 'after';
type Draft = { unlock_mode: 'purchase' | 'email'; price_cents: number; customization: OnlineCustomization; offers: OnlineOffers };

// Lokal testbar mit VITE_GUEST_SITE=http://localhost:5193 (Gästeseiten-Repo im Dev-Modus).
const SITE = (import.meta.env.VITE_GUEST_SITE as string | undefined) ?? 'https://liftpictures-fotos.de';
const KALAHARI = { navy: '#002858', blue: '#1f73c8', gold: '#fdb927' };
const DEFAULT_LOGO = `${SITE}/kalahari/kalahari-logo-white.webp`;
const DEFAULTS = {
  shop: { eyebrow: 'TOM FOOLERYS ADVENTURE PARK', title: 'Find your adventure photo', text: 'Every climb, zip and leap — captured. Search by the time of your visit or by the number on your photo, then take the original home.' },
  screen: { eyebrow: 'TOM FOOLERYS ADVENTURE PARK · VIRGINIA', headline: 'Spot your adventure. Scan your photo.', qr_label_buy: 'SCAN TO BUY', qr_label_free: 'SCAN TO UNLOCK' },
};
const PAGE_FOR: Record<Section, Page | null> = { sale: null, brand: null, shop: 'shop', screen: 'screen', after: 'unlocked' };

function pageUrl(path: string, page: Page) {
  return `${SITE}/${path}/${page === 'unlocked' ? 'claim' : page}?lp_preview=${page}`;
}

/* ------------------------------------------------------------------ Vorschau */

function PreviewFrame({ path, page, device, draft }: { path: string; page: Page; device: Device; draft: Draft }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const send = useCallback(() => {
    const d = draftRef.current;
    frame.current?.contentWindow?.postMessage({ type: 'lp-online-preview', payload: { custom: d.customization, unlock_mode: d.unlock_mode, price_cents: d.price_cents, offers: d.offers } }, SITE);
  }, []);
  useEffect(() => { send(); }, [draft, send]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === SITE && e.data?.type === 'lp-online-preview-ready') send(); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [send]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = device === 'desktop' ? 1366 : 390;
  const H = device === 'desktop' ? 860 : 820;
  const scale = size.w && size.h ? Math.min(size.w / W, size.h / H, 1) : 0.5;
  return (
    <div ref={box} className="relative flex h-full min-h-[420px] w-full items-start justify-center overflow-hidden">
      <div
        className={`relative shrink-0 overflow-hidden bg-white shadow-[0_12px_40px_rgba(16,24,40,0.18)] ${device === 'mobile' ? 'rounded-[34px] ring-[10px] ring-slate-900' : 'rounded-lg ring-1 ring-[color:var(--line-strong)]'}`}
        style={{ width: W * scale, height: H * scale }}
      >
        <iframe
          key={`${page}-${device}`}
          ref={frame}
          title="Preview"
          src={pageUrl(path, page)}
          onLoad={send}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{ width: W, height: H, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

function Toolbar({ page, setPage, device, setDevice }: { page: Page; setPage: (p: Page) => void; device: Device; setDevice: (d: Device) => void }) {
  const { t } = useI18n();
  const pages: [Page, string, typeof Monitor][] = [['shop', t('shopx.page_shop'), ShoppingBag], ['screen', t('shopx.page_screen'), Tv], ['unlocked', t('shopx.page_unlocked'), Sparkles]];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-[color:var(--line-strong)] bg-white p-0.5" role="tablist">
        {pages.map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={page === id} onClick={() => setPage(id)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${page === id ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="inline-flex rounded-md border border-[color:var(--line-strong)] bg-white p-0.5">
        {([['desktop', Monitor], ['mobile', Smartphone]] as const).map(([id, Icon]) => (
          <button key={id} type="button" aria-pressed={device === id} title={t(`shopx.${id}`)} aria-label={t(`shopx.${id}`)} onClick={() => setDevice(id)}
            className={`rounded px-2.5 py-1.5 transition ${device === id ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'}`}>
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Formular-Bausteine */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[color:var(--ink-2)]">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex w-fit rounded-md border border-[color:var(--line-strong)] p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${value === v ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (v: string | undefined) => void }) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  return (
    <div className="flex items-center gap-3">
      <input type="color" aria-label={label} value={value ?? fallback} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-11 cursor-pointer rounded-md border border-[color:var(--line-strong)] bg-white p-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[color:var(--ink-2)]">{label}</p>
        <input className="glass-input mt-0.5 w-28 py-1 font-mono text-xs" value={text} placeholder={fallback}
          onChange={(e) => { setText(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); if (!e.target.value) onChange(undefined); }} />
      </div>
    </div>
  );
}

function Panel({ id, open, setOpen, icon: Icon, title, summary, children }: {
  id: Section; open: Section | null; setOpen: (s: Section | null) => void; icon: typeof Monitor; title: string; summary: string; children: ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="border-b border-[color:var(--line)]">
      <button type="button" onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[color:var(--ink)]">{title}</span>
          <span className="block truncate text-xs text-[color:var(--ink-3)]">{summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--ink-3)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="space-y-4 px-4 pb-5">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function OnlinePhotoShop({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [data, setData] = useState<OnlineShopSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<Section | null>('sale');
  const [page, setPage] = useState<Page>('shop');
  const [device, setDevice] = useState<Device>('desktop');
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fromSettings = (d: OnlineShopSettings): Draft => ({ unlock_mode: d.unlock_mode, price_cents: d.price_cents, customization: d.customization ?? {}, offers: d.offers ?? DEFAULT_OFFERS });
  useEffect(() => {
    let cancelled = false;
    onlineShopSettings(parkId)
      .then((d) => { if (!cancelled) { setData(d); setDraft(fromSettings(d)); setPriceText((d.price_cents / 100).toFixed(2)); } })
      .catch(() => { if (!cancelled) setError(t('photo_shop.error')); });
    return () => { cancelled = true; };
  }, [parkId, t]);

  const dirty = Boolean(data && draft && JSON.stringify(fromSettings(data)) !== JSON.stringify(draft));
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: data?.currency ?? 'USD' }).format(cents / 100);

  function setCustom(sectionKey: keyof OnlineCustomization, key: string, value: unknown) {
    setDraft((d) => d && ({ ...d, customization: { ...d.customization, [sectionKey]: { ...(d.customization[sectionKey] ?? {}), [key]: value === '' ? undefined : value } } }));
    setSaved(null);
  }
  function setOffers(patch: Partial<OnlineOffers>) {
    setDraft((d) => d && ({ ...d, offers: { ...d.offers, ...patch } }));
    setSaved(null);
  }
  function setPack(i: number, patch: Partial<OnlineOffers['packages'][number]>) {
    setDraft((d) => d && ({ ...d, offers: { ...d.offers, packages: d.offers.packages.map((p, k) => (k === i ? { ...p, ...patch } : p)) } }));
    setSaved(null);
  }
  function openSection(s: Section | null) {
    setSection(s);
    const p = s ? PAGE_FOR[s] : null;
    if (p) setPage(p);
  }
  function startEditing(s: Section = 'sale') { setEditing(true); openSection(s); setSaved(null); setError(null); }

  async function publish() {
    if (!draft || !data) return;
    const cents = Math.round(Number(priceText.replace(',', '.')) * 100);
    if (!(cents >= 100 && cents <= 10000)) { setError(t('shopx.price_range')); openSection('sale'); return; }
    if (draft.offers.packages.some((p) => p.photos < 2 || p.photos > 20 || p.price_cents < 100 || p.price_cents > 50000)) { setError(t('shopx.pack_invalid_full')); openSection('sale'); return; }
    if (draft.unlock_mode === 'purchase' && !draft.offers.single && !draft.offers.packages.length) { setError(t('shopx.nothing_to_sell')); openSection('sale'); return; }
    setBusy(true); setError(null);
    try {
      const next = await onlineShopSettings(parkId, { unlock_mode: draft.unlock_mode, price_cents: cents, customization: draft.customization, offers: draft.offers });
      setData(next); setDraft(fromSettings(next)); setPriceText((next.price_cents / 100).toFixed(2));
      setSaved(t('shopx.published'));
    } catch (e) {
      setError(e instanceof Error && /https/.test(e.message) ? t('shopx.link_https') : t('photo_shop.error'));
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    if (!data) return;
    setDraft(fromSettings(data)); setPriceText((data.price_cents / 100).toFixed(2)); setSaved(null); setError(null);
  }
  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoBusy(true); setError(null);
    try {
      setCustom('brand', 'logo_url', await uploadOnlineLogo(parkId, file));
    } catch (e) {
      setError(e instanceof Error && e.message === 'size' ? t('shopx.logo_size') : t('shopx.logo_type'));
    } finally {
      setLogoBusy(false);
    }
  }

  if (!data || !draft) {
    return error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : <div className="h-96 animate-pulse rounded-xl bg-slate-100" />;
  }

  const c = draft.customization;
  const brand = c.brand ?? {}, shop = c.shop ?? {}, screen = c.screen ?? {}, after = c.after ?? {};
  const input = 'glass-input w-full';
  const free = draft.unlock_mode === 'email';
  const summaries: Record<Section, string> = {
    sale: [
      free ? t('photo_shop.email') : draft.offers.single ? `${t('photo_shop.paid')} · ${money(draft.price_cents)}` : t('photo_shop.paid'),
      !free && draft.offers.packages.length ? t('shopx.n_packages', { n: draft.offers.packages.length }) : '',
      draft.offers.codes ? t('shopx.codes_on') : '',
    ].filter(Boolean).join(' · '),
    brand: brand.logo_url || brand.navy || brand.blue || brand.gold ? t('shopx.brand_custom') : t('shopx.brand_default'),
    shop: shop.title ?? DEFAULTS.shop.title,
    screen: `${t(`shopx.speed_${screen.speed ?? 'normal'}`)} · ${t('shopx.rows')} ${screen.rows ?? 2}`,
    after: after.enabled ? after.title || t('shopx.on') : t('shopx.off'),
  };

  const panels = (
    <>
      <Panel id="sale" open={section} setOpen={openSection} icon={CreditCard} title={t('shopx.sec_sale')} summary={summaries.sale}>
        <div className="grid gap-2" role="radiogroup">
          {([['purchase', CreditCard, t('photo_shop.paid'), 'Stripe'], ['email', Mail, t('photo_shop.email'), t('photo_shop.consent')]] as const).map(([mode, Icon, title, text]) => {
            const active = draft.unlock_mode === mode;
            return (
              <button key={mode} type="button" role="radio" aria-checked={active} onClick={() => setDraft({ ...draft, unlock_mode: mode })}
                className={`relative rounded-lg border p-3 text-left transition ${active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'}`}>
                <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]"><Icon className="h-4 w-4 text-[color:var(--ink-3)]" />{title}</span>
                <span className="mt-0.5 block text-xs text-[color:var(--ink-2)]">{text}</span>
                {active && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-600" />}
              </button>
            );
          })}
        </div>
        {!free && (
          <div className="space-y-3 rounded-lg border border-[color:var(--line)] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.single')}</p>
              <Segmented value={draft.offers.single ? 'on' : 'off'} onChange={(v) => setOffers({ single: v === 'on' })} options={[['off', t('shopx.off')], ['on', t('shopx.on')]]} />
            </div>
            <Field label={`${t('photo_shop.price_label')} (${data.currency})`}>
              <input className="glass-input w-32" inputMode="decimal" value={priceText}
                onChange={(e) => {
                  setPriceText(e.target.value);
                  const v = Math.round(Number(e.target.value.replace(',', '.')) * 100);
                  if (v >= 100 && v <= 10000) setDraft({ ...draft, price_cents: v });
                }} />
            </Field>
          </div>
        )}
        {!free && (
          <div className="space-y-2 rounded-lg border border-[color:var(--line)] p-3">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.packages')}</p>
            <p className="text-xs text-[color:var(--ink-3)]">{t('shopx.packages_hint')}</p>
            {draft.offers.packages.map((pk, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <input className="glass-input w-16" inputMode="numeric" value={pk.photos || ''} aria-label={t('shopx.pack_photos')}
                  onChange={(e) => setPack(i, { photos: Math.max(0, Math.min(20, Number(e.target.value.replace(/\D/g, '')) || 0)) })} />
                <span className="text-[color:var(--ink-2)]">{t('shopx.pack_for')}</span>
                <input className="glass-input w-24" inputMode="decimal" defaultValue={(pk.price_cents / 100).toFixed(2)} aria-label={t('shopx.pack_price')}
                  onChange={(e) => setPack(i, { price_cents: Math.round(Number(e.target.value.replace(',', '.')) * 100) || 0 })} />
                <span className="text-xs text-[color:var(--ink-3)]">
                  {pk.photos >= 2 && pk.price_cents >= 100 ? `${money(Math.round(pk.price_cents / pk.photos))} ${t('shopx.per_photo')}` : t('shopx.pack_invalid')}
                </span>
                <button type="button" className="ml-auto text-xs text-[color:var(--ink-3)] hover:text-rose-700" onClick={() => setOffers({ packages: draft.offers.packages.filter((_, k) => k !== i) })}>{t('shopx.remove')}</button>
              </div>
            ))}
            {draft.offers.packages.length < 4 && (
              <button type="button" className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => {
                  const n = (draft.offers.packages[draft.offers.packages.length - 1]?.photos ?? 1) + 2;
                  setOffers({ packages: [...draft.offers.packages, { photos: Math.min(n, 20), price_cents: Math.round(Math.min(n, 20) * draft.price_cents * 0.8) }] });
                }}>+ {t('shopx.add_package')}</button>
            )}
          </div>
        )}
        <div className="space-y-2 rounded-lg border border-[color:var(--line)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.codes')}</p>
            <Segmented value={draft.offers.codes ? 'on' : 'off'} onChange={(v) => setOffers({ codes: v === 'on' })} options={[['off', t('shopx.off')], ['on', t('shopx.on')]]} />
          </div>
          <p className="text-xs text-[color:var(--ink-3)]">{t('shopx.codes_hint')}</p>
        </div>
        <p className="text-xs text-[color:var(--ink-3)]">{t('shopx.price_stripe')}</p>
      </Panel>

      <Panel id="brand" open={section} setOpen={openSection} icon={Palette} title={t('shopx.sec_brand')} summary={summaries.brand}>
        <div>
          <p className="text-xs font-medium text-[color:var(--ink-2)]">{t('shopx.logo')}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="flex h-14 w-28 items-center justify-center rounded-md p-1.5" style={{ background: brand.blue ?? KALAHARI.blue }}>
              <img src={brand.logo_url ?? DEFAULT_LOGO} alt="" className="max-h-full max-w-full object-contain" />
            </span>
            <div className="flex flex-col gap-1.5">
              <label className={`glass-button-secondary cursor-pointer ${logoBusy ? 'opacity-60' : ''}`}>
                <Upload className="h-3.5 w-3.5" /> {logoBusy ? t('app.loading') : t('shopx.logo_upload')}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={logoBusy} onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {brand.logo_url && (
                <button type="button" className="text-left text-xs text-[color:var(--ink-3)] hover:underline" onClick={() => setCustom('brand', 'logo_url', undefined)}>{t('shopx.logo_reset')}</button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-[color:var(--ink-3)]">{t('shopx.logo_hint')}</p>
        </div>
        <div className="space-y-3">
          <ColorField label={t('shopx.color_blue')} value={brand.blue} fallback={KALAHARI.blue} onChange={(v) => setCustom('brand', 'blue', v)} />
          <ColorField label={t('shopx.color_navy')} value={brand.navy} fallback={KALAHARI.navy} onChange={(v) => setCustom('brand', 'navy', v)} />
          <ColorField label={t('shopx.color_gold')} value={brand.gold} fallback={KALAHARI.gold} onChange={(v) => setCustom('brand', 'gold', v)} />
        </div>
        {(brand.navy || brand.blue || brand.gold) && (
          <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
            onClick={() => setDraft({ ...draft, customization: { ...c, brand: { logo_url: brand.logo_url } } })}>
            <RotateCcw className="h-3 w-3" /> {t('shopx.colors_reset')}
          </button>
        )}
      </Panel>

      <Panel id="shop" open={section} setOpen={openSection} icon={Type} title={t('shopx.shop_page')} summary={summaries.shop}>
        <Field label={t('shopx.eyebrow')}><input className={input} maxLength={60} placeholder={DEFAULTS.shop.eyebrow} value={shop.eyebrow ?? ''} onChange={(e) => setCustom('shop', 'eyebrow', e.target.value)} /></Field>
        <Field label={t('shopx.title')}><input className={input} maxLength={60} placeholder={DEFAULTS.shop.title} value={shop.title ?? ''} onChange={(e) => setCustom('shop', 'title', e.target.value)} /></Field>
        <Field label={t('shopx.text')}><textarea className={input} rows={4} maxLength={240} placeholder={DEFAULTS.shop.text} value={shop.text ?? ''} onChange={(e) => setCustom('shop', 'text', e.target.value)} /></Field>
      </Panel>

      <Panel id="screen" open={section} setOpen={openSection} icon={Tv} title={t('shopx.screen_page')} summary={summaries.screen}>
        <Field label={t('shopx.eyebrow')}><input className={input} maxLength={60} placeholder={DEFAULTS.screen.eyebrow} value={screen.eyebrow ?? ''} onChange={(e) => setCustom('screen', 'eyebrow', e.target.value)} /></Field>
        <Field label={t('shopx.headline')}><input className={input} maxLength={70} placeholder={DEFAULTS.screen.headline} value={screen.headline ?? ''} onChange={(e) => setCustom('screen', 'headline', e.target.value)} /></Field>
        <Field label={t('shopx.qr_buy')}><input className={input} maxLength={24} placeholder={DEFAULTS.screen.qr_label_buy} value={screen.qr_label_buy ?? ''} onChange={(e) => setCustom('screen', 'qr_label_buy', e.target.value)} /></Field>
        <Field label={t('shopx.qr_free')}><input className={input} maxLength={24} placeholder={DEFAULTS.screen.qr_label_free} value={screen.qr_label_free ?? ''} onChange={(e) => setCustom('screen', 'qr_label_free', e.target.value)} /></Field>
        <Field label={t('shopx.speed')}>
          <Segmented value={screen.speed ?? 'normal'} onChange={(v) => setCustom('screen', 'speed', v)} options={[['slow', t('shopx.speed_slow')], ['normal', t('shopx.speed_normal')], ['fast', t('shopx.speed_fast')]]} />
        </Field>
        <div className="flex flex-wrap gap-6">
          <Field label={t('shopx.rows')}><Segmented value={screen.rows ?? 2} onChange={(v) => setCustom('screen', 'rows', v)} options={[[1, '1'], [2, '2']]} /></Field>
          <Field label={t('shopx.show_price')}>
            <Segmented value={screen.show_price === false ? 'no' : 'yes'} onChange={(v) => setCustom('screen', 'show_price', v === 'yes')} options={[['yes', t('shopx.yes')], ['no', t('shopx.no')]]} />
          </Field>
        </div>
      </Panel>

      <Panel id="after" open={section} setOpen={openSection} icon={Sparkles} title={t('shopx.after_title')} summary={summaries.after}>
        <Segmented value={after.enabled ? 'on' : 'off'} onChange={(v) => setCustom('after', 'enabled', v === 'on')} options={[['off', t('shopx.off')], ['on', t('shopx.on')]]} />
        <p className="text-xs text-[color:var(--ink-3)]">{t('shopx.after_sub')}</p>
        <Field label={t('shopx.title')}><input className={input} maxLength={80} placeholder="Enjoy 10% off at the gift shop" value={after.title ?? ''} onChange={(e) => setCustom('after', 'title', e.target.value)} /></Field>
        <Field label={t('shopx.text')}><textarea className={input} rows={3} maxLength={300} placeholder="Show this page at the Tom Foolerys front desk today." value={after.text ?? ''} onChange={(e) => setCustom('after', 'text', e.target.value)} /></Field>
        <Field label={t('shopx.button_label')}><input className={input} maxLength={30} placeholder="Book your next visit" value={after.button_label ?? ''} onChange={(e) => setCustom('after', 'button_label', e.target.value)} /></Field>
        <Field label={t('shopx.button_url')}><input className={input} type="url" maxLength={400} placeholder="https://…" value={after.button_url ?? ''} onChange={(e) => setCustom('after', 'button_url', e.target.value)} /></Field>
      </Panel>
    </>
  );

  const notices = (
    <>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{saved}</p>}
    </>
  );

  /* ---------------- Editor über die ganze Seite */
  if (editing) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-slate-100">
        <header className="flex flex-wrap items-center gap-3 border-b border-[color:var(--line)] bg-white px-4 py-2.5">
          <button type="button" className="glass-button-secondary" onClick={() => setEditing(false)}>
            <ArrowLeft className="h-4 w-4" /> {t('shopx.back')}
          </button>
          <p className="mr-auto text-sm font-semibold text-[color:var(--ink)]">
            {t('shopx.editor_title')}
            {dirty && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">{t('shopx.unsaved')}</span>}
          </p>
          <Toolbar page={page} setPage={setPage} device={device} setDevice={setDevice} />
          <button type="button" className="glass-button-secondary" disabled={!dirty || busy} onClick={discard}>{t('shopx.discard')}</button>
          <button type="button" className="glass-button-primary" disabled={!dirty || busy} onClick={() => void publish()}>{busy ? t('app.loading') : t('shopx.publish')}</button>
        </header>
        <div className="flex min-h-0 flex-1 max-lg:flex-col">
          <aside className="w-full shrink-0 overflow-y-auto border-r border-[color:var(--line)] bg-white lg:w-[360px]">
            <div className="space-y-2 p-3 empty:hidden">{notices}</div>
            {panels}
          </aside>
          <main className="min-h-0 min-w-0 flex-1 p-4 sm:p-6">
            <PreviewFrame path={data.path} page={page} device={device} draft={draft} />
          </main>
        </div>
      </div>
    );
  }

  /* ---------------- Ansicht: Vorschau groß, links die Einstellungen im Überblick */
  const rows: [Section, typeof Monitor, string][] = [
    ['sale', CreditCard, t('shopx.sec_sale')], ['brand', Palette, t('shopx.sec_brand')], ['shop', Type, t('shopx.shop_page')],
    ['screen', Tv, t('shopx.screen_page')], ['after', Sparkles, t('shopx.after_title')],
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{t('nav.shop')}</p>
          <h2 className="mt-1 text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('photo_shop.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('shopx.sub')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="glass-button-secondary" href={`${SITE}/${data.path}/${page === 'unlocked' ? 'shop' : page}`} target="_blank" rel="noreferrer">
            {t('shopx.open_page')} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button type="button" className="glass-button-primary" onClick={() => startEditing()}>
            <Pencil className="h-4 w-4" /> {t('shopx.edit')}
          </button>
        </div>
      </div>
      {notices}
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="h-fit overflow-hidden rounded-xl border border-[color:var(--line)] bg-white">
          <p className="border-b border-[color:var(--line)] px-4 py-3 text-sm font-semibold text-[color:var(--ink)]">{t('shopx.settings')}</p>
          {rows.map(([id, Icon, title]) => (
            <button key={id} type="button" onClick={() => startEditing(id)}
              className="group flex w-full items-center gap-3 border-b border-[color:var(--line)] px-4 py-3 text-left last:border-0 hover:bg-slate-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]"><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[color:var(--ink)]">{title}</span>
                <span className="block truncate text-xs text-[color:var(--ink-3)]">{summaries[id]}</span>
              </span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)] opacity-0 transition group-hover:opacity-100" />
            </button>
          ))}
          <div className="flex items-center gap-2 border-t border-[color:var(--line)] bg-slate-50 px-4 py-3 text-xs text-[color:var(--ink-3)]">
            <ImageIcon className="h-3.5 w-3.5" /> {data.is_test ? t('online.test_mode') : t('online.unlock_live')}
          </div>
        </aside>
        <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-[color:var(--line)] bg-slate-100/70 p-3 sm:p-4">
          <Toolbar page={page} setPage={setPage} device={device} setDevice={setDevice} />
          <div className="h-[min(72vh,760px)] min-h-[420px]">
            <PreviewFrame path={data.path} page={page} device={device} draft={draft} />
          </div>
        </section>
      </div>
      <VoucherManager parkId={parkId} codesOn={data.offers.codes} shopPath={data.path} photoPrice={money(data.price_cents)} onEnable={() => startEditing('sale')} />
    </div>
  );
}
