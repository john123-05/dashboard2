import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-liftpic-assets
 *
 * Lets a PARK OPERATOR (customer) replace a small set of branding images on
 * their own photo kiosk, straight from the customer dashboard's
 * "Personalisierung" page. Until now this was only possible for staff via
 * `admin-liftpic-assets`.
 *
 * Deployed on the SHARED project (kvpcwlcfgmsmarjtwpsx) because that is where
 * `liftpic_machine_configs`, `liftpic_asset_deployments` and the
 * `liftpic-assets` bucket live. The caller's token however comes from the
 * separate operator project, so this function must run with
 * `verify_jwt = false` and validate that token itself via
 * `_shared/operatorAuth.ts` — same pattern as operator-notification-settings.
 *
 * Security model (all three layers matter):
 *  1. `requireOperatorForPark` verifies the token AND that the caller may read
 *     that park. Park RLS on the operator project is `is_org_member(...)`, so a
 *     customer cannot name a foreign park_id (e.g. Imst) and get through.
 *  2. The machine must actually belong to that park — checked against
 *     `liftpic_machine_configs.park_id` here, not taken from the request.
 *  3. `target_path` is NEVER read from the request. The client may only name a
 *     slot key; the destination path on the PC comes from the server-side
 *     whitelist below. Otherwise a customer could overwrite arbitrary files
 *     inside the agent's allowed roots.
 */

// Ausweichziel: der Bucket `liftpic-assets` verweigert seit der Umstellung auf
// die neuen API-Schluessel jeden Upload aus der Funktionsumgebung (HTTP 400,
// "The related resource does not exist") - unabhaengig von Datentyp, upsert,
// Pfadtiefe, public-Flag und Groessen-/MIME-Limits. Nur `test` nimmt zuverlaessig
// an. Der Agent liest den Bucket aus liftpic_asset_deployments.bucket, die Kette
// bleibt also intakt. Ist die Ursache geklaert, genuegt das Zuruecksetzen hier.
const BUCKET = 'test';
const PATH_PREFIX = 'liftpic-assets';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];

type SlotDefinition = {
  label: string;
  target: string;
  hint: string;
};

// Server-side whitelist. Keep in sync with CUSTOMER_SLOTS in
// src/components/AutomatBranding.tsx (labels may differ, keys/targets must not).
const CUSTOMER_SLOTS: Record<string, SlotDefinition> = {
  viewer_overlay_png: {
    label: 'Foto-Overlay',
    target: 'C:\\liftpic\\samuel_neu\\overlay.png',
    hint: 'restart_viewer',
  },
  viewer_main_logo: {
    label: 'Automat-Logo',
    target: 'C:\\liftpic\\samuel_neu\\diabolos.png',
    hint: 'restart_viewer',
  },
  viewer_background: {
    label: 'Hintergrund',
    target: 'C:\\liftpic\\samuel_neu\\hintergrund.png',
    hint: 'restart_viewer',
  },
};

