import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Globe, HelpCircle, Images, KeyRound, Megaphone, Mountain, Search, X } from 'lucide-react';
import GlobalSearchResults from '../components/GlobalSearchResults';
import { fetchSearchSources, searchSources, type SearchResult, type SearchSources } from '../lib/globalSearch';
import { FAQ_CATEGORIES, faqItems, matchesFaqQuery, type FaqCategory } from '../lib/faq';

const QUICK_LINKS = [
  { to: '/staff/kunden-management', icon: Mountain, label: 'Kundenmanagement', meta: 'Parks, Kameras, PCs' },
  { to: '/staff/passwoerter', icon: KeyRound, label: 'Passwörter', meta: 'Logins & Zugänge' },
  { to: '/staff/medien', icon: Images, label: 'Medien', meta: 'Bilder & Videos' },
  { to: '/staff/werbematerialien', icon: Megaphone, label: 'Werbematerialien', meta: 'PDFs & Links' },
  {
    to: '/staff/website-anfragen',
    icon: Globe,
    label: 'Interessenten und Anfragen',
    meta: 'PDF, DE, International, Finder',
  },
] as const;

const SUGGESTED_TAGS = ['LinkedIn', 'Dark Mode', 'CSV', 'Kamera', 'Pairing', 'Support'] as const;

