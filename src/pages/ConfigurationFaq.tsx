import { useI18n } from '../lib/i18n';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';

const FAQ = [1, 2, 3].map((n) => ({ frage: `px.cfaq_q${n}`, antwort: `px.cfaq_a${n}` }));

/** Eigene Seite fuer "Fragen und Antworten", erreichbar ueber das i-Symbol auf "Konfiguration". */
export default function ConfigurationFaq() {
  const { t } = useI18n();
  const [offeneFrage, setOffeneFrage] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/configuration" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('px.back_to_config')}
        </Link>
        <h2 className="mt-2 text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">{t('faq.title')}</h2>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="divide-y divide-slate-200/70">
          {FAQ.map((entry, i) => (
            <div key={entry.frage}>
              <button
                type="button"
                onClick={() => setOffeneFrage(offeneFrage === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-slate-700"
              >
                {t(entry.frage)}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${offeneFrage === i ? 'rotate-180' : ''}`} />
              </button>
              {offeneFrage === i && <p className="pb-3 text-sm text-slate-500">{t(entry.antwort)}</p>}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
