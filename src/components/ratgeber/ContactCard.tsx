import { ExternalLink } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n } from '../../lib/i18n';
import { TOM_LINKEDIN_URL } from '../../lib/ratgeber';

/** Ansprechpartner (Tom Nolting) mit Link zu LinkedIn – unter der Artikelliste und unter jedem Artikel. */
export default function ContactCard() {
  const { t } = useI18n();
  return (
    <GlassCard className="p-5 sm:p-6">
      <p className="text-xs text-[color:var(--ink-3)]">{t('ratgeber.contact_title')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[color:var(--ink)] text-lg font-semibold text-white"
          aria-hidden
        >
          TN
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[color:var(--ink)]">Tom Nolting</p>
          <p className="text-sm text-[color:var(--ink-2)]">{t('ratgeber.author_role')}</p>
          <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('ratgeber.contact_text')}</p>
        </div>
        <a
          href={TOM_LINKEDIN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-button-secondary"
        >
          {t('ratgeber.linkedin')}
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </GlassCard>
  );
}
