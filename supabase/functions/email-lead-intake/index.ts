import { supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { asText, buildEmailLeadImportKey, EMAIL_LEAD_COLUMNS, toTimestamp } from '../_shared/emailLeadImport.ts';

// Automated single-row counterpart to admin-email-leads' bulk CSV import —
// called by a Make.com scenario (Google Sheets "Watch New Rows" -> HTTP
// "Make a request") instead of a logged-in staff member, so it's gated by a
// shared secret header instead of an admin_users bearer token. Uses the same
// import_key formula as admin-email-leads, so a row that arrives here first
// and later shows up in a manual CSV re-import (or vice versa) still
// collides correctly instead of creating a duplicate.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Intake-Secret',
};

const INTAKE_SECRET = Deno.env.get('EMAIL_LEAD_INTAKE_SECRET');

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
    return json({ error: 'EMAIL_LEAD_INTAKE_SECRET is not configured on this project' }, 500);
  }

  const givenSecret = req.headers.get('X-Intake-Secret');
  if (givenSecret !== INTAKE_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = asText((body as Record<string, unknown>).email);
  if (!email) {
    return json({ error: 'email is required' }, 400);
  }

  const name = asText((body as Record<string, unknown>).name);
  const firma = asText((body as Record<string, unknown>).firma);
  const attractionstyp = asText((body as Record<string, unknown>).attractionstyp);
  const frage = asText((body as Record<string, unknown>).frage);
  const antwort = asText((body as Record<string, unknown>).antwort);
  const spalte1 = asText((body as Record<string, unknown>).spalte1);
  const submittedAt = toTimestamp(spalte1);

  const row = {
    email,
    name,
    firma,
    attractionstyp,
    frage,
    antwort,
    spalte_1: spalte1,
    submitted_at: submittedAt,
    import_key: buildEmailLeadImportKey({ email, timestamp: submittedAt, name, frage, firma }),
  };

  const { data, error } = await supabaseService
    .from('email_leads')
    .upsert([row], { onConflict: 'import_key' })
    .select(EMAIL_LEAD_COLUMNS);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true, data: data?.[0] ?? null });
});
