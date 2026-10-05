import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

/**
 * admin-park-equipment
 *
 * Staff-Pflege der "Konfiguration/Shop"-Liste je Park (park_equipment_items),
 * inkl. Produktbild + Vorher/Nachher-Bild. Lesen laeuft direkt per Client
 * (RLS fuer admin_users), nur Schreiben geht hier ueber Service-Role, gleiches
 * Muster wie admin-park-cameras.
 *
 *   POST (JSON oder multipart/form-data mit optionalen Dateien
 *         image / before_image / after_image, Flags remove_image /
 *         remove_before_image / remove_after_image zum Entfernen)
 *     { id?, park_id, kategorie, titel, beschreibung?, status,
 *       geschaetzter_mehrumsatz_cents?, sortierung? } -> Anlegen/Aendern
 *   DELETE ?id=... -> Loeschen
 */

const BUCKET = 'equipment-images';
const KATEGORIEN = ['Automat', 'Kamera', 'Zubehoer', 'Software', 'Webshop', 'Sonstiges'];
const STATUS = ['vorhanden', 'empfohlen', 'bestellt'];
const BESTELLSTATUS = ['bestellung_erhalten', 'in_bearbeitung', 'versendet', 'installiert'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SELECT_COLUMNS =
  'id, park_id, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, mehrwert_text, bestellstatus, sortierung, image_url, before_image_url, after_image_url';

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function oneOf(value: unknown, allowed: string[], fallback: string): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

async function uploadImage(file: File, parkId: string): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Bild zu groß (max. 8 MB)');
  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt');

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const storagePath = `${parkId}/${crypto.randomUUID()}${ext}`;

  const { error } = await supabaseService.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  const { data } = supabaseService.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || '';
    let payload: Record<string, unknown> = {};
    let imageFile: File | null = null;
    let beforeFile: File | null = null;
    let afterFile: File | null = null;
    let removeImage = false;
    let removeBefore = false;
    let removeAfter = false;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      if (!form) return json({ error: 'Invalid form data' }, 400);
      payload = Object.fromEntries(form.entries()) as Record<string, unknown>;

      const img = form.get('image');
      if (img instanceof File && img.size > 0) imageFile = img;
      const bef = form.get('before_image');
      if (bef instanceof File && bef.size > 0) beforeFile = bef;
      const aft = form.get('after_image');
      if (aft instanceof File && aft.size > 0) afterFile = aft;

      removeImage = text(form.get('remove_image')) === 'true';
      removeBefore = text(form.get('remove_before_image')) === 'true';
      removeAfter = text(form.get('remove_after_image')) === 'true';
    } else {
      payload = ((await req.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
    }

    const parkId = text(payload.park_id);
    const titel = text(payload.titel);
    if (!parkId) return json({ error: 'Park fehlt' }, 400);
    if (!titel) return json({ error: 'Titel fehlt' }, 400);

    const row: Record<string, unknown> = {
      park_id: parkId,
      kategorie: oneOf(payload.kategorie, KATEGORIEN, 'Sonstiges'),
      titel,
      beschreibung: text(payload.beschreibung) || null,
      status: oneOf(payload.status, STATUS, 'empfohlen'),
      geschaetzter_mehrumsatz_cents:
        payload.geschaetzter_mehrumsatz_cents != null && payload.geschaetzter_mehrumsatz_cents !== ''
          ? Math.round(Number(payload.geschaetzter_mehrumsatz_cents)) || null
          : null,
      mehrwert_text: text(payload.mehrwert_text) || null,
      bestellstatus:
        oneOf(payload.status, STATUS, 'empfohlen') === 'bestellt'
          ? (typeof payload.bestellstatus === 'string' && BESTELLSTATUS.includes(payload.bestellstatus)
              ? payload.bestellstatus
              : 'bestellung_erhalten')
          : null,
      sortierung: Number.isFinite(Number(payload.sortierung)) ? Number(payload.sortierung) : 0,
      updated_at: new Date().toISOString(),
    };

    try {
      if (imageFile) row.image_url = await uploadImage(imageFile, parkId);
      else if (removeImage) row.image_url = null;

      if (beforeFile) row.before_image_url = await uploadImage(beforeFile, parkId);
      else if (removeBefore) row.before_image_url = null;

      if (afterFile) row.after_image_url = await uploadImage(afterFile, parkId);
      else if (removeAfter) row.after_image_url = null;
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Bild-Upload fehlgeschlagen' }, 400);
    }

    const id = text(payload.id);
    const query = id
      ? supabaseService.from('park_equipment_items').update(row).eq('id', id)
      : supabaseService.from('park_equipment_items').insert(row);

    const { data, error } = await query.select(SELECT_COLUMNS).maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService.from('park_equipment_items').delete().eq('id', id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
