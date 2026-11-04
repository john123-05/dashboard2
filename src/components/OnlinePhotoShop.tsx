// Seite „Online-Shop“ für Online-Foto-Parks (Kalahari): wie Gäste ihr Foto freischalten (Stripe-Kauf
// oder kostenlos gegen E-Mail), Fotopreis und die Gästeseiten mit Live-Vorschau.
// Speichern über operator-online-photo-settings (nur Parkinhaber).
import { useEffect, useState } from 'react';
import { Check, CreditCard, Mail } from 'lucide-react';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';
import { getFunctionSession } from '../lib/functionAuth';
import { useI18n, useLocaleTag } from '../lib/i18n';
import { fetchOnlineSummary } from '../lib/onlinePark';
import { GuestPagesCard, useOnlineSummary } from './online/OnlinePark';

type Settings = { name: string; unlock_mode: 'purchase' | 'email'; price_cents: number; currency: string; shop_url: string; screen_url: string };

export default function OnlinePhotoShop({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { data: summary } = useOnlineSummary(parkId);
  const [data, setData] = useState<Settings | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function request(patch?: { unlock_mode?: string; price_cents?: number }) {
    setBusy(true); setError(false); setSaved(null);
    try {
      const { data: { session } } = await getFunctionSession();
      if (!session) throw new Error('auth');
      const r = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-online-photo-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
        body: JSON.stringify({ park_id: parkId, ...(patch ?? {}) }),
      });
      const result = await r.json();
      if (!r.ok || !result.data) throw new Error('save');
      setData(result.data);
      if (patch) {
        setSaved(patch.price_cents ? t('photo_shop.price_saved') : t('photo_shop.saved'));
        setPrice('');
        void fetchOnlineSummary(parkId, true);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void request(); }, [parkId]); // eslint-disable-line react-hooks/exhaustive-deps

  const money = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: data?.currency ?? 'USD' }).format(cents / 100);
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const priceValid = price !== '' && Number.isFinite(cents) && cents >= 100 && cents <= 10000;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-slate-400">{t('nav.shop')}</p>
        <h2 className="mt-1 text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('photo_shop.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('photo_shop.note')}</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{t('photo_shop.error')}</p>}
      {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{saved}</p>}

      {!data ? (
        !error && <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
      ) : (
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
                    <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
                      <Icon className="h-4 w-4 text-[color:var(--ink-3)]" />{title}
                    </span>
                    <span className="mt-1 block text-sm text-[color:var(--ink-2)]">{text}</span>
                    {active && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-[color:var(--line)] bg-white p-5 sm:p-6">
            <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('photo_shop.price_title')}</h3>
            <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('photo_shop.price_note')}</p>
            <p className="mt-4 text-3xl font-light text-[color:var(--ink)]">{money(data.price_cents)}</p>
            <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (priceValid) void request({ price_cents: cents }); }}>
              <label className="grid gap-1 text-sm text-[color:var(--ink-2)]">
                {t('photo_shop.price_label')} ({data.currency})
                <input className="glass-input w-36" inputMode="decimal" placeholder={(data.price_cents / 100).toFixed(2)} value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <button className="glass-button-primary" disabled={busy || !priceValid}>{t('photo_shop.price_save')}</button>
            </form>
          </section>
        </div>
      )}

      {summary && <GuestPagesCard data={summary} settingsLink={false} />}
    </div>
  );
}
