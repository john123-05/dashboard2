import { HelpCircle, Images, KeyRound, Link2, Megaphone, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { groupResults, SEARCH_CATEGORY_LABELS, type SearchCategory, type SearchResult } from '../lib/globalSearch';

const CATEGORY_ICONS: Record<SearchCategory, typeof KeyRound> = {
  contact: Users,
  password: KeyRound,
  media: Images,
  material: Megaphone,
  link: Link2,
  faq: HelpCircle,
};

const CATEGORY_ORDER: SearchCategory[] = ['contact', 'password', 'media', 'material', 'link', 'faq'];

const RESULTS_PER_CATEGORY = 6;

interface GlobalSearchResultsProps {
  results: SearchResult[];
  loading?: boolean;
  // Fires after a result was actually acted on (navigated/opened/selected) —
  // lets callers like the floating quick-search widget close themselves.
  onNavigate?: () => void;
}

export default function GlobalSearchResults({ results, loading, onNavigate }: GlobalSearchResultsProps) {
  const navigate = useNavigate();

  function openResult(result: SearchResult) {
    if (result.onSelect) {
      result.onSelect();
    } else if (result.href) {
      window.open(result.href, '_blank', 'noopener,noreferrer');
    } else if (result.path) {
      navigate(result.path);
    } else {
      return;
    }
    onNavigate?.();
  }

  if (results.length === 0) {
    return (
      <div className="support-empty">
        {loading ? 'Suche läuft...' : 'Kein Treffer. Versuch einen anderen Begriff, z. B. einen Namen, eine Kategorie oder ein Stichwort.'}
      </div>
    );
  }

  const grouped = groupResults(results);

  return (
    <div className="search-results">
      {loading && <p className="note">Aktualisiert Daten im Hintergrund...</p>}
      {CATEGORY_ORDER.filter((cat) => (grouped[cat]?.length ?? 0) > 0).map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const items = grouped[cat]!;
        const shown = items.slice(0, RESULTS_PER_CATEGORY);
        return (
          <div key={cat} className="search-result-group">
            <div className="search-result-group-title">
              <Icon size={15} />
              <span>{SEARCH_CATEGORY_LABELS[cat]}</span>
              <span className="note">{items.length}</span>
            </div>
            <div className="search-result-list">
              {shown.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="search-result-item"
                  onClick={() => openResult(result)}
                >
                  {result.thumbnail ? (
                    <img src={result.thumbnail} alt="" className="search-result-thumb" loading="lazy" />
                  ) : (
                    <span className="search-result-icon">
                      <Icon size={16} />
                    </span>
                  )}
                  <span className="search-result-body">
                    <span className="search-result-title">{result.title}</span>
                    {result.subtitle && <span className="search-result-subtitle">{result.subtitle}</span>}
                  </span>
                  {result.badge && <span className="lead-lang-badge">{result.badge}</span>}
                </button>
              ))}
            </div>
            {items.length > shown.length && (
              <p className="note" style={{ margin: '6px 2px 0' }}>
                +{items.length - shown.length} weitere Treffer in dieser Kategorie
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
