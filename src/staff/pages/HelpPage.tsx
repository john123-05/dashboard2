import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Globe, Images, KeyRound, Megaphone, Monitor, Mountain, Search, X } from 'lucide-react';
import GlobalSearchResults from '../components/GlobalSearchResults';
import { fetchSearchSources, searchSources, type SearchResult, type SearchSources } from '../lib/globalSearch';
import { FAQ_CATEGORIES, faqItems, matchesFaqQuery, type FaqCategory } from '../lib/faq';

const QUICK_LINKS = [
  { to: '/staff/passwoerter', icon: KeyRound, label: 'Passwörter', description: 'Zugangsdaten für Kunden, Tools & Social Media' },
  { to: '/staff/medien', icon: Images, label: 'Medien', description: 'Bilder & Videos durchsuchen' },
  { to: '/staff/werbematerialien', icon: Megaphone, label: 'Werbematerialien', description: 'Kataloge, PDFs & Links' },
  { to: '/staff/website-anfragen', icon: Globe, label: 'Interessenten und Anfragen', description: 'Leads aus allen Kanälen' },
  { to: '/staff/cameras', icon: Camera, label: 'Kameras', description: 'Kamera-Zuordnungen verwalten' },
  { to: '/staff/liftpic-setup', icon: Monitor, label: 'Liftpic Setup', description: 'Attraktions-PCs, Modus, Pairing & Health' },
  { to: '/staff/parks', icon: Mountain, label: 'Parks anlegen', description: 'Parks, Prefixes & Attraktionen' },
] as const;

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

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card help-hero">
        <h2>Hilfe & Suche</h2>
        <p className="note">
          Finde alles an einem Ort: Passwörter, Medien, Dokumente, Kontakte/Anfragen, Links und Antworten auf häufige
          Fragen.
        </p>
        <div className="help-search-wrap">
          <Search className="help-search-icon" size={18} />
          <input
            type="search"
            className="help-search-input"
            placeholder='Suche z. B. "LinkedIn", "Alpine Coaster", "Kamera", "dark mode" ...'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="help-search-clear" onClick={() => setQuery('')} aria-label="Suche leeren">
              <X size={14} />
            </button>
          )}
        </div>
        {sources && sources.errors.length > 0 && (
          <p className="error" style={{ marginTop: 8 }}>
            Konnte nicht vollständig geladen werden: {sources.errors.join(', ')}. Die übrigen Bereiche sind trotzdem
            durchsuchbar.
          </p>
        )}
      </div>

      {trimmedQuery ? (
        <div className="card">
          <div className="support-panel-header">
            <h3>Suchergebnisse</h3>
            <span className="note">{combinedResults.length} Treffer</span>
          </div>
          <GlobalSearchResults results={combinedResults} loading={sourcesLoading} />
        </div>
      ) : (
        <div className="card">
          <h3>Schnellzugriff</h3>
          <p className="note" style={{ marginTop: 0 }}>
            Direkt zu einem Bereich springen, oder oben etwas Konkretes suchen.
          </p>
          <div className="help-quicklinks">
            {QUICK_LINKS.map((item) => (
              <Link key={item.to} to={item.to} className="help-quicklink-card">
                <item.icon size={20} />
                <span className="help-quicklink-label">{item.label}</span>
                <span className="help-quicklink-desc">{item.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="support-panel-header">
          <h3>FAQ</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="note">{filteredFaq.length} Treffer</span>
            {filteredFaq.length > 0 && (
              <button type="button" className="secondary inline" onClick={toggleAllFaq}>
                {allOpen ? 'Alles zuklappen' : 'Alles aufklappen'}
              </button>
            )}
          </div>
        </div>

        <div className="help-category-chips">
          <button
            type="button"
            className={`help-category-chip ${activeCategory === null ? 'active' : ''}`}
            onClick={() => setActiveCategory(null)}
          >
            Alle
          </button>
          {FAQ_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`help-category-chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
            >
              {cat}
            </button>
          ))}
        </div>

        {filteredFaq.length === 0 && (
          <div className="support-empty" style={{ marginTop: 10 }}>
            Kein Treffer. Versuch es mit einem anderen Begriff oder wähle „Alle“.
          </div>
        )}

        <div className="help-faq-grid">
          {filteredFaq.map((item) => {
            const isOpen = !!openItems[item.id];
            return (
              <article key={item.id} id={`faq-${item.id}`} className="help-faq-item">
                <button
                  type="button"
                  className={`help-faq-question ${isOpen ? 'open' : ''}`}
                  onClick={() => setOpenItems((prev) => ({ ...prev, [item.id]: !isOpen }))}
                >
                  <span>{item.question}</span>
                  <span className="note">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && <p className="help-faq-answer">{item.answer}</p>}
                <div className="help-tags">
                  {item.tags.map((tag) => (
                    <button key={tag} type="button" className="help-tag-btn" onClick={() => setQuery(tag)}>
                      {tag}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
