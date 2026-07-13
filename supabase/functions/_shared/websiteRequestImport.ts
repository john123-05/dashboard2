// Shared between admin-website-requests (staff-facing bulk CSV import) and
// website-requests-intake (automated single-row intake from Make.com) so
// both entry points compute the same import_key for the same submission.
export const WEBSITE_REQUEST_COLUMNS =
  'id, name, email, company, country, project_type, referral_source, message, submitted_at, source, user_agent, url, temperature, contacted_at, created_at, updated_at';

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export function buildWebsiteRequestImportKey(payload: {
  email: string;
  timestamp: string;
  url: string;
  name: string;
  message: string;
}): string {
  const normalize = (input: string) => input.trim().toLowerCase();
  return [
    normalize(payload.email),
    normalize(payload.timestamp),
    normalize(payload.url),
    normalize(payload.name),
    normalize(payload.message),
  ].join('|');
}
