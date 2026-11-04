// Marketing-CRM für Online-Foto-Parks (Kalahari): wie Gäste ihr Foto bekommen. Entweder Kauf über Stripe
// oder kostenlos im Tausch gegen die E-Mail-Adresse (Kontakt fürs Marketing, mit freiwilliger Einwilligung).
// Stripe-Käufer erscheinen zusätzlich als Kontakte; Werbung nur an die, die eingewilligt haben.
import { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Mail } from 'lucide-react';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { onlineShopSettings, type OnlineShopSettings } from '../../lib/onlinePark';

export default function OnlineUnlockSwitch({ parkId, onChanged }: { parkId: string; onChanged?: () => void }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [data, setData] = useState<OnlineShopSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    onlineShopSettings(parkId).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setError(t('crm.load_failed')); });
    return () => { cancelled = true; };
  }, [parkId, t]);

  async function choose(mode: 'purchase' | 'email') {
    if (!data || data.unlock_mode === mode || busy) return;
    setBusy(mode); setError(null);
    try {
      setData(await onlineShopSettings(parkId, { unlock_mode: mode }));
      onChanged?.();
    } catch {
      setError(t('online.unlock_owner_only'));
    }
    setBusy(null);
  }

  if (!data) return error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null;
  const price = new Intl.NumberFormat(locale, { style: 'currency', currency: data.currency }).format(data.price_cents / 100);
  const options = [
    { mode: 'purchase' as const, icon: CreditCard, title: t('online.unlock_paid'), text: t('online.unlock_paid_text', { price }) },
    { mode: 'email' as const, icon: Mail, title: t('online.unlock_free'), text: t('online.unlock_free_text') },
  ];
  return (
    <section className="rounded-xl border border-[color:var(--line)] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('online.unlock_title')}</h3>
        <span className="inline-flex items-center gap-1.5 text-xs text-[color:var(--ink-3)]">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> {t('online.unlock_live')}
        </span>
      </div>
      <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('online.unlock_sub')}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('online.unlock_title')}>
        {options.map(({ mode, icon: Icon, title, text }) => {
          const active = data.unlock_mode === mode;
          return (
            <button key={mode} type="button" role="radio" aria-checked={active} disabled={busy !== null} onClick={() => void choose(mode)}
              className={`relative rounded-lg border p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'}`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
                {busy === mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-[color:var(--ink-3)]" />}{title}
              </span>
              <span className="mt-1 block text-sm text-[color:var(--ink-2)]">{text}</span>
              {active && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-600" />}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <p className="mt-3 text-xs text-[color:var(--ink-3)]">{t('online.unlock_note')}</p>
    </section>
  );
}
