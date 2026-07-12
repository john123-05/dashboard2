import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

const columns = 'id, email, source_table, source_id, contacted_at, created_at';

const SOURCE_TABLES = ['email_leads', 'website_requests', 'german_website_requests', 'product_finder_submissions'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    // Loaded once per page and filtered client-side by email — that's what
    // lets a contact logged from one list (e.g. a website inquiry) show up
    // automatically wherever else the same email appears (e.g. a PDF lead).
    const { data, error } = await supabaseService
      .from('lead_contact_events')
      .select(columns)
      .order('contacted_at', { ascending: true });

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const payload = await req.json().catch(() => null);
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    const sourceTable = typeof payload?.source_table === 'string' ? payload.source_table : '';
    const sourceId = typeof payload?.source_id === 'string' ? payload.source_id : null;
    const contactedAtInput = typeof payload?.contacted_at === 'string' ? payload.contacted_at : '';

    if (!email) return json({ error: 'Missing email' }, 400);
    if (!SOURCE_TABLES.includes(sourceTable)) return json({ error: 'Invalid source_table' }, 400);

    const parsedDate = contactedAtInput ? new Date(contactedAtInput) : new Date();
    const contactedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

    const { data, error } = await supabaseService
      .from('lead_contact_events')
      .insert({ email, source_table: sourceTable, source_id: sourceId, contacted_at: contactedAt })
      .select(columns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('lead_contact_events').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
