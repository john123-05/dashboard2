import {
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURES,
  type LeadCategory,
  type LeadTemperature,
} from '../lib/leads';

interface LeadFilterBarProps {
  category: LeadCategory | '';
  onCategoryChange: (value: LeadCategory | '') => void;
  temperature: LeadTemperature | '';
  onTemperatureChange: (value: LeadTemperature | '') => void;
  language: string;
  onLanguageChange: (value: string) => void;
  availableLanguages: string[];
}

export default function LeadFilterBar({
  category,
  onCategoryChange,
  temperature,
  onTemperatureChange,
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
        value={temperature}
        onChange={(e) => onTemperatureChange(e.target.value as LeadTemperature | '')}
        aria-label="Nach Priorität filtern"
      >
        <option value="">Alle Prioritäten</option>
        {LEAD_TEMPERATURES.map((temperatureValue) => (
          <option key={temperatureValue} value={temperatureValue}>
            {LEAD_TEMPERATURE_LABELS[temperatureValue]}
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
