import { edgeFetch } from './edge-fetch';
import { getApiErrorMessage } from './api-error';
import { attractionMaterials } from './marketingMaterials';

export const LEAD_TEMPERATURES = ['heiss', 'warm', 'kalt'] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

export const LEAD_TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  heiss: 'Heiß',
  warm: 'Medium',
  kalt: 'Kalt',
};

export interface WebsiteRequest {
  id: string;
  name: string;
  email: string;
  company: string;
  country: string;
  project_type: string;
  referral_source: string;
  message: string;
  submitted_at: string;
  source: string;
  user_agent: string;
  url: string;
  temperature: LeadTemperature;
  contacted_at: string | null;
}

export interface EmailLead {
  id: string;
  email: string;
  name: string;
  firma: string;
  attractionstyp: string;
  frage: string;
  antwort: string;
  spalte_1: string;
  submitted_at: string;
  temperature: LeadTemperature;
  contacted_at: string | null;
}

// From the German liftpictures.com Wix contact form — distinct from
// WebsiteRequest, which comes from the international onridepictures.com site.
export interface GermanWebsiteRequest {
  id: string;
  name: string;
  company: string;
  attraction_type: string;
  interest: string;
  email: string;
  phone: string;
  referral_source: string;
  comment: string;
  submitted_at: string;
  source: string;
  temperature: LeadTemperature;
  contacted_at: string | null;
}

export interface ProductFinderAnswer {
  id: string;
  title: string;
  answer: string;
}

// From the "Liftpictures Produktfinder" quiz widget — a structured
// self-assessment (variable question set, since some questions are only
// asked conditionally), not a simple contact form.
export interface ProductFinderSubmission {
  id: string;
  name: string;
  email: string;
  company: string;
  language: string;
  target_country: string;
  attraction_type: string;
  answers: ProductFinderAnswer[];
  submitted_at: string;
  source: string;
  temperature: LeadTemperature;
  contacted_at: string | null;
}

export const LEAD_SOURCE_TABLES = [
  'email_leads',
  'website_requests',
  'german_website_requests',
  'product_finder_submissions',
] as const;
export type LeadSourceTable = (typeof LEAD_SOURCE_TABLES)[number];

export const LEAD_SOURCE_TABLE_LABELS: Record<LeadSourceTable, string> = {
  email_leads: 'PDF E-Mail',
  website_requests: 'Anfrage (International)',
  german_website_requests: 'Anfrage (Deutschland)',
  product_finder_submissions: 'Produktfinder',
};

// Compact form for tight spaces (the lead-card actions column) — the full
// label above is still used in tooltips, where space isn't as constrained.
export const LEAD_SOURCE_TABLE_SHORT_LABELS: Record<LeadSourceTable, string> = {
  email_leads: 'PDF',
  website_requests: 'Intl.',
  german_website_requests: 'DE',
  product_finder_submissions: 'Finder',
};

// A contact event is keyed by email, not by the row it was logged from — that
// is what lets a contact logged while looking at e.g. a website inquiry show
// up automatically on the same person's PDF-lead card too, labelled with
// which list ("process") it actually happened through.
export interface ContactEvent {
  id: string;
  email: string;
  source_table: LeadSourceTable;
  source_id: string | null;
  contacted_at: string;
  note: string | null;
  created_at: string;
}

// A file (image or PDF) attached to a specific contact event, so the
// timeline can show exactly what was exchanged and when — not just that a
// contact happened. `url` is a short-lived signed URL issued by the edge
// function each time attachments are loaded, not a stored value.
export interface ContactAttachment {
  id: string;
  contact_event_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
  url: string | null;
}

// Not a hook — safe to call inside a .map() while rendering a list of cards.
export function attachmentsForEvent(attachments: ContactAttachment[], contactEventId: string): ContactAttachment[] {
  return attachments.filter((a) => a.contact_event_id === contactEventId);
}

export async function fetchContactAttachments(): Promise<ContactAttachment[]> {
  const res = await edgeFetch('/api/admin/lead-contact-attachments');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Anhänge konnten nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
}

