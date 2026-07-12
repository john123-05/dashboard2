import {
  handleOptions,
  json,
  requireAdminFromRequest,
  supabaseService,
  isValidTemperature,
} from '../_shared/sameProjectAdminAuth.ts';

const columns =
  'id, name, company, attraction_type, interest, email, phone, referral_source, comment, submitted_at, source, temperature, contacted_at, created_at, updated_at';

type IncomingRow = {
  name?: unknown;
  company?: unknown;
  attraction_type?: unknown;
  interest?: unknown;
  email?: unknown;
  phone?: unknown;
  referral_source?: unknown;
  comment?: unknown;
  timestamp?: unknown;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function buildImportKey(payload: { email: string; timestamp: string; name: string; company: string }): string {
  const normalize = (input: string) => input.trim().toLowerCase();
  return [normalize(payload.email), normalize(payload.timestamp), normalize(payload.name), normalize(payload.company)].join(
    '|',
  );
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || '500'), 2000);

    const { data, error } = await supabaseService
      .from('german_website_requests')
      .select(columns)
      .order('submitted_at', { ascending: false })
      .limit(Number.isFinite(limit) ? limit : 500);

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const payload = await req.json().catch(() => null);
    const rows = Array.isArray(payload?.rows) ? (payload.rows as IncomingRow[]) : null;

    if (!rows || rows.length === 0) {
      return json({ error: 'Invalid payload: rows[] is required' }, 400);
    }

    if (rows.length > 5000) {
      return json({ error: 'Too many rows. Maximum 5000 per import.' }, 400);
    }

    const upsertRows = rows.map((row) => {
      const name = asText(row.name);
      const company = asText(row.company);
      const submittedAt = toTimestamp(row.timestamp);

      return {
        name,
        company,
        attraction_type: asText(row.attraction_type),
        interest: asText(row.interest),
        email: asText(row.email),
        phone: asText(row.phone),
        referral_source: asText(row.referral_source),
        comment: asText(row.comment),
        submitted_at: submittedAt,
        import_key: buildImportKey({ email: asText(row.email), timestamp: submittedAt, name, company }),
      };
    });

    const { data, error } = await supabaseService
      .from('german_website_requests')
      .upsert(upsertRows, { onConflict: 'import_key' })
      .select(columns);

    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, imported: upsertRows.length, data: data || [] });
  }

  if (req.method === 'PATCH') {
    const payload = await req.json().catch(() => null);
    const id = typeof payload?.id === 'string' ? payload.id : null;
    if (!id) return json({ error: 'Missing id' }, 400);

    const update: Record<string, unknown> = {};

    if ('temperature' in (payload || {})) {
      if (!isValidTemperature(payload.temperature)) {
        return json({ error: 'Invalid temperature' }, 400);
      }
      update.temperature = payload.temperature;
    }

    if ('contacted_at' in (payload || {})) {
      const value = payload.contacted_at;
      if (value !== null && typeof value !== 'string') {
        return json({ error: 'Invalid contacted_at' }, 400);
      }
      update.contacted_at = value;
    }

    if (Object.keys(update).length === 0) {
      return json({ error: 'Nothing to update' }, 400);
    }

    const { data, error } = await supabaseService
      .from('german_website_requests')
      .update(update)
      .eq('id', id)
      .select(columns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: 'Not found' }, 404);

    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('german_website_requests').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
