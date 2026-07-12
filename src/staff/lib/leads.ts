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
  created_at: string;
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

export async function fetchProductFinderSubmissions(): Promise<ProductFinderSubmission[]> {
  const res = await edgeFetch('/api/admin/product-finder?limit=1000');
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(getApiErrorMessage(body, 'Einträge konnten nicht geladen werden'));
  return Array.isArray(body?.data) ? body.data : [];
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
