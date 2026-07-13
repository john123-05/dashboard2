import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import ContactQuickAdd from '../components/ContactQuickAdd';
import ContactTimeline from '../components/ContactTimeline';
import {
  attractionMaterialLabel,
  addContactEvent,
  detectLanguageHint,
  deleteContactEvent,
  deleteEmailLead,
  deleteGermanWebsiteRequest,
  deleteProductFinderSubmission,
  deleteWebsiteRequest,
  eventsForEmail,
  fetchContactEvents,
  fetchEmailLeads,
  fetchGermanWebsiteRequests,
  fetchProductFinderSubmissions,
  fetchWebsiteRequests,
  updateEmailLead,
  updateGermanWebsiteRequest,
  updateProductFinderSubmission,
  updateWebsiteRequest,
  LEAD_TEMPERATURES,
  LEAD_TEMPERATURE_LABELS,
  type ContactEvent,
  type EmailLead,
  type GermanWebsiteRequest,
  type LeadSourceTable,
  type LeadTemperature,
  type ProductFinderAnswer,
  type ProductFinderSubmission,
  type WebsiteRequest,
} from '../lib/leads';

type WebsiteImportRow = {
  name: string;
  email: string;
  company: string;
  country: string;
  project_type: string;
  referral_source: string;
  message: string;
  timestamp: string;
  source: string;
  useragent: string;
  url: string;
};

type LeadImportRow = {
  email: string;
  name: string;
  firma: string;
  attractionstyp: string;
  frage: string;
  antwort: string;
  spalte1: string;
  timestamp: string;
};

type GermanImportRow = {
  name: string;
  company: string;
  attraction_type: string;
  interest: string;
  email: string;
  phone: string;
  referral_source: string;
  comment: string;
  timestamp: string;
};

