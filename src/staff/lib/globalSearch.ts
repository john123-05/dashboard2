import { fetchStaffCredentials, type StaffCredential } from './staffCredentials';
import { mediaAssetUrl, searchMediaAssets, type MediaAsset } from './mediaAssets';
import {
  fetchEmailLeads,
  fetchGermanWebsiteRequests,
  fetchProductFinderSubmissions,
  fetchWebsiteRequests,
  LEAD_SOURCE_TABLE_SHORT_LABELS,
  type EmailLead,
  type GermanWebsiteRequest,
  type LeadSourceTable,
  type ProductFinderSubmission,
  type WebsiteRequest,
} from './leads';
import { attractionMaterials, generalDocs, helpfulLinks, socialLinks, uploaderDocs } from './marketingMaterials';

export type SearchCategory = 'contact' | 'password' | 'media' | 'material' | 'link' | 'faq';

export const SEARCH_CATEGORY_LABELS: Record<SearchCategory, string> = {
  contact: 'Kontakte & Anfragen',
  password: 'Passwörter',
  media: 'Medien',
  material: 'Werbematerialien',
  link: 'Links',
  faq: 'Hilfe-Artikel',
};

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  thumbnail?: string;
  // Internal navigation target (react-router path, may include query params).
  path?: string;
  // External/document URL, opened in a new tab.
  href?: string;
  // Custom action (used by FAQ results to expand + scroll instead of navigating).
  onSelect?: () => void;
}

export interface SearchSources {
  credentials: StaffCredential[];
  media: MediaAsset[];
  leads: EmailLead[];
  website: WebsiteRequest[];
  german: GermanWebsiteRequest[];
  productFinder: ProductFinderSubmission[];
  errors: string[];
}

function unwrap<T>(result: PromiseSettledResult<T[]>, label: string, errors: string[]): T[] {
  if (result.status === 'fulfilled') return result.value;
  errors.push(label);
  return [];
}

export async function fetchSearchSources(): Promise<SearchSources> {
  const [credentials, media, leads, website, german, productFinder] = await Promise.allSettled([
    fetchStaffCredentials(),
    searchMediaAssets({ limit: 200 }).then((r) => r.items),
    fetchEmailLeads(),
    fetchWebsiteRequests(),
    fetchGermanWebsiteRequests(),
    fetchProductFinderSubmissions(),
  ]);

  const errors: string[] = [];
  return {
    credentials: unwrap(credentials, 'Passwörter', errors),
    media: unwrap(media, 'Medien', errors),
    leads: unwrap(leads, 'PDF E-Mails', errors),
    website: unwrap(website, 'Anfragen International', errors),
    german: unwrap(german, 'Anfragen Deutschland', errors),
    productFinder: unwrap(productFinder, 'Produktfinder', errors),
    errors,
  };
}

function fieldsMatch(q: string, fields: Array<string | null | undefined>): boolean {
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}

function contactResult(
  id: string,
  title: string,
  email: string,
  company: string | undefined,
  sourceTable: LeadSourceTable,
  tab: string,
): SearchResult {
  return {
    id: `contact-${sourceTable}-${id}`,
    category: 'contact',
    title: title || email,
    subtitle: [email, company].filter(Boolean).join(' · '),
    badge: LEAD_SOURCE_TABLE_SHORT_LABELS[sourceTable],
    path: `/staff/website-anfragen?tab=${tab}&q=${encodeURIComponent(email)}`,
  };
}

// Pure function so it can run against freshly-fetched or already-cached
// sources without caring which — all filtering happens client-side once the
// sources are loaded, so typing doesn't trigger any network calls.
export function searchSources(sources: SearchSources, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const cred of sources.credentials) {
    if (fieldsMatch(q, [cred.label, cred.category, cred.person_name, cred.login, cred.notes])) {
      results.push({
        id: `password-${cred.id}`,
        category: 'password',
        title: cred.label,
        subtitle: [cred.person_name, cred.category].filter(Boolean).join(' · ') || undefined,
        path: `/staff/passwoerter?q=${encodeURIComponent(cred.label)}`,
      });
    }
  }

  for (const asset of sources.media) {
    if (fieldsMatch(q, [asset.title, asset.category, asset.subcategory, ...(asset.keywords || [])])) {
      results.push({
        id: `media-${asset.id}`,
        category: 'media',
        title: asset.title,
        subtitle: [asset.category, asset.subcategory].filter(Boolean).join(' · ') || undefined,
        thumbnail: asset.media_type === 'image' ? mediaAssetUrl(asset.storage_path) : undefined,
        path: `/staff/medien?q=${encodeURIComponent(asset.title)}`,
      });
    }
  }

  for (const doc of [...generalDocs, ...uploaderDocs]) {
    if (fieldsMatch(q, [doc.title, doc.description])) {
      results.push({
        id: `material-${doc.id}`,
        category: 'material',
        title: doc.title,
        subtitle: doc.description,
        badge: doc.language === 'de' ? 'Deutsch' : 'English',
        href: doc.url,
      });
    }
  }

  for (const item of attractionMaterials) {
    if (fieldsMatch(q, [item.category, item.description])) {
      results.push(
        {
          id: `material-${item.id}-de`,
          category: 'material',
          title: item.category,
          subtitle: item.description,
          badge: 'Deutsch',
          href: item.de,
        },
        {
          id: `material-${item.id}-en`,
          category: 'material',
          title: item.category,
          subtitle: item.description,
          badge: 'English',
          href: item.en,
        },
      );
    }
  }

  for (const row of sources.leads) {
    if (fieldsMatch(q, [row.name, row.email, row.firma, row.attractionstyp, row.frage, row.antwort])) {
      results.push(contactResult(row.id, row.name, row.email, row.firma, 'email_leads', 'leads'));
    }
  }
  for (const row of sources.website) {
    if (fieldsMatch(q, [row.name, row.email, row.company, row.country, row.project_type, row.message])) {
      results.push(contactResult(row.id, row.name, row.email, row.company, 'website_requests', 'website'));
    }
  }
  for (const row of sources.german) {
    if (fieldsMatch(q, [row.name, row.email, row.company, row.attraction_type, row.interest, row.comment])) {
      results.push(contactResult(row.id, row.name, row.email, row.company, 'german_website_requests', 'germanWebsite'));
    }
  }
  for (const row of sources.productFinder) {
    if (fieldsMatch(q, [row.name, row.email, row.company, row.target_country, row.attraction_type])) {
      results.push(
        contactResult(row.id, row.name, row.email, row.company, 'product_finder_submissions', 'productFinder'),
      );
    }
  }

  for (const link of socialLinks) {
    if (fieldsMatch(q, [link.platform, link.label])) {
      results.push({
        id: `link-${link.id}`,
        category: 'link',
        title: link.label,
        subtitle: link.platform,
        href: link.url,
      });
    }
  }
  for (const link of helpfulLinks) {
    if (fieldsMatch(q, [link.label, link.description])) {
      results.push({
        id: `link-${link.id}`,
        category: 'link',
        title: link.label,
        subtitle: link.description,
        href: link.copyOnly ? undefined : link.url,
      });
    }
  }

  return results;
}

export function groupResults(results: SearchResult[]): Partial<Record<SearchCategory, SearchResult[]>> {
  const grouped: Partial<Record<SearchCategory, SearchResult[]>> = {};
  for (const r of results) {
    (grouped[r.category] ??= []).push(r);
  }
  return grouped;
}
