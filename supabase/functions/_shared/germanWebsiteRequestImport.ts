// Shared between admin-german-website-requests (staff-facing bulk CSV
// import) and german-website-requests-intake (automated single-row intake
// from Make.com) so both entry points compute the same import_key for the
// same submission.
export const GERMAN_WEBSITE_REQUEST_COLUMNS =
  'id, name, company, attraction_type, interest, email, phone, referral_source, comment, submitted_at, source, temperature, contacted_at, created_at, updated_at';

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export function buildGermanWebsiteRequestImportKey(payload: {
  email: string;
  timestamp: string;
  name: string;
  company: string;
}): string {
  const normalize = (input: string) => input.trim().toLowerCase();
  return [normalize(payload.email), normalize(payload.timestamp), normalize(payload.name), normalize(payload.company)].join(
    '|',
  );
}
