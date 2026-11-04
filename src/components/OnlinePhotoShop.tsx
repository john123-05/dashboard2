// Seite „Online-Shop“ für Online-Foto-Parks (Kalahari): Freischaltart (Stripe-Kauf oder kostenlos gegen
// E-Mail), Fotopreis und Personalisierung der Gästeseiten (Fotoshop, Bildschirm vor Ort, Angebot nach dem
// Kauf) mit Live-Vorschau. Speichern über operator-online-photo-settings (nur Parkinhaber).
import { useEffect, useState, type ReactNode } from 'react';
import { Check, CreditCard, Mail } from 'lucide-react';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { onlineShopSettings, type OnlineCustomization, type OnlineShopSettings } from '../lib/onlinePark';
import { GuestPagesCard, useOnlineSummary } from './online/OnlinePark';

const DEFAULTS = {
  shop: { eyebrow: 'TOM FOOLERYS ADVENTURE PARK', title: 'Find your adventure photo', text: 'Every climb, zip and leap — captured. Search by the time of your visit or by the number on your photo, then take the original home.' },
  screen: { eyebrow: 'TOM FOOLERYS ADVENTURE PARK · VIRGINIA', headline: 'Spot your adventure. Scan your photo.', qr_label_buy: 'SCAN TO BUY', qr_label_free: 'SCAN TO UNLOCK' },
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
      <span className="font-medium text-[color:var(--ink)]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[color:var(--ink-3)]">{hint}</span>}
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

