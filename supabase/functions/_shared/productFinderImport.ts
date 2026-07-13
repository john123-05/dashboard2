// Shared between admin-product-finder (staff-facing bulk CSV import) and
// product-finder-intake (automated single-row intake from Make.com) so both
// entry points compute the same import_key for the same submission.
export const PRODUCT_FINDER_COLUMNS =
  'id, name, email, company, language, target_country, attraction_type, answers, submitted_at, source, temperature, contacted_at, created_at, updated_at';

export type IncomingAnswer = { id?: unknown; title?: unknown; answer?: unknown };

export function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function asAnswers(value: unknown): IncomingAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a) => a && typeof a === 'object')
    .map((a) => {
      const entry = a as IncomingAnswer;
      return { id: asText(entry.id), title: asText(entry.title), answer: asText(entry.answer) };
    });
}

export function buildProductFinderImportKey(payload: {
  email: string;
  company: string;
  attractionType: string;
  answers: IncomingAnswer[];
}): string {
  const normalize = (input: string) => input.trim().toLowerCase();
  return [
    normalize(payload.email),
    normalize(payload.company),
    normalize(payload.attractionType),
    normalize(JSON.stringify(payload.answers)),
  ].join('|');
}
