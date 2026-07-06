import { useMemo, useState } from 'react';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
};

const faqItems: FaqItem[] = [
  {
    id: 'login-admin',
    question: 'Wer kann sich einloggen?',
    answer:
      'Nur User, die in public.admin_users stehen. Falls Login geht, aber kein Zugriff da ist, muss die user_id in admin_users eingetragen werden.',
    tags: ['login', 'admin', 'zugriff', 'admin_users'],
  },
  {
    id: 'parks-create',
    question: 'Wie lege ich einen neuen Park an?',
    answer:
      'Unter Parks: Name und Slug eintragen, dann Speichern. Der Slug wird für Prefix-Mapping und Ingestion-Routing genutzt.',
    tags: ['park', 'slug', 'prefix', 'anlegen'],
  },
  {
    id: 'prefix-map',
    question: 'Wofür ist Path Prefix Mapping?',
    answer:
      'Der Prefix entscheidet, welchem Park ein Upload zugeordnet wird. Beispiel: plose-plosebob/dateiname.jpg wird Park Plose zugewiesen.',
    tags: ['prefix', 'mapping', 'ingestion', 'park_id'],
  },
  {
    id: 'camera-multi-park',
    question: 'Kann derselbe Kamera-Code in mehreren Parks existieren?',
    answer:
      'Ja. Beim Speichern gibt es eine Warnung, wenn der Code schon in anderen Parks verwendet wird. Speicherung ist trotzdem möglich.',
    tags: ['kamera', 'customer code', 'mehrere parks', 'warnung'],
  },
  {
    id: 'camera-images',
    question: 'Warum sehe ich manchmal 0 Bilder bei einer Kamera?',
    answer:
      'Erst wird im ausgewählten Park gesucht. Wenn dort nichts gefunden wird, nutzt das Dashboard parkübergreifenden Fallback über customer_code.',
    tags: ['kamera-bilder', 'fallback', '0 bilder', 'photos'],
  },
  {
    id: 'attractions',
    question: 'Wie ordne ich Attraktionen zu?',
    answer:
      'In Attraktionen zuerst Attraktion pro Park anlegen. Danach in Kameras kann die Attraktion für einen Kamera-Code ausgewählt werden.',
    tags: ['attraktion', 'zuordnung', 'kamera'],
  },
  {
    id: 'ingestion-check',
    question: 'Was macht der Ingestion Check?',
    answer:
      'Er zeigt Prefix-Routing, Parsing und Kamera/Attraktions-Match für einen Dateipfad. So kann man Parsing-Probleme schnell debuggen.',
    tags: ['ingestion', 'parser', 'debug', 'dateiname'],
  },
  {
    id: 'support-sync',
    question: 'Wie funktioniert Support Ticket Kunden?',
    answer:
      'Die Seite zeigt synchronisierte Tickets. Die Einspeisung läuft über die Edge Function support-sync mit SUPPORT_SYNC_SECRET.',
    tags: ['support', 'tickets', 'sync', 'webhook'],
  },
  {
    id: 'darkmode',
    question: 'Wie aktiviere ich Dark Mode?',
    answer:
      'Im Header auf Dunkelmodus/Hellmodus klicken. Die Auswahl wird gespeichert und bleibt nach dem Neuladen erhalten.',
    tags: ['dark mode', 'theme', 'anzeige'],
  },
];

const capabilityList = [
  'Parks, Prefixes, Attraktionen und Kamera-Zuordnungen verwalten',
  'Kamera-Bildvorschau mit Park-Fallback und schneller Aktualisierung',
  'Ingestion-Pfade und Parser-Ergebnisse live prüfen',
  'Support-Tickets aus externem Projekt anzeigen',
  'Admin-Zugriff mit Supabase Auth + admin_users',
];

function matchesQuery(item: FaqItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.question.toLowerCase().includes(q) ||
    item.answer.toLowerCase().includes(q) ||
    item.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => faqItems.filter((item) => matchesQuery(item, query)), [query]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [] as string[];
    const q = query.toLowerCase();
    const set = new Set<string>();
    faqItems.forEach((item) => {
      if (item.question.toLowerCase().includes(q)) set.add(item.question);
      item.tags.forEach((tag) => {
        if (tag.toLowerCase().includes(q)) set.add(tag);
      });
    });
    return Array.from(set).slice(0, 8);
  }, [query]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card help-hero">
        <h2>Hilfe & FAQ</h2>
        <p className="note">Suche nach Begriffen wie: Kamera, Prefix, Ingestion, Admin, Support, Dark Mode.</p>
        <div className="help-search-wrap">
          <input
            type="search"
            placeholder="Begriff suchen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="help-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="help-suggestion-btn"
                  onClick={() => setQuery(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Was das Dashboard kann</h3>
        <ul className="help-list">
          {capabilityList.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="support-panel-header">
          <h3>FAQ</h3>
          <span className="note">{filtered.length} Treffer</span>
        </div>

        {filtered.length === 0 && (
          <div className="support-empty">Kein Treffer. Versuch es mit Begriffen wie `kamera`, `prefix` oder `support`.</div>
        )}

        <div className="help-faq-grid">
          {filtered.map((item) => {
            const isOpen = !!openItems[item.id];
            return (
              <article key={item.id} className="help-faq-item">
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
