import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import {
  asAnswers,
  asText,
  buildProductFinderImportKey,
  PRODUCT_FINDER_COLUMNS,
} from '../_shared/productFinderImport.ts';

// Automated single-submission counterpart to admin-product-finder's bulk CSV
// import — called by a Make.com scenario (the same webhook that already
// feeds the Onridepictures assessment's Google Sheet + OpenAI + Email chain)
// instead of a logged-in staff member, gated by a shared secret header
// instead of an admin_users bearer token. Uses the same import_key formula
// as admin-product-finder, so a submission that arrives here and later shows
// up in a manual CSV re-import still collides correctly instead of
// duplicating.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Secret',
};

const INTAKE_SECRET = Deno.env.get('PRODUCT_FINDER_INTAKE_SECRET');

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405);
  }

  if (!INTAKE_SECRET) {
    return json({ error: 'PRODUCT_FINDER_INTAKE_SECRET is not configured on this project' }, 500);
  }

  const givenSecret = req.headers.get('X-Intake-Secret');
  if (givenSecret !== INTAKE_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const record = body as Record<string, unknown>;
  const email = asText(record.email);
  if (!email) {
    return json({ error: 'email is required' }, 400);
  }

  const company = asText(record.company);
  const attractionType = asText(record.attraction_type);
  const answers = asAnswers(record.answers);

  const row = {
    name: asText(record.name),
    email,
    company,
    language: asText(record.language),
    target_country: asText(record.target_country),
    attraction_type: attractionType,
    answers,
    import_key: buildProductFinderImportKey({ email, company, attractionType, answers }),
  };

  const { data, error } = await supabaseService
    .from('product_finder_submissions')
    .upsert([row], { onConflict: 'import_key' })
    .select(PRODUCT_FINDER_COLUMNS);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true, data: data?.[0] ?? null });
});
