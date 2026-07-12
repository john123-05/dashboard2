import { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, Search, X } from 'lucide-react';
import GlobalSearchResults from './GlobalSearchResults';
import { fetchSearchSources, searchSources, type SearchResult, type SearchSources } from '../lib/globalSearch';
import { faqItems, matchesFaqQuery } from '../lib/faq';

// Floating, always-accessible quick-search — same data sources and result
// shape as the Hilfe page's search, just reachable from anywhere in the
// staff area instead of needing to navigate there first. Sources are fetched
// lazily on first open, then kept in memory for the rest of the session.
export default function GlobalSearchWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<SearchSources | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openWidget() {
    setOpen(true);
    if (!sources && !sourcesLoading) {
      setSourcesLoading(true);
      fetchSearchSources().then((result) => {
        setSources(result);
        setSourcesLoading(false);
      });
    }
  }

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();

  const dataResults = useMemo(
    () => (sources ? searchSources(sources, trimmedQuery) : []),
    [sources, trimmedQuery],
  );

  const faqResults: SearchResult[] = useMemo(() => {
    if (!normalizedQuery) return [];
    return faqItems
      .filter((item) => matchesFaqQuery(item, normalizedQuery))
      .map((item) => ({
        id: `faq-${item.id}`,
        category: 'faq' as const,
        title: item.question,
        subtitle: item.answer,
        // No FAQ accordion here — jump to the Hilfe page with the same
        // query so the match (and the full FAQ list) is right there.
        path: `/staff/hilfe?q=${encodeURIComponent(trimmedQuery)}`,
      }));
  }, [normalizedQuery, trimmedQuery]);

  const combinedResults = useMemo(() => [...dataResults, ...faqResults], [dataResults, faqResults]);

  function handleNavigate() {
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        type="button"
        className="quick-search-fab"
        onClick={() => (open ? setOpen(false) : openWidget())}
        aria-label="Schnellsuche öffnen"
        title="Schnellsuche"
      >
        {open ? <X size={20} /> : <HelpCircle size={22} />}
      </button>

      {open && (
        <div className="quick-search-panel" ref={panelRef}>
          <div className="quick-search-panel-header">
            <span>Schnellsuche</span>
            <button type="button" className="quick-search-close" onClick={() => setOpen(false)} aria-label="Schließen">
              <X size={14} />
            </button>
          </div>
          <div className="quick-search-input-wrap">
            <Search size={16} className="quick-search-input-icon" />
            <input
              ref={inputRef}
              type="search"
              className="quick-search-input"
              placeholder="Passwörter, Medien, Kontakte, FAQ ..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="quick-search-results">
            {trimmedQuery ? (
              <GlobalSearchResults results={combinedResults} loading={sourcesLoading} onNavigate={handleNavigate} />
            ) : (
              <p className="note" style={{ margin: 0 }}>
                Tipp: Suche z.&nbsp;B. nach einem Namen, „LinkedIn“ oder einer Attraktion — durchsucht Passwörter,
                Medien, Werbematerialien, Kontakte/Anfragen und die FAQ gleichzeitig.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
