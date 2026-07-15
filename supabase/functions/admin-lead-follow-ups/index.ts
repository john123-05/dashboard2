import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

const columns = 'id, email, next_due_at, cadence_days, note, created_at, updated_at';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    // Loaded once per page, same pattern as admin-lead-contacts — the
    // frontend resolves each row to a lead by email itself.
    const { data, error } = await supabaseService
      .from('lead_follow_ups')
      .select(columns)
      .order('next_due_at', { ascending: true });

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const payload = await req.json().catch(() => null);
    const email = normalizeEmail(typeof payload?.email === 'string' ? payload.email : '');
    const nextDueAt = typeof payload?.next_due_at === 'string' ? payload.next_due_at : '';
    const cadenceDaysRaw = payload?.cadence_days;
    const cadenceDays =
      typeof cadenceDaysRaw === 'number' && Number.isFinite(cadenceDaysRaw) && cadenceDaysRaw > 0 ? cadenceDaysRaw : null;
    const note = typeof payload?.note === 'string' && payload.note.trim() ? payload.note.trim() : null;

    if (!email) return json({ error: 'Missing email' }, 400);
    if (!nextDueAt || Number.isNaN(new Date(nextDueAt).getTime())) {
      return json({ error: 'Invalid next_due_at' }, 400);
    }

    // "One active follow-up per email" is enforced here rather than via a DB
    // uniqueness constraint, since the lookup key is normalized (lower/trim)
    // rather than the raw stored column.
    const { data: existing, error: lookupError } = await supabaseService
      .from('lead_follow_ups')
      .select('id')
      .ilike('email', email)
      .maybeSingle();

    if (lookupError) return json({ error: lookupError.message }, 400);

    if (existing) {
      const { data, error } = await supabaseService
        .from('lead_follow_ups')
        .update({ next_due_at: nextDueAt, cadence_days: cadenceDays, note, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select(columns)
        .maybeSingle();

      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data });
    }

    const { data, error } = await supabaseService
      .from('lead_follow_ups')
      .insert({ email, next_due_at: nextDueAt, cadence_days: cadenceDays, note })
      .select(columns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('lead_follow_ups').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