export async function uploadContactAttachment(contactEventId: string, file: File): Promise<ContactAttachment> {
  const form = new FormData();
  form.set('contact_event_id', contactEventId);
  form.set('file', file, file.name);
  // No Content-Type header set deliberately — the browser needs to add its
  // own multipart boundary, which it only does when the body is a FormData
  // instance and nothing has already claimed Content-Type.
  const res = await edgeFetch('/api/admin/lead-contact-attachments', { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Datei konnte nicht hochgeladen werden'));
  return body.data as ContactAttachment;
}

export async function deleteContactAttachment(id: string): Promise<void> {
  const res = await edgeFetch(`/api/admin/lead-contact-attachments?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Löschen fehlgeschlagen'));
  }
}

// Not a hook — safe to call inside a .map() while rendering a list of cards.
export function eventsForEmail(events: ContactEvent[], email: string): ContactEvent[] {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];
  return events
    .filter((e) => e.email.trim().toLowerCase() === needle)
    .slice()
    .sort((a, b) => new Date(a.contacted_at).getTime() - new Date(b.contacted_at).getTime());
}

export async function fetchContactEvents(): Promise<ContactEvent[]> {
  const res = await edgeFetch('/api/admin/lead-contacts');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Kontakt-Historie konnte nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
}

export async function addContactEvent(input: {
  email: string;
  source_table: LeadSourceTable;
  source_id: string;
  contacted_at: string;
  note?: string;
}): Promise<ContactEvent> {
  const res = await edgeFetch('/api/admin/lead-contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Kontakt konnte nicht gespeichert werden'));
  return body.data as ContactEvent;
}

export async function deleteContactEvent(id: string): Promise<void> {
  const res = await edgeFetch(`/api/admin/lead-contacts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Löschen fehlgeschlagen'));
  }
}

export async function fetchWebsiteRequests(): Promise<WebsiteRequest[]> {
  const res = await edgeFetch('/api/admin/website-requests?limit=1000');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Website-Anfragen konnten nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
}

export async function fetchGermanWebsiteRequests(): Promise<GermanWebsiteRequest[]> {
  const res = await edgeFetch('/api/admin/german-website-requests?limit=1000');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Anfragen konnten nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
}

export async function fetchEmailLeads(): Promise<EmailLead[]> {
  const res = await edgeFetch('/api/admin/email-leads?limit=1000');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Email-Leads konnten nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
}

// Answers is expected to be an array of {id, title, answer}, but it's
// possible for it to arrive malformed (e.g. a plain string) if it was
// written by something other than admin-product-finder/product-finder-intake
// — a bad shape here must never crash rendering for every row on the page,
// so anything that isn't a well-formed answer array is dropped rather than
// trusted as-is.
function normalizeProductFinderAnswers(value: unknown): ProductFinderAnswer[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (a): a is ProductFinderAnswer => !!a && typeof a === 'object' && 'answer' in a,
  );
}

export async function fetchProductFinderSubmissions(): Promise<ProductFinderSubmission[]> {
  const res = await edgeFetch('/api/admin/product-finder?limit=1000');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Einträge konnten nicht geladen werden'));
  const rows: ProductFinderSubmission[] = Array.isArray(body?.data) ? body.data : [];
  return rows.map((row) => ({ ...row, answers: normalizeProductFinderAnswers(row.answers) }));
}

async function patchLead<T>(
  path:
    | '/api/admin/website-requests'
    | '/api/admin/german-website-requests'
    | '/api/admin/product-finder'
    | '/api/admin/email-leads',
  id: string,
  update: { temperature?: LeadTemperature; contacted_at?: string | null },
): Promise<T> {
  const res = await edgeFetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...update }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Aktualisierung fehlgeschlagen'));
  return body.data as T;
}

export function updateWebsiteRequest(
  id: string,
  update: { temperature?: LeadTemperature; contacted_at?: string | null },
): Promise<WebsiteRequest> {
  return patchLead<WebsiteRequest>('/api/admin/website-requests', id, update);
}

