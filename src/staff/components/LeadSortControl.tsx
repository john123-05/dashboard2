import type { LeadSortKey, SortDirection } from '../lib/leads';

interface LeadSortControlProps {
  sortKey: LeadSortKey;
  direction: SortDirection;
  onChange: (sortKey: LeadSortKey, direction: SortDirection) => void;
}

const SORT_KEY_LABELS: Record<LeadSortKey, string> = {
  date: 'Eingangsdatum',
  temperature: 'Temperatur',
  name: 'Name/Firma',
};

const SORT_KEYS = Object.keys(SORT_KEY_LABELS) as LeadSortKey[];

export default function LeadSortControl({ sortKey, direction, onChange }: LeadSortControlProps) {
  return (
    <div className="lead-sort-control">
      <select
        className="lead-filter-select"
        value={sortKey}
        onChange={(e) => onChange(e.target.value as LeadSortKey, direction)}
        aria-label="Sortieren nach"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            Sortieren: {SORT_KEY_LABELS[key]}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="lead-sort-direction"
        onClick={() => onChange(sortKey, direction === 'asc' ? 'desc' : 'asc')}
        title={direction === 'asc' ? 'Aufsteigend (umschalten)' : 'Absteigend (umschalten)'}
        aria-label={direction === 'asc' ? 'Aufsteigend sortiert, umschalten' : 'Absteigend sortiert, umschalten'}
      >
        {direction === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
