import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

const BUCKET = 'liftpic-assets';

const selectColumns = `
  id,
  park_id,
  machine_config_id,
  machine_id,
  camera_code,
  slot,
  label,
  target_path,
  bucket,
  storage_path,
  sha256,
  content_type,
  file_size,
  restart_hint,
  notes,
  is_active,
  created_at,
  updated_at
`;

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeName(input: string) {
  return (input || 'asset')
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'asset';
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer: ArrayBuffer) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', buffer));
}

async function resolveMachine(input: Record<string, unknown>) {
  const configId = text(input.machine_config_id);
  if (!configId) {
    return {
      machine_config_id: null,
      park_id: text(input.park_id),
      machine_id: text(input.machine_id) || null,
      camera_code: text(input.camera_code) || null,
    };
  }

  const { data, error } = await supabaseService
    .from('liftpic_machine_configs')
    .select('id, park_id, machine_id, camera_code')
    .eq('id', configId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Liftpic PC nicht gefunden');

  return {
    machine_config_id: data.id,
    park_id: data.park_id,
    machine_id: data.machine_id,
    camera_code: data.camera_code,
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    const { data, error } = await supabaseService
      .from('liftpic_asset_deployments')
      .select(selectColumns)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data || [] });
  }

  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: 'Invalid form body' }, 400);

    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Datei fehlt' }, 400);

    const fields = Object.fromEntries(form.entries()) as Record<string, unknown>;
    const machine = await resolveMachine(fields);
    if (!machine.park_id) return json({ error: 'Park fehlt' }, 400);

    const slot = text(fields.slot, 'custom');
    const label = text(fields.label, slot);
    const targetPath = text(fields.target_path);
    if (!targetPath) return json({ error: 'Zielpfad fehlt' }, 400);

    const buffer = await file.arrayBuffer();
    const digest = await sha256(buffer);
    const storagePath = [
      'parks',
      machine.park_id,
      machine.machine_id || 'park-wide',
      machine.camera_code || 'all-cameras',
      `${slot}-${Date.now()}-${safeName(file.name)}`,
    ].join('/');

    const { error: uploadError } = await supabaseService.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
    if (uploadError) return json({ error: uploadError.message }, 400);

    await supabaseService
      .from('liftpic_asset_deployments')
      .update({ is_active: false })
      .eq('park_id', machine.park_id)
      .eq('slot', slot)
      .eq('machine_id', machine.machine_id)
      .eq('camera_code', machine.camera_code);

    const { data, error } = await supabaseService
      .from('liftpic_asset_deployments')
      .insert({
        park_id: machine.park_id,
        machine_config_id: machine.machine_config_id,
        machine_id: machine.machine_id,
        camera_code: machine.camera_code,
        slot,
        label,
        target_path: targetPath,
        bucket: BUCKET,
        storage_path: storagePath,
        sha256: digest,
        content_type: file.type || null,
        file_size: file.size,
        restart_hint: text(fields.restart_hint) || null,
        notes: text(fields.notes) || null,
        created_by: auth.userId,
      })
      .select(selectColumns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService
      .from('liftpic_asset_deployments')
      .update({ is_active: false })
      .eq('id', id);

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