export default function HelpPage() {
  const [searchParams] = useSearchParams();
  // Initial value only (deep link, e.g. from the floating quick-search widget) — freely editable after.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<FaqCategory | null>(null);
  const [sources, setSources] = useState<SearchSources | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSearchSources().then((result) => {
      if (cancelled) return;
      setSources(result);
      setSourcesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const totalFaqCount = faqItems.length;

  const faqCountByCategory = useMemo(() => {
    return FAQ_CATEGORIES.reduce(
      (acc, category) => {
        acc[category] = faqItems.filter((item) => item.category === category).length;
        return acc;
      },
      {} as Record<FaqCategory, number>,
    );
  }, []);

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
        onSelect: () => {
          setActiveCategory(null);
          setOpenItems((prev) => ({ ...prev, [item.id]: true }));
          requestAnimationFrame(() => {
            document.getElementById(`faq-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        },
      }));
  }, [normalizedQuery]);

  const combinedResults = useMemo(() => [...dataResults, ...faqResults], [dataResults, faqResults]);

  const filteredFaq = useMemo(() => {
    return faqItems.filter((item) => {
      if (activeCategory && item.category !== activeCategory) return false;
      if (normalizedQuery && !matchesFaqQuery(item, normalizedQuery)) return false;
      return true;
    });
  }, [activeCategory, normalizedQuery]);

  const allOpen = filteredFaq.length > 0 && filteredFaq.every((item) => openItems[item.id]);

  function toggleAllFaq() {
    setOpenItems((prev) => {
      const next = { ...prev };
      filteredFaq.forEach((item) => {
        next[item.id] = !allOpen;
      });
      return next;
    });
  }

  function resetFilters() {
    setQuery('');
    setActiveCategory(null);
  }

  return (
    <div className="customer-management-page help-page">
      <div className="customer-management-hero customer-management-hero--split help-page-head">
        <div>
          <h2>Hilfe</h2>
        </div>
      </div>

      <div className="customer-management-shell help-management-shell">
        <aside className="card customer-list-panel help-sidebar">
          <div className="customer-list-header">
            <h3>Bereiche</h3>
            <span className="note">{QUICK_LINKS.length}</span>
          </div>

          <div className="customer-search help-search-shell">
            <Search size={16} />
            <input
              type="search"
              placeholder="Suche nach Kunde, FAQ, Passwort oder Link..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="help-search-inline-clear"
                onClick={() => setQuery('')}
                aria-label="Suche leeren"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="help-inline-tags">
            {SUGGESTED_TAGS.map((tag) => (
              <button key={tag} type="button" className="help-tag-btn" onClick={() => setQuery(tag)}>
                {tag}
              </button>
            ))}
          </div>

          {sources && sources.errors.length > 0 && (
            <p className="error" style={{ marginTop: 2 }}>
              Konnte nicht vollständig geladen werden: {sources.errors.join(', ')}
            </p>
          )}

          <div className="help-sidebar-section">
            <div className="customer-section-head help-sidebar-subhead">
              <h3>Schnellzugriff</h3>
            </div>

            <div className="help-sidebar-list">
              {QUICK_LINKS.map((item) => (
                <Link key={item.to} to={item.to} className="help-sidebar-link">
                  <span className="help-sidebar-link-copy">
                    <span className="help-sidebar-link-icon">
                      <item.icon size={15} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.meta}</small>
                    </span>
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          </div>

          <div className="help-sidebar-section">
            <div className="customer-section-head help-sidebar-subhead">
              <h3>Themen</h3>
              {activeCategory ? (
                <button type="button" className="secondary inline" onClick={() => setActiveCategory(null)}>
                  Alle
                </button>
              ) : (
                <span className="note">{totalFaqCount}</span>
              )}
            </div>

            <div className="help-topic-list">
              <button
                type="button"
                className={`help-topic-btn ${activeCategory === null ? 'active' : ''}`}
                onClick={() => setActiveCategory(null)}
              >
                <span>Alle Themen</span>
                <strong>{totalFaqCount}</strong>
              </button>
              {FAQ_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`help-topic-btn ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => setActiveCategory((prev) => (prev === category ? null : category))}
                >
                  <span>{category}</span>
                  <strong>{faqCountByCategory[category]}</strong>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="customer-detail-panel help-detail-panel">
          <div className="card customer-detail-canvas help-detail-canvas">
            <div className="customer-summary-card help-summary-card">
              <div>
                <h3>{trimmedQuery ? 'Suchergebnisse & FAQ' : 'FAQ'}</h3>
                <div className="customer-row-meta help-summary-meta">
                  <span>{trimmedQuery ? 'Suche aktiv' : 'Alle Einträge'}</span>
                  <span>{activeCategory ?? 'Alle Themen'}</span>
                  <span>{filteredFaq.length} FAQ</span>
                  {trimmedQuery && <span>{combinedResults.length} Treffer</span>}
                </div>
              </div>
              <div className="customer-summary-actions">
                {(trimmedQuery || activeCategory) && (
                  <button type="button" className="secondary inline" onClick={resetFilters}>
                    Zurücksetzen
                  </button>
                )}
                {filteredFaq.length > 0 && (
                  <button type="button" className="secondary inline" onClick={toggleAllFaq}>
                    {allOpen ? 'Alles zuklappen' : 'Alles aufklappen'}
                  </button>
                )}
              </div>
            </div>

            {trimmedQuery ? (
              <div className="help-results-block">
                <div className="customer-inline-head">
                  <div>
                    <strong>Treffer</strong>
                    <small>{combinedResults.length} direkte Ergebnisse in allen Bereichen</small>
                  </div>
                </div>
                <GlobalSearchResults results={combinedResults} loading={sourcesLoading} />
              </div>
            ) : null}

            {filteredFaq.length === 0 ? (
              <div className="support-empty" style={{ marginTop: 0 }}>
                Kein Treffer. Versuch einen anderen Begriff oder ein anderes Thema.
              </div>
            ) : (
              <div className="help-faq-list">
                {filteredFaq.map((item) => {
                  const isOpen = !!openItems[item.id];
                  return (
                    <article key={item.id} id={`faq-${item.id}`} className={`customer-accordion ${isOpen ? 'open' : ''}`}>
                      <button
                        type="button"
                        className="customer-accordion-trigger"
                        onClick={() => setOpenItems((prev) => ({ ...prev, [item.id]: !isOpen }))}
                      >
                        <span className="customer-accordion-label">
                          <span className="customer-accordion-icon">
                            <HelpCircle size={15} />
                          </span>
                          <span className="customer-accordion-copy">
                            <strong>{item.question}</strong>
                            <small>{item.category}</small>
                          </span>
                        </span>
                        <ChevronRight size={16} className={`help-accordion-chevron ${isOpen ? 'open' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="customer-accordion-body">
                          <p className="help-faq-answer">{item.answer}</p>
                          <div className="help-tags">
                            {item.tags.map((tag) => (
                              <button key={tag} type="button" className="help-tag-btn" onClick={() => setQuery(tag)}>
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