export default function OnlinePhotoShop({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { data: summary } = useOnlineSummary(parkId);
  const [data, setData] = useState<OnlineShopSettings | null>(null);
  const [custom, setCustom] = useState<OnlineCustomization>({});
  const [dirty, setDirty] = useState(false);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  async function request(patch?: Parameters<typeof onlineShopSettings>[1], okText?: string) {
    setBusy(true); setError(null); setSaved(null);
    try {
      const next = await onlineShopSettings(parkId, patch);
      setData(next);
      if (!patch || patch.customization) { setCustom(next.customization); setDirty(false); }
      if (patch) { setSaved(okText ?? t('photo_shop.saved')); setPreviewKey((k) => k + 1); }
      if (patch?.price_cents) setPrice('');
    } catch (e) {
      setError(e instanceof Error && /https/.test(e.message) ? t('shopx.link_https') : t('photo_shop.error'));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void request(); }, [parkId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof OnlineCustomization>(section: K, key: string, value: unknown) => {
    setCustom((c) => ({ ...c, [section]: { ...(c[section] ?? {}), [key]: value === '' ? undefined : value } }));
    setDirty(true); setSaved(null);
  };
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: data?.currency ?? 'USD' }).format(cents / 100);
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const priceValid = price !== '' && Number.isFinite(cents) && cents >= 100 && cents <= 10000;
  const input = 'glass-input w-full';
  const shop = custom.shop ?? {}, screen = custom.screen ?? {}, after = custom.after ?? {};

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-400">{t('nav.shop')}</p>
        <h2 className="mt-1 text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('photo_shop.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('shopx.sub')}</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saved}</p>}

      {!data ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6">
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('photo_shop.mode')}</h3>
              <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('photo_shop.existing')}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
                {([
                  ['purchase', CreditCard, t('photo_shop.paid'), `${money(data.price_cents)} · Stripe`],
                  ['email', Mail, t('photo_shop.email'), t('photo_shop.consent')],
                ] as const).map(([mode, Icon, title, text]) => {
                  const active = data.unlock_mode === mode;
                  return (
                    <button key={mode} type="button" role="radio" aria-checked={active} disabled={busy}
                      onClick={() => { if (!active) void request({ unlock_mode: mode }); }}
                      className={`relative rounded-lg border p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'}`}>
                      <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]"><Icon className="h-4 w-4 text-[color:var(--ink-3)]" />{title}</span>
                      <span className="mt-1 block text-sm text-[color:var(--ink-2)]">{text}</span>
                      {active && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-600" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6">
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('photo_shop.price_title')}</h3>
              <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('shopx.price_stripe')}</p>
              <p className="mt-4 text-3xl font-light text-[color:var(--ink)]">{money(data.price_cents)}</p>
              <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (priceValid) void request({ price_cents: cents }, t('photo_shop.price_saved')); }}>
                <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                  {t('photo_shop.price_label')} ({data.currency})
                  <input className="glass-input w-36" inputMode="decimal" placeholder={(data.price_cents / 100).toFixed(2)} value={price} onChange={(e) => setPrice(e.target.value)} />
                </label>
                <button className="glass-button-primary" disabled={busy || !priceValid}>{t('photo_shop.price_save')}</button>
              </form>
            </section>
          </div>

          {/* Personalisierung der Gästeseiten */}
          <section className="rounded-xl border border-[color:var(--line)] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] px-5 py-4 sm:px-6">
              <div>
                <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('shopx.custom_title')}</h3>
                <p className="text-sm text-[color:var(--ink-3)]">{t('shopx.custom_sub')}</p>
              </div>
              <button type="button" className="glass-button-primary" disabled={busy || !dirty} onClick={() => void request({ customization: custom }, t('shopx.saved'))}>
                {dirty ? t('shopx.save') : t('shopx.saved_short')}
              </button>
            </div>
            <div className="grid gap-0 divide-y divide-[color:var(--line)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
              <div className="space-y-4 p-5 sm:p-6">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.shop_page')}</p>
                <Field label={t('shopx.eyebrow')}><input className={input} maxLength={60} placeholder={DEFAULTS.shop.eyebrow} value={shop.eyebrow ?? ''} onChange={(e) => set('shop', 'eyebrow', e.target.value)} /></Field>
                <Field label={t('shopx.title')}><input className={input} maxLength={60} placeholder={DEFAULTS.shop.title} value={shop.title ?? ''} onChange={(e) => set('shop', 'title', e.target.value)} /></Field>
                <Field label={t('shopx.text')}><textarea className={input} rows={3} maxLength={240} placeholder={DEFAULTS.shop.text} value={shop.text ?? ''} onChange={(e) => set('shop', 'text', e.target.value)} /></Field>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.screen_page')}</p>
                <Field label={t('shopx.eyebrow')}><input className={input} maxLength={60} placeholder={DEFAULTS.screen.eyebrow} value={screen.eyebrow ?? ''} onChange={(e) => set('screen', 'eyebrow', e.target.value)} /></Field>
                <Field label={t('shopx.headline')}><input className={input} maxLength={70} placeholder={DEFAULTS.screen.headline} value={screen.headline ?? ''} onChange={(e) => set('screen', 'headline', e.target.value)} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('shopx.qr_buy')}><input className={input} maxLength={24} placeholder={DEFAULTS.screen.qr_label_buy} value={screen.qr_label_buy ?? ''} onChange={(e) => set('screen', 'qr_label_buy', e.target.value)} /></Field>
                  <Field label={t('shopx.qr_free')}><input className={input} maxLength={24} placeholder={DEFAULTS.screen.qr_label_free} value={screen.qr_label_free ?? ''} onChange={(e) => set('screen', 'qr_label_free', e.target.value)} /></Field>
                </div>
                <Field label={t('shopx.speed')}>
                  <Segmented value={screen.speed ?? 'normal'} onChange={(v) => set('screen', 'speed', v)}
                    options={[['slow', t('shopx.speed_slow')], ['normal', t('shopx.speed_normal')], ['fast', t('shopx.speed_fast')]]} />
                </Field>
                <div className="flex flex-wrap gap-6">
                  <Field label={t('shopx.rows')}>
                    <Segmented value={screen.rows ?? 2} onChange={(v) => set('screen', 'rows', v)} options={[[1, '1'], [2, '2']]} />
                  </Field>
                  <Field label={t('shopx.show_price')}>
                    <Segmented value={screen.show_price === false ? 'no' : 'yes'} onChange={(v) => set('screen', 'show_price', v === 'yes')}
                      options={[['yes', t('shopx.yes')], ['no', t('shopx.no')]]} />
                  </Field>
                </div>
              </div>
              <div className="space-y-4 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[color:var(--ink)]">{t('shopx.after_title')}</p>
                  <Segmented value={after.enabled ? 'on' : 'off'} onChange={(v) => set('after', 'enabled', v === 'on')}
                    options={[['off', t('shopx.off')], ['on', t('shopx.on')]]} />
                </div>
                <p className="text-xs text-[color:var(--ink-3)]">{t('shopx.after_sub')}</p>
                <Field label={t('shopx.title')}><input className={input} maxLength={80} placeholder="Enjoy 10% off at the gift shop" value={after.title ?? ''} onChange={(e) => set('after', 'title', e.target.value)} /></Field>
                <Field label={t('shopx.text')}><textarea className={input} rows={3} maxLength={300} placeholder="Show this page at the Tom Foolerys front desk today." value={after.text ?? ''} onChange={(e) => set('after', 'text', e.target.value)} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('shopx.button_label')}><input className={input} maxLength={30} placeholder="Book your next visit" value={after.button_label ?? ''} onChange={(e) => set('after', 'button_label', e.target.value)} /></Field>
                  <Field label={t('shopx.button_url')}><input className={input} type="url" maxLength={400} placeholder="https://…" value={after.button_url ?? ''} onChange={(e) => set('after', 'button_url', e.target.value)} /></Field>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {summary && <GuestPagesCard key={previewKey} data={summary} settingsLink={false} />}
    </div>
  );
}
