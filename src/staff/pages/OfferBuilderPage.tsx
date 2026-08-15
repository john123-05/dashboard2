import { useEffect, useMemo, useState } from 'react';
import OfferBuilderStudio, { type OfferLeadOption } from '../components/OfferBuilderStudio';
import {
  attractionMaterialLabel,
  fetchEmailLeads,
  fetchGermanWebsiteRequests,
  fetchProductFinderSubmissions,
  fetchWebsiteRequests,
  type EmailLead,
  type GermanWebsiteRequest,
  type ProductFinderSubmission,
  type WebsiteRequest,
} from '../lib/leads';

export default function OfferBuilderPage() {
  const [leadRows, setLeadRows] = useState<EmailLead[]>([]);
  const [websiteRows, setWebsiteRows] = useState<WebsiteRequest[]>([]);
  const [germanRows, setGermanRows] = useState<GermanWebsiteRequest[]>([]);
  const [productFinderRows, setProductFinderRows] = useState<ProductFinderSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [leads, website, german, productFinder] = await Promise.all([
          fetchEmailLeads(),
          fetchWebsiteRequests(),
          fetchGermanWebsiteRequests(),
          fetchProductFinderSubmissions(),
        ]);

        if (!alive) return;
        setLeadRows(leads);
        setWebsiteRows(website);
        setGermanRows(german);
        setProductFinderRows(productFinder);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Anfragen konnten nicht geladen werden');
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const offerLeadOptions = useMemo<OfferLeadOption[]>(() => {
    const options: OfferLeadOption[] = [
      ...leadRows.map((row) => ({
        id: `lead-${row.id}`,
        label: row.name || row.email || 'Unbekannt',
        company: row.firma || '',
        email: row.email,
        sourceLabel: 'PDF',
        projectType: attractionMaterialLabel(row.attractionstyp) || '',
        country: '',
        note: [row.frage, row.antwort].filter(Boolean).join(' - '),
      })),
      ...websiteRows.map((row) => ({
        id: `website-${row.id}`,
        label: row.name || row.email || 'Unbekannt',
        company: row.company || '',
        email: row.email,
        sourceLabel: 'International',
        projectType: row.project_type || '',
        country: row.country || '',
        note: row.message || '',
      })),
      ...germanRows.map((row) => ({
        id: `german-${row.id}`,
        label: row.name || row.email || 'Unbekannt',
        company: row.company || '',
        email: row.email,
        sourceLabel: 'Deutschland',
        projectType: row.interest || row.attraction_type || '',
        country: 'Deutschland',
        note: row.comment || '',
      })),
      ...productFinderRows.map((row) => ({
        id: `finder-${row.id}`,
        label: row.name || row.email || 'Unbekannt',
        company: row.company || '',
        email: row.email,
        sourceLabel: 'Produktfinder',
        projectType: row.attraction_type || '',
        country: row.target_country || '',
        note: row.answers.map((answer) => `${answer.title}: ${answer.answer}`).join(' · '),
      })),
    ];

    return options.sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [germanRows, leadRows, productFinderRows, websiteRows]);

  return (
    <div className="customer-management-page">
      <div className="card lead-page-head">
        <h2>Angebot erstellen</h2>
      </div>
      {error && <div className="card"><p className="error">{error}</p></div>}
      {loading && (
        <div className="card">
          <p className="note">Lade Interessenten...</p>
        </div>
      )}
      {!loading && <OfferBuilderStudio leadOptions={offerLeadOptions} />}
    </div>
  );
}