type ProductFinderImportRow = {
  name: string;
  email: string;
  company: string;
  language: string;
  target_country: string;
  attraction_type: string;
  answers: ProductFinderAnswer[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return fields.some((field) => (field || '').toLowerCase().includes(needle));
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function detectDelimiter(input: string): ',' | ';' | '\t' {
  const firstLine = input.split(/\r?\n/)[0] || '';
  const candidates: Array<',' | ';' | '\t'> = [',', ';', '\t'];
  const scored = candidates
    .map((delimiter) => ({ delimiter, score: firstLine.split(delimiter).length }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.delimiter || ',';
}

function parseCsv(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '');
  }

  return rows;
}

function mapWebsiteCsvRows(rawRows: string[][]): WebsiteImportRow[] {
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => normalizeHeader(header));
  const getIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const nameIndex = getIndex(['name']);
  const emailIndex = getIndex(['email', 'e-mail', 'mail']);
  const companyIndex = getIndex(['company', 'firma']);
  const countryIndex = getIndex(['country', 'land']);
  const projectTypeIndex = getIndex(['projecttype', 'project']);
  const referralSourceIndex = getIndex(['referralsource', 'referral', 'sourcechannel']);
  const messageIndex = getIndex(['message', 'nachricht']);
  const timestampIndex = getIndex(['timestamp', 'time', 'createdat', 'date']);
  const sourceIndex = getIndex(['source']);
  const userAgentIndex = getIndex(['useragent', 'ua']);
  const urlIndex = getIndex(['url', 'website']);

  const get = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');

  return rawRows
    .slice(1)
    .map((row) => ({
      name: get(row, nameIndex),
      email: get(row, emailIndex),
      company: get(row, companyIndex),
      country: get(row, countryIndex),
      project_type: get(row, projectTypeIndex),
      referral_source: get(row, referralSourceIndex),
      message: get(row, messageIndex),
      timestamp: get(row, timestampIndex),
      source: get(row, sourceIndex),
      useragent: get(row, userAgentIndex),
      url: get(row, urlIndex),
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function mapLeadCsvRows(rawRows: string[][]): LeadImportRow[] {
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => normalizeHeader(header));
  const getIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const emailIndex = getIndex(['email', 'e-mail', 'mail']);
  const nameIndex = getIndex(['name']);
  const firmaIndex = getIndex(['firma', 'company']);
  const attractionstypIndex = getIndex(['attractionstyp', 'attractiontype', 'attraction']);
  const frageIndex = getIndex(['frage', 'question']);
  const antwortIndex = getIndex(['antwort', 'answer']);
  const spalte1Index = getIndex(['spalte1', 'spalte']);
  const timestampIndex = getIndex(['timestamp', 'time', 'createdat', 'date']);

  const get = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');

  return rawRows
    .slice(1)
    .map((row) => ({
      email: get(row, emailIndex),
      name: get(row, nameIndex),
      firma: get(row, firmaIndex),
      attractionstyp: get(row, attractionstypIndex),
      frage: get(row, frageIndex),
      antwort: get(row, antwortIndex),
      spalte1: get(row, spalte1Index),
      timestamp: get(row, timestampIndex),
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

function mapGermanCsvRows(rawRows: string[][]): GermanImportRow[] {
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => normalizeHeader(header));
  const getIndex = (names: string[]) => headers.findIndex((header) => names.includes(header));

  const nameIndex = getIndex(['wiedurfenwirsienennen', 'name']);
  const companyIndex = getIndex(['wieheisstihrunternehmen', 'company', 'firma']);
  const attractionTypeIndex = getIndex(['wasfureineattraktionhabensie', 'attraktionsart']);
  const interestIndex = getIndex(['woransindsieinteressiert', 'interesse']);
  const emailIndex = getIndex(['ihreemailadresse', 'email', 'e-mail', 'mail']);
  const phoneIndex = getIndex(['telefonnummer', 'phone']);
  const referralSourceIndex = getIndex(['wiesindsieaufunsaufmerksamgeworden', 'referralsource']);
  const commentIndex = getIndex(['kommentar', 'comment', 'nachricht']);
  const timestampIndex = getIndex(['datumdereinreichung', 'timestamp', 'time', 'createdat', 'date']);

  const get = (row: string[], index: number) => (index >= 0 ? (row[index] || '').trim() : '');

  return rawRows
    .slice(1)
    .map((row) => ({
      name: get(row, nameIndex),
      company: get(row, companyIndex),
      attraction_type: get(row, attractionTypeIndex),
      interest: get(row, interestIndex),
      email: get(row, emailIndex),
      phone: get(row, phoneIndex),
      referral_source: get(row, referralSourceIndex),
      comment: get(row, commentIndex),
      timestamp: get(row, timestampIndex),
    }))
    .filter((row) => Object.values(row).some(Boolean));
}

// Fixes text that survived a UTF-8-bytes-read-as-Latin-1 mangling (e.g. from
// a badly re-exported CSV). Only touches strings that show the tell-tale
// "Ã"/"Â"/"Ð"/"Ñ" markers, so already-clean text is left untouched.
function fixMojibake(value: string): string {
  if (!value || !/Ã|Â|Ð|Ñ/.test(value)) return value;
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

// "â" between two number-ish tokens is a lossy stand-in for an en-dash range
// separator (e.g. "100 â 500" -> "100-500").
function fixRangeDash(value: string): string {
  return (value || '').replace(/\s*â\s*/g, '-');
}

// The Liftpictures Produktfinder export has no real header row and buries the
// actual structured answers as an escaped JSON blob at the end of each row
// (after a redundant human-readable transcript) — parse that directly rather
// than trusting fixed column positions for anything past name/email/company.
function mapProductFinderCsvRows(rawRows: string[][]): ProductFinderImportRow[] {
  return rawRows
    .map((cells) => {
      const name = fixMojibake((cells[0] || '').trim());
      const email = (cells[1] || '').trim();
      const company = fixMojibake((cells[2] || '').trim());
      const language = (cells[4] || '').trim();
      const targetCountry = (cells[5] || '').trim();

      const lastCell = cells[cells.length - 1] || '';
      const jsonStart = lastCell.indexOf('{"id":"');
      let answers: ProductFinderAnswer[] = [];

      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(`[${lastCell.slice(jsonStart)}]`) as Array<{
            id?: string;
            title?: string;
            answer?: string | string[] | null;
            asked?: boolean;
          }>;
          answers = parsed
            .filter((q) => q.asked && q.answer !== null && q.answer !== undefined)
            .map((q) => ({
              id: q.id || '',
              title: fixMojibake(q.title || ''),
              answer: Array.isArray(q.answer)
                ? q.answer.map((a) => fixRangeDash(fixMojibake(a))).join(', ')
                : fixRangeDash(fixMojibake(String(q.answer))),
            }));
        } catch {
          answers = [];
        }
      }

      const attractionType = answers.find((a) => a.id === 'attractionType')?.answer || '';

      return { name, email, company, language, target_country: targetCountry, attraction_type: attractionType, answers };
    })
    .filter((row) => row.email || row.answers.length > 0);
}

function TemperatureSelect({
  value,
  onChange,
}: {
  value: LeadTemperature;
  onChange: (next: LeadTemperature) => void;
}) {
  return (
    <select
      className={`lead-temp-select lead-temp-${value}`}
      value={value}
      onChange={(e) => onChange(e.target.value as LeadTemperature)}
    >
      {LEAD_TEMPERATURES.map((t) => (
        <option key={t} value={t}>
          {LEAD_TEMPERATURE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function LangBadge({ text }: { text: string }) {
  const lang = detectLanguageHint(text);
  if (!lang || lang === 'DE') return null;
  return (
    <span className="lead-lang-badge" title="Automatisch erkannt aus dem Text">
      {lang}
    </span>
  );
}

function LeadAvatar({ label }: { label: string }) {
  const initial = (label || '?').trim().charAt(0).toUpperCase() || '?';
  return <div className="lead-avatar">{initial}</div>;
}

type LeadTab = 'leads' | 'website' | 'germanWebsite' | 'productFinder';
const VALID_LEAD_TABS: LeadTab[] = ['leads', 'website', 'germanWebsite', 'productFinder'];

export default function WebsiteAnfragenPage() {
  // Read once on mount so a deep link (e.g. from the global search on the
  // Hilfe page) can land on the right tab pre-filtered — the tab/search
  // inputs stay freely editable afterwards, this is just the initial value.
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<LeadTab>(() => {
    const tab = searchParams.get('tab');
    return VALID_LEAD_TABS.includes(tab as LeadTab) ? (tab as LeadTab) : 'leads';
  });
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [websiteRows, setWebsiteRows] = useState<WebsiteRequest[]>([]);
  const [websiteLoading, setWebsiteLoading] = useState(true);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [websiteStatus, setWebsiteStatus] = useState<string | null>(null);
  const [pendingWebsiteRows, setPendingWebsiteRows] = useState<WebsiteImportRow[]>([]);
  const [websiteImporting, setWebsiteImporting] = useState(false);
  const [websiteFileName, setWebsiteFileName] = useState('');
  const [showWebsiteImport, setShowWebsiteImport] = useState(false);
  const [expandedWebsiteIds, setExpandedWebsiteIds] = useState<Set<string>>(new Set());

  const [germanRows, setGermanRows] = useState<GermanWebsiteRequest[]>([]);
  const [germanLoading, setGermanLoading] = useState(true);
  const [germanError, setGermanError] = useState<string | null>(null);
  const [germanStatus, setGermanStatus] = useState<string | null>(null);
  const [pendingGermanRows, setPendingGermanRows] = useState<GermanImportRow[]>([]);
  const [germanImporting, setGermanImporting] = useState(false);
  const [germanFileName, setGermanFileName] = useState('');
  const [showGermanImport, setShowGermanImport] = useState(false);

  const [leadRows, setLeadRows] = useState<EmailLead[]>([]);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [pendingLeadRows, setPendingLeadRows] = useState<LeadImportRow[]>([]);
  const [leadImporting, setLeadImporting] = useState(false);
  const [leadFileName, setLeadFileName] = useState('');
  const [showLeadImport, setShowLeadImport] = useState(false);
  const [expandedLeadIds, setExpandedLeadIds] = useState<Set<string>>(new Set());

  const [productFinderRows, setProductFinderRows] = useState<ProductFinderSubmission[]>([]);
  const [productFinderLoading, setProductFinderLoading] = useState(true);
  const [productFinderError, setProductFinderError] = useState<string | null>(null);
  const [productFinderStatus, setProductFinderStatus] = useState<string | null>(null);
  const [pendingProductFinderRows, setPendingProductFinderRows] = useState<ProductFinderImportRow[]>([]);
  const [productFinderImporting, setProductFinderImporting] = useState(false);
  const [productFinderFileName, setProductFinderFileName] = useState('');
  const [showProductFinderImport, setShowProductFinderImport] = useState(false);
  const [expandedProductFinderIds, setExpandedProductFinderIds] = useState<Set<string>>(new Set());

  function toggleLeadExpanded(id: string) {
    setExpandedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleWebsiteExpanded(id: string) {
    setExpandedWebsiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleProductFinderExpanded(id: string) {
    setExpandedProductFinderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [expandedStatsIds, setExpandedStatsIds] = useState<Set<string>>(new Set());

  function toggleStatsExpanded(id: string) {
    setExpandedStatsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [contactEvents, setContactEvents] = useState<ContactEvent[]>([]);

  const loadContactEvents = useCallback(async () => {
    try {
      setContactEvents(await fetchContactEvents());
    } catch {
      // Non-critical for the rest of the page — the summary/timeline just
      // stays empty if this fails, everything else keeps working.
    }
  }, []);

  async function onAddContact(email: string, sourceTable: LeadSourceTable, sourceId: string, contactedAtIso: string) {
    try {
      const event = await addContactEvent({ email, source_table: sourceTable, source_id: sourceId, contacted_at: contactedAtIso });
      setContactEvents((prev) => [...prev, event]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Kontakt konnte nicht gespeichert werden');
    }
  }

  async function onDeleteContact(id: string) {
    const previous = contactEvents;
    setContactEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteContactEvent(id);
    } catch (err) {
      setContactEvents(previous);
      window.alert(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  const filteredLeadRows = useMemo(
    () =>
      leadRows.filter((row) =>
        matchesQuery(query, [
          row.name,
          row.email,
          row.firma,
          attractionMaterialLabel(row.attractionstyp),
          row.frage,
          row.antwort,
        ]),
      ),
    [leadRows, query],
  );

  const filteredWebsiteRows = useMemo(
    () =>
      websiteRows.filter((row) =>
        matchesQuery(query, [row.name, row.email, row.company, row.country, row.project_type, row.message]),
      ),
    [websiteRows, query],
  );

  const filteredGermanRows = useMemo(
    () =>
      germanRows.filter((row) =>
        matchesQuery(query, [
          row.name,
          row.email,
          row.company,
          row.phone,
          row.attraction_type,
          row.interest,
          row.comment,
        ]),
      ),
    [germanRows, query],
  );

  const filteredProductFinderRows = useMemo(
    () =>
      productFinderRows.filter((row) =>
        matchesQuery(query, [
          row.name,
          row.email,
          row.company,
          row.attraction_type,
          row.language,
          row.target_country,
          ...row.answers.map((a) => a.answer),
        ]),
      ),
    [productFinderRows, query],
  );

  const loadWebsiteRows = useCallback(async () => {
    setWebsiteLoading(true);
    setWebsiteError(null);
    try {
      setWebsiteRows(await fetchWebsiteRequests());
    } catch (err) {
      setWebsiteError(err instanceof Error ? err.message : 'Website-Anfragen konnten nicht geladen werden');
    } finally {
      setWebsiteLoading(false);
    }
  }, []);

  const loadGermanRows = useCallback(async () => {
    setGermanLoading(true);
    setGermanError(null);
    try {
      setGermanRows(await fetchGermanWebsiteRequests());
    } catch (err) {
      setGermanError(err instanceof Error ? err.message : 'Anfragen konnten nicht geladen werden');
    } finally {
      setGermanLoading(false);
    }
  }, []);

  const loadLeadRows = useCallback(async () => {
    setLeadLoading(true);
    setLeadError(null);
    try {
      setLeadRows(await fetchEmailLeads());
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Email-Leads konnten nicht geladen werden');
    } finally {
      setLeadLoading(false);
    }
  }, []);

  const loadProductFinderRows = useCallback(async () => {
    setProductFinderLoading(true);
    setProductFinderError(null);
    try {
      setProductFinderRows(await fetchProductFinderSubmissions());
    } catch (err) {
      setProductFinderError(err instanceof Error ? err.message : 'Einträge konnten nicht geladen werden');
    } finally {
      setProductFinderLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWebsiteRows();
    void loadGermanRows();
    void loadProductFinderRows();
    void loadLeadRows();
    void loadContactEvents();
  }, [loadLeadRows, loadWebsiteRows, loadGermanRows, loadProductFinderRows, loadContactEvents]);

  async function onWebsiteFieldChange(id: string, update: { temperature?: LeadTemperature; contacted_at?: string | null }) {
    const previous = websiteRows;
    setWebsiteError(null);
    setWebsiteRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...update } : r)));
    try {
      await updateWebsiteRequest(id, update);
    } catch (err) {
      setWebsiteRows(previous);
      setWebsiteError(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    }
  }

  async function onGermanFieldChange(id: string, update: { temperature?: LeadTemperature; contacted_at?: string | null }) {
    const previous = germanRows;
    setGermanError(null);
    setGermanRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...update } : r)));
    try {
      await updateGermanWebsiteRequest(id, update);
    } catch (err) {
      setGermanRows(previous);
      setGermanError(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    }
  }

  async function onProductFinderFieldChange(
    id: string,
    update: { temperature?: LeadTemperature; contacted_at?: string | null },
  ) {
    const previous = productFinderRows;
    setProductFinderError(null);
    setProductFinderRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...update } : r)));
    try {
      await updateProductFinderSubmission(id, update);
    } catch (err) {
      setProductFinderRows(previous);
      setProductFinderError(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    }
  }

  async function onLeadFieldChange(id: string, update: { temperature?: LeadTemperature; contacted_at?: string | null }) {
    const previous = leadRows;
    setLeadError(null);
    setLeadRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...update } : r)));
    try {
      await updateEmailLead(id, update);
    } catch (err) {
      setLeadRows(previous);
      setLeadError(err instanceof Error ? err.message : 'Aktualisierung fehlgeschlagen');
    }
  }

  async function onWebsiteDelete(id: string) {
    if (!window.confirm('Diesen Eintrag wirklich endgültig löschen?')) return;
    setDeletingId(id);
    try {
      await deleteWebsiteRequest(id);
      setWebsiteRows((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setWebsiteError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeletingId(null);
    }
  }

  async function onGermanDelete(id: string) {
    if (!window.confirm('Diesen Eintrag wirklich endgültig löschen?')) return;
    setDeletingId(id);
    try {
      await deleteGermanWebsiteRequest(id);
      setGermanRows((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setGermanError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeletingId(null);
    }
  }

  async function onProductFinderDelete(id: string) {
    if (!window.confirm('Diesen Eintrag wirklich endgültig löschen?')) return;
    setDeletingId(id);
    try {
      await deleteProductFinderSubmission(id);
      setProductFinderRows((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setProductFinderError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeletingId(null);
    }
  }

  async function onLeadDelete(id: string) {
    if (!window.confirm('Diesen Eintrag wirklich endgültig löschen?')) return;
    setDeletingId(id);
    try {
      await deleteEmailLead(id);
      setLeadRows((rows) => rows.filter((r) => r.id !== id));
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeletingId(null);
    }
  }

  const onWebsiteFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setWebsiteError(null);
    setWebsiteStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingWebsiteRows([]);
      setWebsiteFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapWebsiteCsvRows(parsedRows);

    if (!mappedRows.length) {
      setWebsiteError('Keine gueltigen CSV-Zeilen gefunden. Bitte Header pruefen.');
      setPendingWebsiteRows([]);
      setWebsiteFileName(file.name);
      return;
    }

    setPendingWebsiteRows(mappedRows);
    setWebsiteFileName(file.name);
    setWebsiteStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onLeadFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setLeadError(null);
    setLeadStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingLeadRows([]);
      setLeadFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapLeadCsvRows(parsedRows);

    if (!mappedRows.length) {
      setLeadError('Keine gueltigen CSV-Zeilen gefunden. Bitte Header pruefen.');
      setPendingLeadRows([]);
      setLeadFileName(file.name);
      return;
    }

    setPendingLeadRows(mappedRows);
    setLeadFileName(file.name);
    setLeadStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onGermanFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setGermanError(null);
    setGermanStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingGermanRows([]);
      setGermanFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapGermanCsvRows(parsedRows);

    if (!mappedRows.length) {
      setGermanError('Keine gueltigen CSV-Zeilen gefunden. Bitte Header pruefen.');
      setPendingGermanRows([]);
      setGermanFileName(file.name);
      return;
    }

    setPendingGermanRows(mappedRows);
    setGermanFileName(file.name);
    setGermanStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onGermanImport = async () => {
    if (!pendingGermanRows.length) return;

    setGermanImporting(true);
    setGermanError(null);
    setGermanStatus(null);

    try {
      const res = await edgeFetch('/api/admin/german-website-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingGermanRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setGermanError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setGermanStatus(`${pendingGermanRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Anfragen (Deutsche Website) importiert',
        details: `${pendingGermanRows.length} Zeilen aus ${germanFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingGermanRows([]);
      setGermanFileName('');
      await loadGermanRows();
    } finally {
      setGermanImporting(false);
    }
  };

  const onProductFinderFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    setProductFinderError(null);
    setProductFinderStatus(null);

    const file = e.target.files?.[0];
    if (!file) {
      setPendingProductFinderRows([]);
      setProductFinderFileName('');
      return;
    }

    const text = await file.text();
    const delimiter = detectDelimiter(text);
    const parsedRows = parseCsv(text, delimiter);
    const mappedRows = mapProductFinderCsvRows(parsedRows);

    if (!mappedRows.length) {
      setProductFinderError('Keine gueltigen CSV-Zeilen gefunden.');
      setPendingProductFinderRows([]);
      setProductFinderFileName(file.name);
      return;
    }

    setPendingProductFinderRows(mappedRows);
    setProductFinderFileName(file.name);
    setProductFinderStatus(`${mappedRows.length} Zeilen bereit fuer Import`);
  };

  const onProductFinderImport = async () => {
    if (!pendingProductFinderRows.length) return;

    setProductFinderImporting(true);
    setProductFinderError(null);
    setProductFinderStatus(null);

    try {
      const res = await edgeFetch('/api/admin/product-finder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingProductFinderRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setProductFinderError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setProductFinderStatus(`${pendingProductFinderRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Produktfinder-Einträge importiert',
        details: `${pendingProductFinderRows.length} Zeilen aus ${productFinderFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingProductFinderRows([]);
      setProductFinderFileName('');
      await loadProductFinderRows();
    } finally {
      setProductFinderImporting(false);
    }
  };

  const onWebsiteImport = async () => {
    if (!pendingWebsiteRows.length) return;

    setWebsiteImporting(true);
    setWebsiteError(null);
    setWebsiteStatus(null);

    try {
      const res = await edgeFetch('/api/admin/website-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingWebsiteRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setWebsiteError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setWebsiteStatus(`${pendingWebsiteRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Website-Anfragen importiert',
        details: `${pendingWebsiteRows.length} Zeilen aus ${websiteFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingWebsiteRows([]);
      setWebsiteFileName('');
      await loadWebsiteRows();
    } finally {
      setWebsiteImporting(false);
    }
  };

  const onLeadImport = async () => {
    if (!pendingLeadRows.length) return;

    setLeadImporting(true);
    setLeadError(null);
    setLeadStatus(null);

    try {
      const res = await edgeFetch('/api/admin/email-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: pendingLeadRows }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setLeadError(getApiErrorMessage(body, 'CSV-Import fehlgeschlagen'));
        return;
      }

      setLeadStatus(`${pendingLeadRows.length} Zeilen importiert`);
      appendActivityEvent({
        title: 'Email-Leads importiert',
        details: `${pendingLeadRows.length} Zeilen aus ${leadFileName || 'CSV'}`,
        level: 'success',
      });
      setPendingLeadRows([]);
      setLeadFileName('');
      await loadLeadRows();
    } finally {
      setLeadImporting(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Interessenten und Anfragen</h2>
        <p className="note">
          PDF-Leads, internationale und deutsche Website-Anfragen an einem Ort — Status setzen, als kontaktiert
          markieren, Details einsehen.
        </p>
      </div>

      <div className="lead-toolbar">
        <div className="lead-tabbar widget-scroll-x">
          <button
            type="button"
            className={`lead-tab ${activeTab === 'leads' ? 'active' : ''}`}
            onClick={() => setActiveTab('leads')}
          >
            PDF E-Mails
            <span className="lead-tab-count">{leadLoading ? '...' : filteredLeadRows.length}</span>
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === 'website' ? 'active' : ''}`}
            onClick={() => setActiveTab('website')}
          >
            Website (International)
            <span className="lead-tab-count">{websiteLoading ? '...' : filteredWebsiteRows.length}</span>
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === 'germanWebsite' ? 'active' : ''}`}
            onClick={() => setActiveTab('germanWebsite')}
          >
            Website (Deutschland)
            <span className="lead-tab-count">{germanLoading ? '...' : filteredGermanRows.length}</span>
          </button>
          <button
            type="button"
            className={`lead-tab ${activeTab === 'productFinder' ? 'active' : ''}`}
            onClick={() => setActiveTab('productFinder')}
          >
            Produktfinder
            <span className="lead-tab-count">{productFinderLoading ? '...' : filteredProductFinderRows.length}</span>
          </button>
        </div>
        <input
          type="search"
          className="lead-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche nach Name, E-Mail, Firma ..."
        />
      </div>

      {activeTab === 'leads' && (
      <div className="card">
        <div className="marketing-section-title">
          <h3>PDF E-Mails ({leadLoading ? '...' : filteredLeadRows.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="secondary inline"
              onClick={() => loadLeadRows()}
              disabled={leadLoading}
              title="Aktualisieren"
              style={{ width: 'auto' }}
            >
              <RefreshCw size={14} className={leadLoading ? 'spin' : ''} />
            </button>
            <button type="button" className="secondary inline" onClick={() => setShowLeadImport((v) => !v)}>
              {showLeadImport ? 'Import ausblenden' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {showLeadImport && (
          <div className="lead-import-panel">
            <p className="note">Spalten wie im Sheet: email, name, firma, attractionstyp, frage, antwort, Spalte 1.</p>
            <div className="upload-row">
              <div className="upload-file-col">
                <label>CSV Datei</label>
                <input type="file" accept=".csv,text/csv" onChange={onLeadFileChange} />
              </div>
              <div className="upload-btn-col">
                <button type="button" onClick={onLeadImport} disabled={!pendingLeadRows.length || leadImporting}>
                  {leadImporting ? 'Import laeuft...' : 'CSV importieren'}
                </button>
              </div>
            </div>
            {leadFileName && <p className="note">Datei: {leadFileName}</p>}
            {pendingLeadRows.length > 0 && <p className="note">Bereit: {pendingLeadRows.length} Zeilen</p>}
            {leadStatus && <p className="success">{leadStatus}</p>}
          </div>
        )}

        {leadError && <p className="error">{leadError}</p>}
        {leadLoading && <p className="note">Lade Daten...</p>}
        {!leadLoading && filteredLeadRows.length === 0 && (
          <p className="note">{query.trim() ? `Keine Treffer für "${query.trim()}".` : 'Noch keine Eintraege.'}</p>
        )}

        <div className="lead-list">
          {!leadLoading &&
            filteredLeadRows.map((row) => {
              const langSource = `${row.frage} ${row.antwort}`.trim();
              const capturedAt = row.spalte_1 || row.submitted_at;
              const pdfLabel = attractionMaterialLabel(row.attractionstyp);
              const expanded = expandedLeadIds.has(row.id);
              const statsExpanded = expandedStatsIds.has(row.id);
              const ownContactEvents = eventsForEmail(contactEvents, row.email);
              return (
                <div key={row.id} className={`lead-card lead-card-${row.temperature}`}>
                  <LeadAvatar label={row.name || row.firma || row.email} />
                  <div className="lead-card-main">
                    <div className="lead-card-head">
                      <span className="lead-card-name">{row.name || row.email || 'Unbekannt'}</span>
                      {row.firma && <span className="lead-card-company">{row.firma}</span>}
                      {pdfLabel && <span className="lead-pdf-badge">PDF: {pdfLabel}</span>}
                    </div>
                    {row.email && (
                      <a className="lead-card-email" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    )}
                    <div className="lead-detail-toggles">
                      {row.frage && (
                        <button type="button" className="lead-qa-toggle" onClick={() => toggleLeadExpanded(row.id)}>
                          {expanded ? 'Details ausblenden' : 'Details anzeigen'}
                        </button>
                      )}
                      {ownContactEvents.length > 0 && (
                        <button type="button" className="lead-qa-toggle" onClick={() => toggleStatsExpanded(row.id)}>
                          {statsExpanded ? 'Statistik ausblenden' : `Statistik anzeigen (${ownContactEvents.length})`}
                        </button>
                      )}
                    </div>
                    {row.frage && expanded && (
                      <div className="lead-qa">
                        <div className="lead-qa-head">{langSource && <LangBadge text={langSource} />}</div>
                        <span className="lead-qa-q">{row.frage}</span>
                        <span className="lead-qa-a">{row.antwort || '-'}</span>
                      </div>
                    )}
                    {statsExpanded && <ContactTimeline events={ownContactEvents} onDelete={onDeleteContact} />}
                    <span className="lead-card-date">{formatDate(capturedAt) || '-'}</span>
                  </div>
                  <div className="lead-card-actions">
                    <TemperatureSelect
                      value={row.temperature}
                      onChange={(temperature) => onLeadFieldChange(row.id, { temperature })}
                    />
                    <ContactQuickAdd onAdd={(iso) => onAddContact(row.email, 'email_leads', row.id, iso)} />
                    <button
                      type="button"
                      className="lead-delete-btn"
                      onClick={() => onLeadDelete(row.id)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? 'Löscht...' : 'Löschen'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      )}

      {activeTab === 'website' && (
      <div className="card">
        <div className="marketing-section-title">
          <h3>Website-Anfragen ({websiteLoading ? '...' : filteredWebsiteRows.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="secondary inline"
              onClick={() => loadWebsiteRows()}
              disabled={websiteLoading}
              title="Aktualisieren"
              style={{ width: 'auto' }}
            >
              <RefreshCw size={14} className={websiteLoading ? 'spin' : ''} />
            </button>
            <button type="button" className="secondary inline" onClick={() => setShowWebsiteImport((v) => !v)}>
              {showWebsiteImport ? 'Import ausblenden' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {showWebsiteImport && (
          <div className="lead-import-panel">
            <div className="upload-row">
              <div className="upload-file-col">
                <label>CSV Datei</label>
                <input type="file" accept=".csv,text/csv" onChange={onWebsiteFileChange} />
              </div>
              <div className="upload-btn-col">
                <button type="button" onClick={onWebsiteImport} disabled={!pendingWebsiteRows.length || websiteImporting}>
                  {websiteImporting ? 'Import laeuft...' : 'CSV importieren'}
                </button>
              </div>
            </div>
            {websiteFileName && <p className="note">Datei: {websiteFileName}</p>}
            {pendingWebsiteRows.length > 0 && <p className="note">Bereit: {pendingWebsiteRows.length} Zeilen</p>}
            {websiteStatus && <p className="success">{websiteStatus}</p>}
          </div>
        )}

        {websiteError && <p className="error">{websiteError}</p>}
        {websiteLoading && <p className="note">Lade Daten...</p>}
        {!websiteLoading && filteredWebsiteRows.length === 0 && (
          <p className="note">{query.trim() ? `Keine Treffer für "${query.trim()}".` : 'Noch keine Eintraege.'}</p>
        )}

        <div className="lead-list">
          {!websiteLoading &&
            filteredWebsiteRows.map((row) => {
              const expanded = expandedWebsiteIds.has(row.id);
              const statsExpanded = expandedStatsIds.has(row.id);
              const ownContactEvents = eventsForEmail(contactEvents, row.email);
              return (
              <div key={row.id} className={`lead-card lead-card-${row.temperature}`}>
                <LeadAvatar label={row.name || row.company || row.email} />
                <div className="lead-card-main">
                  <div className="lead-card-head">
                    <span className="lead-card-name">{row.name || row.email || 'Unbekannt'}</span>
                    {row.company && <span className="lead-card-company">{row.company}</span>}
                    {row.country && <span className="material-lang-badge lang-en">{row.country}</span>}
                    {row.project_type && <span className="material-lang-badge lang-de">{row.project_type}</span>}
                    {row.message && <LangBadge text={row.message} />}
                  </div>
                  {row.email && (
                    <a className="lead-card-email" href={`mailto:${row.email}`}>
                      {row.email}
                    </a>
                  )}
                  <div className="lead-detail-toggles">
                    {row.message && (
                      <button type="button" className="lead-qa-toggle" onClick={() => toggleWebsiteExpanded(row.id)}>
                        {expanded ? 'Details ausblenden' : 'Details anzeigen'}
                      </button>
                    )}
                    {ownContactEvents.length > 0 && (
                      <button type="button" className="lead-qa-toggle" onClick={() => toggleStatsExpanded(row.id)}>
                        {statsExpanded ? 'Statistik ausblenden' : `Statistik anzeigen (${ownContactEvents.length})`}
                      </button>
                    )}
                  </div>
                  {row.message && expanded && <p className="lead-card-message">{row.message}</p>}
                  {statsExpanded && <ContactTimeline events={ownContactEvents} onDelete={onDeleteContact} />}
                  <div className="lead-card-meta">
                    <span className="lead-card-date">{formatDate(row.submitted_at) || '-'}</span>
                    {row.source && <span>{row.source}</span>}
                    {row.url && (
                      <a href={row.url} target="_blank" rel="noreferrer">
                        {row.url}
                      </a>
                    )}
                  </div>
                </div>
                <div className="lead-card-actions">
                  <TemperatureSelect
                    value={row.temperature}
                    onChange={(temperature) => onWebsiteFieldChange(row.id, { temperature })}
                  />
                  <ContactQuickAdd onAdd={(iso) => onAddContact(row.email, 'website_requests', row.id, iso)} />
                  <button
                    type="button"
                    className="lead-delete-btn"
                    onClick={() => onWebsiteDelete(row.id)}
                    disabled={deletingId === row.id}
                  >
                    {deletingId === row.id ? 'Löscht...' : 'Löschen'}
                  </button>
                </div>
              </div>
              );
            })}
        </div>
      </div>
      )}

      {activeTab === 'germanWebsite' && (
      <div className="card">
        <div className="marketing-section-title">
          <h3>Website (Deutschland) ({germanLoading ? '...' : filteredGermanRows.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="secondary inline"
              onClick={() => loadGermanRows()}
              disabled={germanLoading}
              title="Aktualisieren"
              style={{ width: 'auto' }}
            >
              <RefreshCw size={14} className={germanLoading ? 'spin' : ''} />
            </button>
            <button type="button" className="secondary inline" onClick={() => setShowGermanImport((v) => !v)}>
              {showGermanImport ? 'Import ausblenden' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {showGermanImport && (
          <div className="lead-import-panel">
            <p className="note">Export aus dem Wix-Formular (liftpictures.com).</p>
            <div className="upload-row">
              <div className="upload-file-col">
                <label>CSV Datei</label>
                <input type="file" accept=".csv,text/csv" onChange={onGermanFileChange} />
              </div>
              <div className="upload-btn-col">
                <button type="button" onClick={onGermanImport} disabled={!pendingGermanRows.length || germanImporting}>
                  {germanImporting ? 'Import laeuft...' : 'CSV importieren'}
                </button>
              </div>
            </div>
            {germanFileName && <p className="note">Datei: {germanFileName}</p>}
            {pendingGermanRows.length > 0 && <p className="note">Bereit: {pendingGermanRows.length} Zeilen</p>}
            {germanStatus && <p className="success">{germanStatus}</p>}
          </div>
        )}

        {germanError && <p className="error">{germanError}</p>}
        {germanLoading && <p className="note">Lade Daten...</p>}
        {!germanLoading && filteredGermanRows.length === 0 && (
          <p className="note">{query.trim() ? `Keine Treffer für "${query.trim()}".` : 'Noch keine Eintraege.'}</p>
        )}

        <div className="lead-list">
          {!germanLoading &&
            filteredGermanRows.map((row) => {
              const statsExpanded = expandedStatsIds.has(row.id);
              const ownContactEvents = eventsForEmail(contactEvents, row.email);
              return (
              <div key={row.id} className={`lead-card lead-card-${row.temperature}`}>
                <LeadAvatar label={row.name || row.company || row.email} />
                <div className="lead-card-main">
                  <div className="lead-card-head">
                    <span className="lead-card-name">{row.name || row.email || 'Unbekannt'}</span>
                    {row.company && <span className="lead-card-company">{row.company}</span>}
                    {row.attraction_type && <span className="material-lang-badge lang-en">{row.attraction_type}</span>}
                    {row.interest && <span className="material-lang-badge lang-de">{row.interest}</span>}
                  </div>
                  <div className="lead-card-meta">
                    {row.email && (
                      <a className="lead-card-email" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    )}
                    {row.phone && <a href={`tel:${row.phone.replace(/\s+/g, '')}`}>{row.phone}</a>}
                  </div>
                  {row.comment && <p className="lead-card-message">{row.comment}</p>}
                  {ownContactEvents.length > 0 && (
                    <div className="lead-detail-toggles">
                      <button type="button" className="lead-qa-toggle" onClick={() => toggleStatsExpanded(row.id)}>
                        {statsExpanded ? 'Statistik ausblenden' : `Statistik anzeigen (${ownContactEvents.length})`}
                      </button>
                    </div>
                  )}
                  {statsExpanded && <ContactTimeline events={ownContactEvents} onDelete={onDeleteContact} />}
                  <div className="lead-card-meta">
                    <span className="lead-card-date">{formatDate(row.submitted_at) || '-'}</span>
                    {row.referral_source && <span>{row.referral_source}</span>}
                  </div>
                </div>
                <div className="lead-card-actions">
                  <TemperatureSelect
                    value={row.temperature}
                    onChange={(temperature) => onGermanFieldChange(row.id, { temperature })}
                  />
                  <ContactQuickAdd onAdd={(iso) => onAddContact(row.email, 'german_website_requests', row.id, iso)} />
                  <button
                    type="button"
                    className="lead-delete-btn"
                    onClick={() => onGermanDelete(row.id)}
                    disabled={deletingId === row.id}
                  >
                    {deletingId === row.id ? 'Löscht...' : 'Löschen'}
                  </button>
                </div>
              </div>
              );
            })}
        </div>
      </div>
      )}

      {activeTab === 'productFinder' && (
      <div className="card">
        <div className="marketing-section-title">
          <h3>Produktfinder ({productFinderLoading ? '...' : filteredProductFinderRows.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="secondary inline"
              onClick={() => loadProductFinderRows()}
              disabled={productFinderLoading}
              title="Aktualisieren"
              style={{ width: 'auto' }}
            >
              <RefreshCw size={14} className={productFinderLoading ? 'spin' : ''} />
            </button>
            <button type="button" className="secondary inline" onClick={() => setShowProductFinderImport((v) => !v)}>
              {showProductFinderImport ? 'Import ausblenden' : 'CSV importieren'}
            </button>
          </div>
        </div>

        {showProductFinderImport && (
          <div className="lead-import-panel">
            <p className="note">
              Export aus dem Liftpictures-Produktfinder-Quiz. Hinweis: dieser Export enthält kein Einreichungsdatum —
              importierte Einträge werden mit dem heutigen Datum gespeichert.
            </p>
            <div className="upload-row">
              <div className="upload-file-col">
                <label>CSV Datei</label>
                <input type="file" accept=".csv,text/csv" onChange={onProductFinderFileChange} />
              </div>
              <div className="upload-btn-col">
                <button
                  type="button"
                  onClick={onProductFinderImport}
                  disabled={!pendingProductFinderRows.length || productFinderImporting}
                >
                  {productFinderImporting ? 'Import laeuft...' : 'CSV importieren'}
                </button>
              </div>
            </div>
            {productFinderFileName && <p className="note">Datei: {productFinderFileName}</p>}
            {pendingProductFinderRows.length > 0 && <p className="note">Bereit: {pendingProductFinderRows.length} Zeilen</p>}
            {productFinderStatus && <p className="success">{productFinderStatus}</p>}
          </div>
        )}

        {productFinderError && <p className="error">{productFinderError}</p>}
        {productFinderLoading && <p className="note">Lade Daten...</p>}
        {!productFinderLoading && filteredProductFinderRows.length === 0 && (
          <p className="note">{query.trim() ? `Keine Treffer für "${query.trim()}".` : 'Noch keine Eintraege.'}</p>
        )}

        <div className="lead-list">
          {!productFinderLoading &&
            filteredProductFinderRows.map((row) => {
              const expanded = expandedProductFinderIds.has(row.id);
              const statsExpanded = expandedStatsIds.has(row.id);
              const ownContactEvents = eventsForEmail(contactEvents, row.email);
              return (
                <div key={row.id} className={`lead-card lead-card-${row.temperature}`}>
                  <LeadAvatar label={row.name || row.company || row.email} />
                  <div className="lead-card-main">
                    <div className="lead-card-head">
                      <span className="lead-card-name">{row.name || row.email || 'Unbekannt'}</span>
                      {row.company && <span className="lead-card-company">{row.company}</span>}
                      {row.attraction_type && <span className="material-lang-badge lang-en">{row.attraction_type}</span>}
                      {row.language && <span className="lead-lang-badge">{row.language.toUpperCase()}</span>}
                      {row.target_country && <span className="lead-lang-badge">{row.target_country}</span>}
                    </div>
                    {row.email && (
                      <a className="lead-card-email" href={`mailto:${row.email}`}>
                        {row.email}
                      </a>
                    )}
                    <div className="lead-detail-toggles">
                      {row.answers.length > 0 && (
                        <button
                          type="button"
                          className="lead-qa-toggle"
                          onClick={() => toggleProductFinderExpanded(row.id)}
                        >
                          {expanded ? 'Antworten ausblenden' : `Antworten anzeigen (${row.answers.length})`}
                        </button>
                      )}
                      {ownContactEvents.length > 0 && (
                        <button type="button" className="lead-qa-toggle" onClick={() => toggleStatsExpanded(row.id)}>
                          {statsExpanded ? 'Statistik ausblenden' : `Statistik anzeigen (${ownContactEvents.length})`}
                        </button>
                      )}
                    </div>
                    {row.answers.length > 0 && expanded && (
                      <div className="lead-qa">
                        {row.answers.map((a) => (
                          <div key={a.id}>
                            <span className="lead-qa-q">{a.title}</span>
                            <span className="lead-qa-a">{a.answer}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {statsExpanded && <ContactTimeline events={ownContactEvents} onDelete={onDeleteContact} />}
                    <span className="lead-card-date">{formatDate(row.submitted_at) || '-'}</span>
                  </div>
                  <div className="lead-card-actions">
                    <TemperatureSelect
                      value={row.temperature}
                      onChange={(temperature) => onProductFinderFieldChange(row.id, { temperature })}
                    />
                    <ContactQuickAdd
                      onAdd={(iso) => onAddContact(row.email, 'product_finder_submissions', row.id, iso)}
                    />
                    <button
                      type="button"
                      className="lead-delete-btn"
                      onClick={() => onProductFinderDelete(row.id)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? 'Löscht...' : 'Löschen'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      )}
    </div>
  );
}
