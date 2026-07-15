import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

const BUCKET = 'lead-contact-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;
// Generous enough for a phone photo or a scanned PDF, small enough to keep
// this a quick attach-and-go action rather than a general file store.
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

const columns = 'id, contact_event_id, file_path, file_name, mime_type, file_size_bytes, created_at';

interface AttachmentRow {
  id: string;
  contact_event_id: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

async function withSignedUrl(row: AttachmentRow) {
  const { data } = await supabaseService.storage.from(BUCKET).createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS);
  return { ...row, url: data?.signedUrl ?? null };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    // Loaded once per page, same as admin-lead-contacts — the frontend
    // groups these by contact_event_id itself rather than one request per
    // contact, which keeps this cheap regardless of how many leads a page
    // renders at once.
    const { data, error } = await supabaseService
      .from('lead_contact_attachments')
      .select(columns)
      .order('created_at', { ascending: true });

    if (error) return json({ error: error.message }, 400);

    const withUrls = await Promise.all((data || []).map(withSignedUrl));
    return json({ ok: true, data: withUrls });
  }

  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: 'Invalid form data' }, 400);

    const contactEventId = String(form.get('contact_event_id') || '');
    const file = form.get('file');

    if (!contactEventId) return json({ error: 'Missing contact_event_id' }, 400);
    if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);
    if (file.size > MAX_FILE_BYTES) return json({ error: 'Datei zu groß (max. 15 MB)' }, 400);
    if (!ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))) {
      return json({ error: 'Nur Bilder oder PDFs erlaubt' }, 400);
    }

    const { data: eventRow } = await supabaseService
      .from('lead_contact_events')
      .select('id')
      .eq('id', contactEventId)
      .maybeSingle();
    if (!eventRow) return json({ error: 'Kontakt-Eintrag nicht gefunden' }, 404);

    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const storagePath = `${contactEventId}/${crypto.randomUUID()}${ext}`;

    const { error: uploadError } = await supabaseService.storage
      .from(BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) return json({ error: uploadError.message }, 400);

    const { data, error } = await supabaseService
      .from('lead_contact_attachments')
      .insert({
        contact_event_id: contactEventId,
        file_path: storagePath,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
      })
      .select(columns)
      .maybeSingle();

    if (error) {
      // Don't leave an orphaned file in storage if the row insert failed.
      await supabaseService.storage.from(BUCKET).remove([storagePath]);
      return json({ error: error.message }, 400);
    }

    return json({ ok: true, data: await withSignedUrl(data as AttachmentRow) });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { data: row } = await supabaseService
      .from('lead_contact_attachments')
      .select('file_path')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabaseService.from('lead_contact_attachments').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);

    if (row?.file_path) {
      await supabaseService.storage.from(BUCKET).remove([row.file_path]);
    }

    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
