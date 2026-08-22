import { handleOptions, json, requireAdminFromRequest, supabaseService } from '../_shared/sameProjectAdminAuth.ts';

const selectColumns = `
  id,
  park_id,
  attraction_id,
  machine_id,
  machine_label,
  camera_code,
  camera_label,
  legacy_customer_code,
  mode,
  qr_enabled,
  speed_enabled,
  count_rides_enabled,
  upload_all_photos,
  shadow_mode,
  raw_dir,
  processed_dir,
  qrcode_dir,
  webout_dir,
  statistic_file,
  print_count_file,
  paper_warn_remaining,
  paper_capacity,
  pairing_code,
  pairing_status,
  last_seen_at,
  last_status,
  settings,
  is_active,
  created_at,
  updated_at
`;

// Dieselben Auftraege wie operator-liftpic-assets, nur vom Super-Admin statt
// vom Betreiber ausgeloest - fuer den Fall, dass ein Kunde selbst nicht ans
// Dashboard kommt oder ein Automat vorbereitet wird, bevor er einem Betreiber
// zugeordnet ist. Absichtlich nur Schluessel, kein Pfad: welches Programm ein
// Ziel meint, entscheidet der Automat selbst aus seiner eigenen Konfiguration.
const RESTART_TARGETS = ['viewer', 'camera', 'lightbarrier', 'testphoto'];
const ORDER_MODES = ['now', 'tonight', 'cancel', 'stop'];

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function intValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeMode(payload: Record<string, unknown>) {
  const mode = text(payload.mode, 'sold_only');
  return ['sold_only', 'all_photos', 'count_only'].includes(mode) ? mode : 'sold_only';
}

