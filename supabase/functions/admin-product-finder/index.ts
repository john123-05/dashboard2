import {
  handleOptions,
  json,
  requireAdminFromRequest,
  supabaseService,
  isValidTemperature,
} from '../_shared/sameProjectAdminAuth.ts';
import {
  asAnswers,
  asText,
  buildProductFinderImportKey,
  PRODUCT_FINDER_COLUMNS,
} from '../_shared/productFinderImport.ts';

const columns = PRODUCT_FINDER_COLUMNS;

type IncomingRow = {
  name?: unknown;
  email?: unknown;
  company?: unknown;
  language?: unknown;
  target_country?: unknown;
  attraction_type?: unknown;
  answers?: unknown;
};

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || '500'), 2000);

    const { data, error } = await supabaseService
      .from('product_finder_submissions')
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
      const email = asText(row.email);
      const company = asText(row.company);
      const attractionType = asText(row.attraction_type);
      const answers = asAnswers(row.answers);

      return {
        name: asText(row.name),
        email,
        company,
        language: asText(row.language),
        target_country: asText(row.target_country),
        attraction_type: attractionType,
        answers,
        import_key: buildProductFinderImportKey({ email, company, attractionType, answers }),
      };
    });

    const { data, error } = await supabaseService
      .from('product_finder_submissions')
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
      .from('product_finder_submissions')
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

    const { error } = await supabaseService.from('product_finder_submissions').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