const machineColumns = 'id, park_id, machine_id, machine_label, camera_code, last_seen_at, is_active';
const assetColumns =
  'id, park_id, machine_id, camera_code, slot, label, target_path, file_size, content_type, updated_at, created_at';

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function safeName(input: string) {
  return (
    (input || 'asset')
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'asset'
  );
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function slotCatalogue() {
  return Object.entries(CUSTOMER_SLOTS).map(([id, slot]) => ({
    id,
    label: slot.label,
    target_path: slot.target,
  }));
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const url = new URL(req.url);

  // ---------------------------------------------------------------- GET
  if (req.method === 'GET') {
    const parkId = text(url.searchParams.get('park_id'));
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);

    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const { data: machines, error: machineError } = await supabaseService
      .from('liftpic_machine_configs')
      .select(machineColumns)
      .eq('park_id', auth.parkId)
      .eq('is_active', true)
      .order('machine_label', { ascending: true });

    if (machineError) return json({ error: machineError.message }, 400);

    const { data: assets, error: assetError } = await supabaseService
      .from('liftpic_asset_deployments')
      .select(assetColumns)
      .eq('park_id', auth.parkId)
      .eq('is_active', true)
      .in('slot', Object.keys(CUSTOMER_SLOTS))
      .order('updated_at', { ascending: false });

    if (assetError) return json({ error: assetError.message }, 400);

    return json({
      ok: true,
      data: {
        machines: machines || [],
        assets: assets || [],
        slots: slotCatalogue(),
      },
    });
  }

  // --------------------------------------------------------------- POST
  if (req.method === 'POST') {
    const form = await req.formData().catch(() => null);
    if (!form) return json({ error: 'Ungueltiger Formularinhalt' }, 400);

    const parkId = text(form.get('park_id'));
    if (!parkId) return json({ error: 'park_id fehlt' }, 400);

    const auth = await requireOperatorForPark(req, parkId);
    if (!auth.ok) return json({ error: auth.message }, auth.status);

    const slotId = text(form.get('slot'));
    const slot = CUSTOMER_SLOTS[slotId];
    if (!slot) {
      return json({ error: 'Dieser Bereich kann nicht veraendert werden' }, 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Datei fehlt' }, 400);
    if (file.size === 0) return json({ error: 'Die Datei ist leer' }, 400);
    if (file.size > MAX_FILE_BYTES) {
      return json({ error: 'Die Datei ist zu gross (maximal 10 MB)' }, 400);
    }
    if (file.type && !ALLOWED_MIME.includes(file.type)) {
      return json({ error: 'Nur PNG, JPEG oder WebP sind erlaubt' }, 400);
    }

    const machineConfigId = text(form.get('machine_config_id'));
    if (!machineConfigId) return json({ error: 'Automat fehlt' }, 400);

    const { data: machine, error: machineError } = await supabaseService
      .from('liftpic_machine_configs')
      .select(machineColumns)
      .eq('id', machineConfigId)
      .maybeSingle();

    if (machineError) return json({ error: machineError.message }, 400);
    if (!machine) return json({ error: 'Automat nicht gefunden' }, 404);

    // Decisive check: the machine must belong to the park the caller proved
    // access to. Never trust a park_id that came along with the machine.
    if (machine.park_id !== auth.parkId) {
      return json({ error: 'Dieser Automat gehoert nicht zu deinem Park' }, 403);
    }
    if (machine.is_active === false) {
      return json({ error: 'Dieser Automat ist derzeit deaktiviert' }, 409);
    }

    const buffer = await file.arrayBuffer();
    const digest = await sha256Hex(buffer);
    const storagePath = [
      PATH_PREFIX,
      'parks',
      auth.parkId,
      machine.machine_id || 'park-wide',
      machine.camera_code || 'all-cameras',
      `${slotId}-${Date.now()}-${safeName(file.name)}`,
    ].join('/');

    // Bewusst als Uint8Array hochgeladen: das File-Objekt aus FormData wird von
    // manchen storage-js-Versionen im Deno-Runtime nicht sauber gestreamt und
    // quittiert das mit einem irrefuehrenden "related resource" Fehler.
    const bytes = new Uint8Array(buffer);
    const { error: uploadError } = await supabaseService.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      return json(
        { error: `Ablage-Upload fehlgeschlagen (${BUCKET}/${storagePath}): ${uploadError.message}` },
        400,
      );
    }

    // Retire the previous deployment for this slot/machine so the agent only
    // ever sees one active entry per slot.
    const { error: retireError } = await supabaseService
      .from('liftpic_asset_deployments')
      .update({ is_active: false })
      .eq('park_id', auth.parkId)
      .eq('slot', slotId)
      .eq('machine_id', machine.machine_id)
      .eq('camera_code', machine.camera_code);

    if (retireError) {
      return json({ error: `Vorherige Zuweisung konnte nicht deaktiviert werden: ${retireError.message}` }, 400);
    }

    const { data, error } = await supabaseService
      .from('liftpic_asset_deployments')
      .insert({
        park_id: auth.parkId,
        machine_config_id: machine.id,
        machine_id: machine.machine_id,
        camera_code: machine.camera_code,
        slot: slotId,
        label: slot.label,
        target_path: slot.target,
        bucket: BUCKET,
        storage_path: storagePath,
        sha256: digest,
        content_type: file.type || null,
        file_size: file.size,
        restart_hint: slot.hint,
        notes: `Vom Betreiber ueber die Personalisierung hochgeladen (operator ${auth.userId})`,
      })
      .select(assetColumns)
      .maybeSingle();

    if (error) {
      return json({ error: `Eintrag konnte nicht gespeichert werden: ${error.message}` }, 400);
    }
    return json({ ok: true, data });
  }

  return json({ error: 'Method not allowed' }, 405);
});
