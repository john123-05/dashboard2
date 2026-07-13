import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import {
  asText,
  buildWebsiteRequestImportKey,
  toTimestamp,
  WEBSITE_REQUEST_COLUMNS,
} from '../_shared/websiteRequestImport.ts';

// Automated single-row counterpart to admin-website-requests' bulk CSV
// import — called by a Make.com scenario (the international website's
// contact-form webhook) instead of a logged-in staff member, gated by a
// shared secret header instead of an admin_users bearer token. Uses the same
// import_key formula as admin-website-requests, so a submission that arrives
// here and later shows up in a manual CSV re-import still collides correctly
// instead of duplicating.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Secret',
};

const INTAKE_SECRET = Deno.env.get('WEBSITE_REQUEST_INTAKE_SECRET');

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
    return json({ error: 'WEBSITE_REQUEST_INTAKE_SECRET is not configured on this project' }, 500);
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

  const name = asText(record.name);
  const message = asText(record.message);
  const url = asText(record.url);
  const submittedAt = toTimestamp(record.timestamp);

  const row = {
    name,
    email,
    company: asText(record.company),
    country: asText(record.country),
    project_type: asText(record.project_type),
    referral_source: asText(record.referral_source),
    message,
    submitted_at: submittedAt,
    source: asText(record.source),
    user_agent: asText(record.useragent),
    url,
    import_key: buildWebsiteRequestImportKey({ email, timestamp: submittedAt, url, name, message }),
  };

  const { data, error } = await supabaseService
    .from('website_requests')
    .upsert([row], { onConflict: 'import_key' })
    .select(WEBSITE_REQUEST_COLUMNS);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true, data: data?.[0] ?? null });
});
