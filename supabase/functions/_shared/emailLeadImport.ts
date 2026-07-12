// Shared between admin-email-leads (staff-facing bulk CSV import) and
// email-lead-intake (automated single-row intake from Make.com) so the two
// entry points can never compute a different import_key for the same row.
export const EMAIL_LEAD_COLUMNS =
  'id, email, name, firma, attractionstyp, frage, antwort, spalte_1, submitted_at, temperature, contacted_at, created_at, updated_at';

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function toTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export function buildEmailLeadImportKey(payload: {
  email: string;
  timestamp: string;
  name: string;
  frage: string;
  firma: string;
}): string {
  const normalize = (input: string) => input.trim().toLowerCase();
  return [
    normalize(payload.email),
    normalize(payload.timestamp),
    normalize(payload.name),
    normalize(payload.frage),
    normalize(payload.firma),
  ].join('|');
}
