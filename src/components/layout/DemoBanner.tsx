import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useEntitlements } from '../../lib/plans';

// Hinweis im Demo-Park (Freischaltung „demo“, setzt Staff im CRM): alles ist offen, bezahlte Bereiche sind markiert.
export default function DemoBanner() {
  const { t } = useI18n();
  const { isDemo } = useEntitlements();
  if (!isDemo) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:px-4">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{t('demo.banner')}</span>
      <Link to="/plaene" className="shrink-0 font-semibold underline-offset-2 hover:underline">{t('demo.prices')}</Link>
    </div>
  );
}
