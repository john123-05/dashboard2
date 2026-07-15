import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategory } from '../lib/leads';

interface LeadFilterBarProps {
  category: LeadCategory | '';
  onCategoryChange: (value: LeadCategory | '') => void;
  language: string;
  onLanguageChange: (value: string) => void;
  availableLanguages: string[];
}

export default function LeadFilterBar({
  category,
  onCategoryChange,
  language,
  onLanguageChange,
  availableLanguages,
}: LeadFilterBarProps) {
  return (
    <>
      <select
        className="lead-filter-select"
        value={category}
        onChange={(e) => onCategoryChange(e.target.value as LeadCategory | '')}
        aria-label="Nach Kategorie filtern"
      >
        <option value="">Alle Kategorien</option>
        {LEAD_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {LEAD_CATEGORY_LABELS[cat]}
          </option>
        ))}
      </select>
      <select
        className="lead-filter-select"
        value={language}
        onChange={(e) => onLanguageChange(e.target.value)}
        aria-label="Nach Sprache filtern"
      >
        <option value="">Alle Sprachen</option>
        {availableLanguages.map((lang) => (
          <option key={lang} value={lang}>
            {lang}
          </option>
        ))}
      </select>
    </>
  );
}
