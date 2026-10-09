import { supabase } from './supabase';

// Ablage im Bucket `overlays` (Operator-Projekt), neben den gespeicherten
// Overlays unter `<park_id>/<uuid>.png`:
//   <park_id>/bibliothek/<uuid>.<ext>   eigene Bilder (Logo usw.) fürs Overlay-Studio
//   <park_id>/aktuell/<machine>__<slot>__<zeit>.<ext>
//       "aktueller Stand" am Automaten: nur zum Anzeigen hinterlegt, wird nicht
//       an den Automaten gesendet (kein Neustart). Das neueste Bild je Automat
//       und Platz gilt.
// Keine eigene Tabelle - die Ordner werden direkt aufgelistet.

const BUCKET = 'overlays';
const SIGN_SECONDS = 3600;

export type StoredImage = { path: string; name: string; url: string; createdAt: string | null };

function extensionOf(file: File) {
  const fromName = file.name.toLowerCase().split('.').pop();
  if (fromName && /^(png|jpe?g|webp|gif|svg)$/.test(fromName)) return fromName;
  return file.type.split('/')[1] || 'png';
}

async function signAll(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export async function signPath(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_SECONDS);
  return data?.signedUrl ?? null;
}

async function listFolder(folder: string): Promise<StoredImage[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw new Error(error.message);
  const files = (data ?? []).filter((f) => f.id && f.name && !f.name.startsWith('.'));
  const paths = files.map((f) => `${folder}/${f.name}`);
  const urls = await signAll(paths);
  return files
    .map((f, i) => ({ path: paths[i], name: f.name, url: urls[paths[i]] ?? '', createdAt: f.created_at ?? null }))
    .filter((f) => f.url);
}

async function uploadTo(path: string, file: File) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/png',
  });
  if (error) throw new Error(error.message);
}

// --- Bibliothek ------------------------------------------------------------

export function listLibrary(parkId: string) {
  return listFolder(`${parkId}/bibliothek`);
}

export async function uploadToLibrary(parkId: string, file: File): Promise<StoredImage> {
  const path = `${parkId}/bibliothek/${crypto.randomUUID()}.${extensionOf(file)}`;
  await uploadTo(path, file);
  return { path, name: file.name, url: (await signPath(path)) ?? '', createdAt: new Date().toISOString() };
}

export async function removeStored(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

// --- Aktueller Stand am Automaten -----------------------------------------

const safe = (value: string) => value.replace(/[^a-zA-Z0-9-]+/g, '-');

export type CurrentRef = StoredImage & { machineId: string; slot: string };

/** Neuestes hinterlegtes Bild je `<machine_id>__<slot>`. */
export async function listCurrentRefs(parkId: string): Promise<Record<string, CurrentRef>> {
  const items = await listFolder(`${parkId}/aktuell`);
  const out: Record<string, CurrentRef> = {};
  for (const item of items) {
    const [machine, slot] = item.name.split('__');
    if (!machine || !slot) continue;
    const key = `${machine}__${slot}`;
    if (!out[key]) out[key] = { ...item, machineId: machine, slot };
  }
  return out;
}

export function currentRefKey(machineId: string, slot: string) {
  return `${safe(machineId)}__${safe(slot)}`;
}

export async function uploadCurrentRef(parkId: string, machineId: string, slot: string, file: File) {
  const path = `${parkId}/aktuell/${currentRefKey(machineId, slot)}__${Date.now()}.${extensionOf(file)}`;
  await uploadTo(path, file);
}