function configPayload(payload: Record<string, unknown>, userId: string, isUpdate = false) {
  const mode = normalizeMode(payload);
  const machineId = text(payload.machine_id);
  const parkId = text(payload.park_id);

  const base: Record<string, unknown> = {
    park_id: parkId,
    attraction_id: text(payload.attraction_id) || null,
    machine_id: machineId,
    machine_label: text(payload.machine_label, machineId || 'Liftpic PC'),
    camera_code: text(payload.camera_code, 'cam1'),
    camera_label: text(payload.camera_label, 'Kamera 1'),
    legacy_customer_code: text(payload.legacy_customer_code, '0000').replace(/\D/g, '').slice(0, 4).padStart(4, '0'),
    mode,
    qr_enabled: bool(payload.qr_enabled, mode !== 'count_only'),
    speed_enabled: bool(payload.speed_enabled, true),
    count_rides_enabled: bool(payload.count_rides_enabled, true),
    upload_all_photos: bool(payload.upload_all_photos, mode === 'all_photos'),
    shadow_mode: bool(payload.shadow_mode, true),
    raw_dir: text(payload.raw_dir, 'C:\\liftpic\\fotos'),
    processed_dir: text(payload.processed_dir, 'C:\\liftpic\\fotos\\out'),
    qrcode_dir: text(payload.qrcode_dir, 'C:\\liftpic\\fotos\\qrcode'),
    webout_dir: text(payload.webout_dir, 'C:\\liftpic\\fotos\\webout'),
    statistic_file: text(payload.statistic_file, 'C:\\liftpic\\samuel_neu\\Statistic.txt'),
    print_count_file: text(payload.print_count_file, 'C:\\liftpic\\samuel_neu\\PrintCount.txt'),
    paper_warn_remaining: intValue(payload.paper_warn_remaining, 30),
    paper_capacity: intValue(payload.paper_capacity, 0),
    is_active: bool(payload.is_active, true),
  };

  if (!isUpdate) base.created_by = userId;
  return base;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === 'GET') {
    const [parks, attractions, configs] = await Promise.all([
      supabaseService.from('parks').select('id, slug, name, is_active').order('name', { ascending: true }),
      supabaseService.from('attractions').select('id, park_id, slug, name, is_active').order('name', { ascending: true }),
      supabaseService.from('liftpic_machine_configs').select(selectColumns).order('created_at', { ascending: false }),
    ]);

    if (parks.error) return json({ error: parks.error.message }, 400);
    if (attractions.error) return json({ error: attractions.error.message }, 400);
    if (configs.error) return json({ error: configs.error.message }, 400);

    return json({
      ok: true,
      data: {
        parks: parks.data || [],
        attractions: attractions.data || [],
        configs: configs.data || [],
      },
    });
  }

  if (req.method === 'POST') {
    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload) return json({ error: 'Invalid JSON body' }, 400);
    if (!text(payload.park_id)) return json({ error: 'Park fehlt' }, 400);
    if (!text(payload.machine_id)) return json({ error: 'PC-ID fehlt' }, 400);

    const { data, error } = await supabaseService
      .from('liftpic_machine_configs')
      .insert(configPayload(payload, auth.userId))
      .select(selectColumns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'PATCH') {
    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = text(payload?.id);
    if (!payload || !id) return json({ error: 'Missing id' }, 400);

    const action = text(payload.action);

    if (action === 'order') {
      const mode = text(payload.mode, 'now').toLowerCase();
      if (!ORDER_MODES.includes(mode)) return json({ error: 'Unbekannter Modus' }, 400);

      // Fehlendes Ziel heisst Verkaufsprogramm, damit bleibt ein einfacher
      // Aufruf ohne target moeglich.
      const target = text(payload.target, 'viewer').toLowerCase();
      if (!RESTART_TARGETS.includes(target)) return json({ error: `Unbekanntes Ziel: ${target}` }, 400);

      if (mode === 'stop' && target === 'testphoto') {
        return json({ error: 'Ein Testfoto laesst sich nicht anhalten' }, 400);
      }

      const { data: existing, error: loadError } = await supabaseService
        .from('liftpic_machine_configs')
        .select('id, settings, is_active')
        .eq('id', id)
        .maybeSingle();

      if (loadError) return json({ error: loadError.message }, 400);
      if (!existing) return json({ error: 'Automat nicht gefunden' }, 404);
      if (existing.is_active === false) return json({ error: 'Dieser Automat ist derzeit deaktiviert' }, 409);

      const settings = (existing.settings ?? {}) as Record<string, unknown>;
      const pending =
        mode === 'cancel'
          ? null
          : {
              id: crypto.randomUUID(),
              mode,
              target,
              requested_at: new Date().toISOString(),
              requested_by: auth.userId,
            };

      // Siehe operator-liftpic-assets: `stop` setzt die Pause, jeder Start
      // hebt sie wieder auf - sonst muesste man sie separat aufheben und
      // genau das wird vergessen.
      let pause = settings.viewer_pause ?? null;
      if (mode === 'stop') {
        pause = { ziel: target, gesetzt_am: new Date().toISOString(), gesetzt_von: auth.userId };
      } else if (mode === 'now' || mode === 'tonight') {
        pause = null;
      }

      const { data, error } = await supabaseService
        .from('liftpic_machine_configs')
        .update({ settings: { ...settings, pending_restart: pending, viewer_pause: pause } })
        .eq('id', id)
        .select(selectColumns)
        .maybeSingle();

      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, data });
    }

    const patch = action === 'new_pairing_code'
      ? {
          pairing_code: crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase(),
          device_token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '').slice(0, 16),
          pairing_status: 'ready',
        }
      : configPayload(payload, auth.userId, true);

    const { data, error } = await supabaseService
      .from('liftpic_machine_configs')
      .update(patch)
      .eq('id', id)
      .select(selectColumns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json({ error: 'Missing id' }, 400);

    const { error } = await supabaseService
      .from('liftpic_machine_configs')
      .update({ is_active: false, pairing_status: 'disabled' })
      .eq('id', id);

    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
});
