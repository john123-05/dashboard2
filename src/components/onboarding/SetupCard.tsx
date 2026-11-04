import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useOnboarding } from '../../lib/onboarding';
import ProgressRing from './ProgressRing';
import { usePark } from '../../contexts/ParkContext';
import { installationLine, openInstallation, useOnlineSummary } from '../online/OnlinePark';

// Karte „Erste Schritte“ oben auf der Übersicht: Fortschritt, nächster Schritt, Link zur ganzen Liste.
// Verschwindet, wenn alles erledigt ist oder der Nutzer sie ausblendet (bleibt über die Navigation erreichbar).
export default function SetupCard() {
  const { t } = useI18n();
  const { next, doneCount, total, percent, hidden, complete, setHidden } = useOnboarding();
  // Online-Foto-Park (Kalahari): der Stand der Installation steht mit in dieser Karte – eine Stelle, nicht zwei.
  const { parkId } = usePark();
  const { data: online } = useOnlineSummary(parkId);
  const install = installationLine(online);
  const stripeLink = online?.shop && !online.shop.stripe_connected ? online.shop.stripe_onboarding_url ?? null : null;
  if ((hidden || complete || !next || total === 0) && !install && !stripeLink) return null;
  const NextIcon = next?.icon;
  return (
    <section className="relative flex flex-wrap items-center gap-4 rounded-xl border border-[color:var(--line)] bg-white p-4 sm:p-5" aria-label={t('ob.card_title')}>
      <ProgressRing percent={percent} size={52}>
        <span className="text-[11px] font-semibold text-[color:var(--ink)]">{percent}%</span>
      </ProgressRing>
      <div className="min-w-0 flex-1 max-sm:pr-8">
        <p className="text-sm font-semibold text-[color:var(--ink)]">
          {t('ob.card_title')} <span className="ml-1 font-normal text-[color:var(--ink-3)]">{t('ob.progress', { done: doneCount, total })}</span>
        </p>
        {install && (
          <button type="button" onClick={() => openInstallation()} className="mt-0.5 flex min-w-0 max-w-full items-center gap-1.5 text-left text-sm text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">
            <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-semibold text-white">{install.done}/{install.total}</span>
            <span className="truncate">{t('online.install_line', { title: install.title })}</span>
          </button>
        )}
        {stripeLink && (
          <Link to="/start#stripe" className="mt-0.5 flex min-w-0 max-w-full items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-semibold text-white">Stripe</span>
            <span className="truncate">{t('online.stripe_link_ready')}</span>
          </Link>
        )}
        {next && NextIcon && !hidden && !complete && (
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-[color:var(--ink-2)]">
          <NextIcon className="h-4 w-4 shrink-0 text-[color:var(--ink-3)]" />
          <span className="truncate">{t('ob.card_next', { title: t(`ob.${next.id}.title`) })}</span>
        </p>
        )}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Link to="/start" className="glass-button-secondary flex-1 justify-center sm:flex-none">{t('ob.card_all')}</Link>
        <Link to={install ? '/start#installation' : !next || next.action ? '/start' : next.path} className="glass-button-primary flex-1 justify-center sm:flex-none">
          {t('ob.continue')} <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label={t('ob.dismiss')}
          title={t('ob.dismiss')}
          className="rounded-md p-2 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)] max-sm:absolute max-sm:right-2 max-sm:top-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
