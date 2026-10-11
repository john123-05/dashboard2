import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Language = 'de' | 'en' | 'es' | 'fr' | 'it' | 'nl' | 'lv';

const STORAGE_KEY = 'app_language';

// Die Texte liegen je Sprache in `src/lib/locales/<sprache>.ts`. Deutsch ist fest im Hauptpaket (Rückfall und
// häufigste Sprache); jede andere Sprache wird erst geladen, wenn sie gebraucht wird. So lädt niemand alle
// 7 Sprachen auf einmal (vorher rund 1 MB im Hauptpaket).
import de from './locales/de';

const LOADERS: Record<Exclude<Language, 'de'>, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import('./locales/en'),
  es: () => import('./locales/es'),
  fr: () => import('./locales/fr'),
  it: () => import('./locales/it'),
  nl: () => import('./locales/nl'),
  lv: () => import('./locales/lv'),
};

const translations: Partial<Record<Language, Record<string, string>>> = { de };

/** Lädt die Texte einer Sprache nach (einmal je Sprache). Scheitert das Laden, bleibt es bei Deutsch. */
export async function loadLanguage(language: Language): Promise<void> {
  if (translations[language] || language === 'de') return;
  try {
    translations[language] = (await LOADERS[language]()).default;
  } catch {
    // Netz weg oder alte Dateien nach einem Update: Deutsch anzeigen statt einer leeren Seite.
  }
}


const fallback: Language = 'de';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const SUPPORTED_LANGUAGES: Language[] = ['de', 'en', 'es', 'fr', 'it', 'nl', 'lv'];
const defaultLanguage: Language = 'de';

const LOCALE_TAGS: Record<Language, string> = {
  de: 'de-DE', en: 'en-GB', es: 'es-ES', fr: 'fr-FR',
  it: 'it-IT', nl: 'nl-NL', lv: 'lv-LV',
};

function isSupportedLanguage(value: string | null): value is Language {
  return !!value && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

// No stored preference yet: use the browser's language if we support it,
// otherwise fall back to German (this app's primary audience).
function detectInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isSupportedLanguage(stored)) return stored;

  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of browserLanguages) {
    const base = lang?.slice(0, 2).toLowerCase() ?? '';
    if (isSupportedLanguage(base)) return base;
  }
  return defaultLanguage;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  const setLanguage = (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    // Erst die Texte holen, dann umschalten – sonst blitzt kurz Deutsch auf.
    void loadLanguage(lang).then(() => setLanguageState(lang));
  };

  const t = useMemo(
    () => (key: string, params?: Record<string, string | number>) => {
      const value = translations[language]?.[key] ?? translations[fallback]?.[key] ?? key;
      return params
        ? value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
            Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match)
        : value;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function useLocaleTag(): string {
  return LOCALE_TAGS[useI18n().language];
}

/** Vor dem ersten Zeichnen aufrufen (main.tsx): lädt die Sprache des Nutzers. */
export function initI18n(): Promise<void> {
  return loadLanguage(readStoredLanguage());
}

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(stored)) return stored;
  } catch {
    // localStorage nicht verfügbar
  }
  try {
    return detectInitialLanguage();
  } catch {
    return defaultLanguage;
  }
}

/**
 * Übersetzen außerhalb von React-Komponenten (Hilfsfunktionen auf Modulebene).
 * Liest die gespeicherte Sprache; die Komponente, die das Ergebnis anzeigt,
 * sollte trotzdem `useI18n()` aufrufen, damit sie beim Sprachwechsel neu rendert.
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  const language = readStoredLanguage();
  const value = translations[language]?.[key] ?? translations[fallback]?.[key] ?? key;
  return params
    ? value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match)
    : value;
}

/** Locale-Tag (z. B. `de-DE`) außerhalb von Komponenten. */
export function currentLocaleTag(): string {
  return LOCALE_TAGS[readStoredLanguage()];
}
