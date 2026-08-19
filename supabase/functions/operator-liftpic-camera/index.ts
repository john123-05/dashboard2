import { handleOptions, json, supabaseService } from '../_shared/sameProjectAdminAuth.ts';
import { requireOperatorForPark } from '../_shared/operatorAuth.ts';

/**
 * operator-liftpic-camera
 *
 * Nimmt vom Betreiber gewuenschte Kameraeinstellungen entgegen und legt sie als
 * Auftrag im `settings`-Feld des Automaten ab. Der Automat holt sich `settings`
 * ohnehin bei jeder Konfigurationsauffrischung (liftpic-config liefert es mit),
 * fuehrt den Auftrag genau einmal aus, schreibt vorher eine Sicherung der
 * trigger.xml und startet danach die Kamerasoftware neu.
 *
 * WARUM UEBER `settings` UND NICHT UEBER EINEN EIGENEN ABRUF: so muss keine der
 * fuenf Automaten-Functions angefasst werden (liftpic-config, liftpic-status,
 * liftpic-ingest-begin, liftpic-ingest-commit, liftpic-assets). Ein Deploy auf
 * eine davon hat am 15.08.2026 `verify_jwt` auf true gesetzt und damit ALLE
 * Anlagen ausgesperrt - sie melden sich mit einem Geraetetoken, das kein JWT
 * ist. Siehe F-031 im Fehlerjournal des Uploader-Repos.
 *
 * BEWUSST EINE EIGENE FUNCTION. Sie haette auch in operator-liftpic-assets
 * gepasst - aber die regelt Neustarts und Bild-Uploads, beides laeuft, und ein
 * Fehler beim Umbau haette das mitgerissen. Getrennt ist der Wirkungskreis
 * kleiner.
 *
 * Laeuft mit verify_jwt = false; der Operator-Token stammt aus dem anderen
 * Projekt und wird hier selbst geprueft.
 */

// Was gesetzt werden darf, und in welchen Grenzen.
//
// Absichtlich dieselbe Liste wie SCHREIBBAR im Agenten
// (src/liftpic_sync/camera_settings.py). Doppelt gepflegt ist hier richtig: der
// Agent darf sich nicht darauf verlassen, dass der Server geprueft hat, und der
// Server nicht darauf, dass der Agent es tut. Wer eine Grenze aendert, muss
// beide anfassen - das ist der Preis dafuer, dass ein Fehler an einer Stelle
// nicht durchschlaegt.
//
// Die Grenzen sind enger als das technisch Moegliche: trigger.xml speichert nur
// Werte, keine Bereiche, wir kennen die echten also nicht. Ein Wert, den die
// Kamera nicht annimmt, faellt erst beim naechsten Gast auf.
const GRENZEN: Record<string, [number, number]> = {
  'Brightness.Value': [-64, 64],
  'Contrast.Value': [-64, 64],
  'Saturation.Value': [0, 200],
  'Hue.Value': [-180, 180],
  'Gamma.Value': [0.1, 3],
  'Sharpness.Value': [0, 100],
  'Denoise.Value': [0, 100],
  'Exposure.Value': [0.00002, 2],
  'Exposure.Auto': [0, 1],
  'Exposure.Auto Reference': [0, 255],
  'Gain.Auto': [0, 1],
  'Gain.Auto Max Value': [0, 96],
  'WhiteBalance.Auto': [0, 1],
  'Tone Mapping.Enable': [0, 1],
  'Highlight Reduction.Enable': [0, 1],
};

// Wie viele Werte ein Auftrag hoechstens tragen darf. Mehr gibt es nicht, und
// eine Obergrenze verhindert, dass jemand die settings-Spalte vollschreibt.
const MAX_WERTE = 20;

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'Ungueltiger Inhalt' }, 400);

  const parkId = text(body.park_id);
  if (!parkId) return json({ error: 'park_id fehlt' }, 400);

  const auth = await requireOperatorForPark(req, parkId);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  const machineConfigId = text(body.machine_config_id);
  if (!machineConfigId) return json({ error: 'Automat fehlt' }, 400);

  const roh = body.werte;
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) {
    return json({ error: 'Keine Werte uebergeben' }, 400);
  }

  const eintraege = Object.entries(roh as Record<string, unknown>);
  if (eintraege.length === 0) return json({ error: 'Keine Werte uebergeben' }, 400);
  if (eintraege.length > MAX_WERTE) {
    return json({ error: `Zu viele Werte auf einmal (hoechstens ${MAX_WERTE})` }, 400);
  }

  const werte: Record<string, number> = {};
  const abgelehnt: Record<string, string> = {};

  for (const [schluessel, wert] of eintraege) {
    const grenzen = GRENZEN[schluessel];
    if (!grenzen) {
      abgelehnt[schluessel] = 'darf nicht aus der Ferne geaendert werden';
      continue;
    }
    const zahl = typeof wert === 'number' ? wert : Number(wert);
    if (!Number.isFinite(zahl)) {
      abgelehnt[schluessel] = 'keine Zahl';
      continue;
    }
    const [klein, gross] = grenzen;
    if (zahl < klein || zahl > gross) {
      abgelehnt[schluessel] = `ausserhalb von ${klein} bis ${gross}`;
      continue;
    }
    werte[schluessel] = zahl;
  }

  // Nichts halb Gueltiges durchlassen. Wer sechs Regler schiebt und einen
  // ungueltigen dabei hat, soll das erfahren - nicht spaeter raten muessen,
  // warum ein Wert nicht angekommen ist.
  if (Object.keys(abgelehnt).length > 0) {
    return json({ error: 'Einzelne Werte sind nicht zulaessig', data: { abgelehnt } }, 400);
  }

  const { data: machine, error: ladeFehler } = await supabaseService
    .from('liftpic_machine_configs')
    .select('id, park_id, machine_id, is_active, settings')
    .eq('id', machineConfigId)
    .maybeSingle();

  if (ladeFehler) return json({ error: ladeFehler.message }, 400);
  if (!machine) return json({ error: 'Automat nicht gefunden' }, 404);
  if (machine.park_id !== auth.parkId) {
    return json({ error: 'Dieser Automat gehoert nicht zu deinem Park' }, 403);
  }
  if (machine.is_active === false) {
    return json({ error: 'Dieser Automat ist derzeit deaktiviert' }, 409);
  }

  const settings = (machine.settings ?? {}) as Record<string, unknown>;
  const auftrag = {
    id: crypto.randomUUID(),
    werte,
    neustart: body.neustart !== false,
    requested_at: new Date().toISOString(),
    requested_by: auth.userId,
  };

  const { error } = await supabaseService
    .from('liftpic_machine_configs')
    .update({ settings: { ...settings, kamera_auftrag: auftrag } })
    .eq('id', machine.id as string);

  if (error) {
    return json({ error: `Auftrag konnte nicht gespeichert werden: ${error.message}` }, 400);
  }

  return json({ ok: true, data: { kamera_auftrag: auftrag } });
});
