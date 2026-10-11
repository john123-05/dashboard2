import { Globe } from 'lucide-react';
import { useI18n, type Language } from '../../lib/i18n';

// Sprachauswahl für die Seiten vor der Anmeldung (Login, Registrierung). Im Dashboard selbst stellt man
// die Sprache unter Einstellungen um.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'lv', label: 'Latviešu' },
];

export default function LanguagePicker({ className = '' }: { className?: string }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className={`inline-flex items-center gap-1.5 rounded-full bg-white/90 py-1 pl-2.5 pr-1 text-xs text-slate-600 shadow-sm ring-1 ring-black/10 ${className}`}>
      <Globe className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{t('auth.language')}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        className="cursor-pointer appearance-none bg-transparent py-0.5 pr-2 text-xs font-medium text-slate-700 outline-none"
      >
        {LANGUAGES.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
    </label>
  );
}