export function updateGermanWebsiteRequest(
  id: string,
  update: { temperature?: LeadTemperature; contacted_at?: string | null },
): Promise<GermanWebsiteRequest> {
  return patchLead<GermanWebsiteRequest>('/api/admin/german-website-requests', id, update);
}

export function updateEmailLead(
  id: string,
  update: { temperature?: LeadTemperature; contacted_at?: string | null },
): Promise<EmailLead> {
  return patchLead<EmailLead>('/api/admin/email-leads', id, update);
}

export function updateProductFinderSubmission(
  id: string,
  update: { temperature?: LeadTemperature; contacted_at?: string | null },
): Promise<ProductFinderSubmission> {
  return patchLead<ProductFinderSubmission>('/api/admin/product-finder', id, update);
}

async function deleteLead(
  path:
    | '/api/admin/website-requests'
    | '/api/admin/german-website-requests'
    | '/api/admin/product-finder'
    | '/api/admin/email-leads',
  id: string,
): Promise<void> {
  const res = await edgeFetch(`${path}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(getApiErrorMessage(body, 'Löschen fehlgeschlagen'));
  }
}

export function deleteWebsiteRequest(id: string): Promise<void> {
  return deleteLead('/api/admin/website-requests', id);
}

export function deleteGermanWebsiteRequest(id: string): Promise<void> {
  return deleteLead('/api/admin/german-website-requests', id);
}

export function deleteEmailLead(id: string): Promise<void> {
  return deleteLead('/api/admin/email-leads', id);
}

export function deleteProductFinderSubmission(id: string): Promise<void> {
  return deleteLead('/api/admin/product-finder', id);
}

// email_leads.attractionstyp values (e.g. "water", "onride", "messe") come
// from the PDF lead-magnet form and line up with the Werbematerialien PDF
// categories, just with slightly different spelling in a couple of cases.
const ATTRACTION_TYPE_ALIASES: Record<string, string> = {
  messe: 'messen',
  stationär: 'stationary',
  stationaer: 'stationary',
};

export function attractionMaterialLabel(attractionstyp: string): string | null {
  const raw = attractionstyp?.trim().toLowerCase();
  if (!raw) return null;
  const id = ATTRACTION_TYPE_ALIASES[raw] || raw;
  const match = attractionMaterials.find((m) => m.id === id);
  return match?.category || attractionstyp;
}

// Best-effort language hint from free text — there is no dedicated language
// column, so this is inferred from script/keywords, not authoritative. The
// `country` field (already captured on website_requests) remains the
// reliable signal; this is just a secondary hint shown as a small badge.
export function detectLanguageHint(text: string): string | null {
  if (!text || !text.trim()) return null;
  if (/[Ѐ-ӿ]/.test(text)) return 'RU';
  if (/[一-鿿]/.test(text)) return 'ZH';
  if (/[぀-ヿ]/.test(text)) return 'JA';
  const germanMarkers =
    /[äöüßÄÖÜ]|\b(ist|oder|eher|nicht|für|und|wir|eine|sehr|bitte|danke|freundlichen|grüßen|guten|hallo|frage|dauer|veranstaltung|kosten|preis|wie|viel)\b/i;
  if (germanMarkers.test(text)) return 'DE';
  return 'EN';
}

// Cross-table attraction category, for filtering across all 4 lead lists at
// once — each table names this concept differently (see the interfaces
// above) and email_leads' own values are already inconsistently spelled
// (handled by ATTRACTION_TYPE_ALIASES above). Anything that doesn't resolve
// to a known id still lands in a visible "sonstiges" bucket rather than
// disappearing from a filtered view or throwing.
export const LEAD_CATEGORIES = ['onride', 'water', 'alpine', 'stationary', 'messen', 'sonstiges'] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];

export const LEAD_CATEGORY_LABELS: Record<LeadCategory, string> = {
  onride: 'OnRide',
  water: 'Wasserattraktionen',
  alpine: 'Alpine Coaster',
  stationary: 'Stationär',
  messen: 'Messen',
  sonstiges: 'Sonstiges',
};

function categoryFromRawValue(raw: string | null | undefined): LeadCategory {
  const trimmed = (raw || '').trim().toLowerCase();
  if (!trimmed) return 'sonstiges';
  const id = ATTRACTION_TYPE_ALIASES[trimmed] || trimmed;
  return (LEAD_CATEGORIES as readonly string[]).includes(id) ? (id as LeadCategory) : 'sonstiges';
}

export function normalizeAttractionCategory(
  sourceTable: LeadSourceTable,
  row: EmailLead | WebsiteRequest | GermanWebsiteRequest | ProductFinderSubmission,
): LeadCategory {
  switch (sourceTable) {
    case 'email_leads':
      return categoryFromRawValue((row as EmailLead).attractionstyp);
    case 'website_requests':
      return categoryFromRawValue((row as WebsiteRequest).project_type);
    case 'german_website_requests':
      return categoryFromRawValue((row as GermanWebsiteRequest).attraction_type);
    case 'product_finder_submissions':
      return categoryFromRawValue((row as ProductFinderSubmission).attraction_type);
    default:
      return 'sonstiges';
  }
}

// Common language-name/locale prefixes, so a product-finder value like
// "Deutsch", "de-DE" or "English (US)" still resolves to a clean 2-letter
// code. Anything unrecognized falls back to the raw value (uppercased)
// rather than being dropped, so it's still filterable once real data is seen.
const LANGUAGE_CODE_PREFIXES: Record<string, string> = {
  de: 'DE',
  en: 'EN',
  fr: 'FR',
  it: 'IT',
  es: 'ES',
  nl: 'NL',
  pl: 'PL',
  ru: 'RU',
  zh: 'ZH',
  ja: 'JA',
};

function normalizeLanguageCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const prefix = trimmed.slice(0, 2).toLowerCase();
  return LANGUAGE_CODE_PREFIXES[prefix] || trimmed.toUpperCase();
}

// Only product_finder_submissions has a real language column. The German
// channel (german_website_requests) is definitionally German end-to-end, so
// that's hardcoded rather than guessed. The other two fall back to the
// existing detectLanguageHint() heuristic over their own free-text fields.
export function resolveLeadLanguage(
  sourceTable: LeadSourceTable,
  row: EmailLead | WebsiteRequest | GermanWebsiteRequest | ProductFinderSubmission,
): string | null {
  switch (sourceTable) {
    case 'product_finder_submissions': {
      const lang = (row as ProductFinderSubmission).language;
      return lang ? normalizeLanguageCode(lang) : null;
    }
    case 'german_website_requests':
      return 'DE';
    case 'email_leads': {
      const r = row as EmailLead;
      return detectLanguageHint(`${r.frage} ${r.antwort}`.trim());
    }
    case 'website_requests':
      return detectLanguageHint((row as WebsiteRequest).message);
    default:
      return null;
  }
}

export type LeadSortKey = 'date' | 'temperature' | 'name';
export type SortDirection = 'asc' | 'desc';

const TEMPERATURE_ORDER: Record<LeadTemperature, number> = { heiss: 0, warm: 1, kalt: 2 };

// Shared sort, applied client-side to already-fetched rows — kept generic so
// all 4 tabs (and, later, a unified cross-table view) use the exact same
// sort semantics instead of 4 subtly different reimplementations.
export function sortLeadRows<T extends { submitted_at: string; temperature: LeadTemperature }>(
  rows: T[],
  sortKey: LeadSortKey,
  direction: SortDirection,
  getSortName: (row: T) => string,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'date') {
      return sign * (new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    }
    if (sortKey === 'temperature') {
      return sign * (TEMPERATURE_ORDER[a.temperature] - TEMPERATURE_ORDER[b.temperature]);
    }
    return sign * getSortName(a).localeCompare(getSortName(b), 'de');
  });
}
