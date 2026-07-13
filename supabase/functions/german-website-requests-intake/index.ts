import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import {
  asText,
  buildGermanWebsiteRequestImportKey,
  GERMAN_WEBSITE_REQUEST_COLUMNS,
  toTimestamp,
} from '../_shared/germanWebsiteRequestImport.ts';

// Automated single-row counterpart to admin-german-website-requests' bulk
// CSV import — called by a Make.com scenario (the German Wix site's form
// submission trigger) instead of a logged-in staff member, gated by a
// shared secret header instead of an admin_users bearer token. Uses the
// same import_key formula as admin-german-website-requests, so a submission
// that arrives here and later shows up in a manual CSV re-import still
// collides correctly instead of duplicating.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Secret',
};

const INTAKE_SECRET = Deno.env.get('GERMAN_WEBSITE_REQUEST_INTAKE_SECRET');

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
    return json({ error: 'GERMAN_WEBSITE_REQUEST_INTAKE_SECRET is not configured on this project' }, 500);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const record = body as Record<string, unknown>;

  // Prefer the header (Make and most tools support custom headers), but
  // fall back to a body field for platforms whose HTTP-request action has
  // no visible headers UI (e.g. Wix Automations' native "Send HTTP Request").
  const givenSecret = req.headers.get('X-Intake-Secret') ?? asText(record.intake_secret);
  if (givenSecret !== INTAKE_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const email = asText(record.email);
  if (!email) {
    return json({ error: 'email is required' }, 400);
  }

  const name = asText(record.name);
  const company = asText(record.company);
  const submittedAt = toTimestamp(record.timestamp);

  const row = {
    name,
    company,
    attraction_type: asText(record.attraction_type),
    interest: asText(record.interest),
    email,
    phone: asText(record.phone),
    referral_source: asText(record.referral_source),
    comment: asText(record.comment),
    submitted_at: submittedAt,
    import_key: buildGermanWebsiteRequestImportKey({ email, timestamp: submittedAt, name, company }),
  };

  const { data, error } = await supabaseService
    .from('german_website_requests')
    .upsert([row], { onConflict: 'import_key' })
    .select(GERMAN_WEBSITE_REQUEST_COLUMNS);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true, data: data?.[0] ?? null });
});
