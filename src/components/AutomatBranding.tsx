import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Monitor, Image as ImageIcon, RotateCw, Moon, Trash2 } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
// Die Automaten-Dateien liegen im geteilten Produktionsprojekt, nicht im
// Operator-Projekt dieses Dashboards. Die Edge Function
// `operator-liftpic-assets` ist dort deployed und prueft unseren
// Operator-Token selbst (verify_jwt = false, siehe supabase/config.toml).
import { supabase, externalSupabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../lib/supabase';

const FUNCTION_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-assets`;

type CustomerSlot = {
  id: string;
  label: string;
  description: string;
  tip: string;
};

// Reine Anzeige. Der verbindliche Zielpfad auf dem Automaten kommt aus der
// Whitelist in der Edge Function - der Browser bestimmt ihn bewusst nicht.
const CUSTOMER_SLOTS: CustomerSlot[] = [
  {
    id: 'viewer_overlay_png',
    label: 'Foto-Overlay',
    description: 'Rahmen oder Wasserzeichen, das auf dem verkauften Foto liegt.',
    tip: 'Am besten PNG mit transparentem Hintergrund, Seitenverhaeltnis 4:3 (z. B. 2362 x 1772 px).',
  },
  {
    id: 'viewer_main_logo',
    label: 'Automat-Logo',
    description: 'Logo auf dem Verkaufsbildschirm des Automaten.',
    tip: 'PNG mit transparentem Hintergrund.',
  },
  {
    id: 'viewer_background',
    label: 'Hintergrund',
    description: 'Hintergrundbild des Verkaufsbildschirms.',
    tip: 'Querformat, etwa 2100 x 1200 px.',
  },
];

type PendingRestart = {
  id?: string;
  mode?: 'now' | 'tonight';
  requested_at?: string;
};

type MachineConfig = {
  id: string;
  park_id: string;
  machine_id: string;
  machine_label: string | null;
  camera_code: string;
  last_seen_at: string | null;
  pending_restart?: PendingRestart | null;
  last_restart_at?: string | null;
};

type GalleryOverlay = {
  id: string;
  bucket: string;
  path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  preview_url: string | null;
};

type SourceMode = 'gallery' | 'upload';

type AssetDeployment = {
  id: string;
  machine_id: string | null;
  slot: string;
  label: string | null;
  bucket: string | null;
  storage_path: string | null;
  file_size: number | null;
  updated_at: string | null;
  created_at: string | null;
  preview_url?: string | null;
};

function formatBytes(size: number | null) {
  if (!size) return null;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function minutesSince(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : (Date.now() - date.getTime()) / 60_000;
}

function basename(path: string) {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

async function operatorHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
  };
}

export default function AutomatBranding() {
  const { parkId } = usePark();
  const [machines, setMachines] = useState<MachineConfig[]>([]);
  const [assets, setAssets] = useState<AssetDeployment[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<string>(CUSTOMER_SLOTS[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>('gallery');
  const [gallery, setGallery] = useState<GalleryOverlay[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deletingGalleryId, setDeletingGalleryId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSlot = useMemo(
    () => CUSTOMER_SLOTS.find((slot) => slot.id === selectedSlotId) || CUSTOMER_SLOTS[0],
    [selectedSlotId],
  );

  const selectedMachine = useMemo(
    () => machines.find((machine) => machine.id === selectedMachineId) || null,
    [machines, selectedMachineId],
  );

  const selectedGalleryOverlay = useMemo(
    () => gallery.find((item) => item.id === selectedGalleryId) || null,
    [gallery, selectedGalleryId],
  );

  // Was tatsaechlich gesendet wird: entweder die frisch gewaehlte Datei oder
  // das im Overlay-Builder gespeicherte Bild aus der Galerie.
  const hasSelection = sourceMode === 'upload' ? Boolean(file) : Boolean(selectedGalleryOverlay);

  useEffect(() => {
    void load();
  }, [parkId]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setDimensions(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const img = new Image();
    img.onload = () => setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setDimensions(null);
    img.src = objectUrl;

    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function load() {
    if (!parkId) {
      setMachines([]);
      setAssets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotDeployed(false);

    const headers = await operatorHeaders();
    if (!headers) {
      setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${FUNCTION_URL}?park_id=${encodeURIComponent(parkId)}`, { headers });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 404) {
          setNotDeployed(true);
        } else {
          const detail = body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
          setError(`Die Automaten konnten nicht geladen werden (${detail}).`);
        }
        setLoading(false);
        return;
      }

      const loadedMachines = (body?.data?.machines || []) as MachineConfig[];
      setMachines(loadedMachines);
      setSelectedMachineId((current) =>
        current && loadedMachines.some((m) => m.id === current) ? current : loadedMachines[0]?.id || '',
      );

      const loadedAssets = (body?.data?.assets || []) as AssetDeployment[];
      // Das aktuell hinterlegte Bild liegt im GETEILTEN Projekt (siehe Kommentar
      // oben), daher `externalSupabase` statt des Operator-Clients `supabase`.
      // Der Bucket ist public - getPublicUrl statt createSignedUrl, das braucht
      // keine Storage-Berechtigung fuer den anonymen Client und laeuft nie ab.
      const assetsWithPreviews = loadedAssets.map((asset) => {
        if (!asset.bucket || !asset.storage_path) return asset;
        const { data } = externalSupabase.storage.from(asset.bucket).getPublicUrl(asset.storage_path);
        return { ...asset, preview_url: data?.publicUrl || null };
      });
      setAssets(assetsWithPreviews);
    } catch {
      setNotDeployed(true);
    }

    await loadGallery();
    setLoading(false);
  }

  /** Die im Overlay-Builder gespeicherten Overlays dieses Parks. */
  async function loadGallery() {
    if (!parkId) {
      setGallery([]);
      return;
    }

    const { data, error: galleryError } = await supabase
      .from('overlay_assets')
      .select('id, bucket, path, mime_type, width, height')
      .eq('park_id', parkId)
      .order('created_at', { ascending: false });

    if (galleryError || !data) {
      setGallery([]);
      return;
    }

    const withPreviews = await Promise.all(
      data.map(async (asset) => {
        const { data: signed } = await supabase.storage
          .from(asset.bucket)
          .createSignedUrl(asset.path, 3600);
        return { ...asset, preview_url: signed?.signedUrl || null } as GalleryOverlay;
      }),
    );

    setGallery(withPreviews);
    setSelectedGalleryId((current) =>
      current && withPreviews.some((item) => item.id === current) ? current : withPreviews[0]?.id || null,
    );
  }

  /** Ungenutztes Overlay endgueltig entfernen - inklusive Datei in der Ablage
   *  und eventuell noch daran haengenden Kampagnen-Ebenen. */
  async function handleDeleteGalleryOverlay(overlay: GalleryOverlay, event: React.MouseEvent) {
    event.stopPropagation();
    setDeletingGalleryId(overlay.id);
    setError(null);

    await supabase.from('overlay_campaign_layers').delete().eq('asset_id', overlay.id);

    const { error: assetError } = await supabase.from('overlay_assets').delete().eq('id', overlay.id);
    if (assetError) {
      setError(assetError.message);
      setDeletingGalleryId(null);
      return;
    }

    await supabase.storage.from(overlay.bucket).remove([overlay.path]);
    await loadGallery();
    setDeletingGalleryId(null);
  }

  /** Holt das ausgewaehlte Galerie-Overlay als echte Datei zum Hochladen.
   *  Direkter Download statt Umweg ueber eine signierte URL: ein Fehler ist
   *  hier eindeutig zuzuordnen, und es gibt keine ablaufenden Links. */
  async function fileFromGallery(overlay: GalleryOverlay): Promise<File> {
    const { data, error: downloadError } = await supabase.storage
      .from(overlay.bucket)
      .download(overlay.path);

    if (downloadError || !data) {
      throw new Error(
        `Das gespeicherte Overlay konnte nicht aus der Ablage geladen werden (${overlay.bucket}/${basename(overlay.path)}: ${downloadError?.message || 'unbekannter Fehler'}).`,
      );
    }

    const type = overlay.mime_type || data.type || 'image/png';
    return new File([data], basename(overlay.path), { type });
  }

  async function handleUpload() {
    if (!hasSelection || !selectedMachine || !parkId) return;

    setSaving(true);
    setError(null);
    setStatus(null);

    const headers = await operatorHeaders();
    if (!headers) {
      setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
      setSaving(false);
      return;
    }

    let outgoing: File;
    try {
      if (sourceMode === 'gallery') {
        if (!selectedGalleryOverlay) throw new Error('Bitte waehle ein gespeichertes Overlay aus.');
        outgoing = await fileFromGallery(selectedGalleryOverlay);
      } else {
        if (!file) throw new Error('Bitte waehle eine Datei aus.');
        outgoing = file;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Bild konnte nicht vorbereitet werden.');
      setSaving(false);
      return;
    }

    const formData = new FormData();
    formData.append('park_id', parkId);
    formData.append('machine_config_id', selectedMachine.id);
    formData.append('slot', selectedSlot.id);
    formData.append('file', outgoing);

    try {
      const res = await fetch(FUNCTION_URL, { method: 'POST', headers, body: formData });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
        setError(`Der Server hat die Uebertragung abgelehnt: ${detail}`);
        setSaving(false);
        return;
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatus(
        `"${selectedSlot.label}" wurde an ${selectedMachine.machine_label || selectedMachine.machine_id} uebergeben. Damit es sichtbar wird, jetzt noch das Verkaufsprogramm neu starten.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Bild konnte nicht uebertragen werden.');
    }

    setSaving(false);
  }

  /** Neustart des Verkaufsprogramms beauftragen bzw. einen Auftrag zuruecknehmen.
   *  Der Automat holt den Auftrag beim naechsten Abgleich ab; `tonight` wartet
   *  dort bis zur Ruhezeit, damit kein laufender Verkauf unterbrochen wird. */
  async function requestRestart(mode: 'now' | 'tonight' | 'cancel') {
    if (!selectedMachine || !parkId) return;
    if (mode === 'now' && !confirm(
      'Das Verkaufsprogramm am Automaten wird sofort beendet und neu gestartet.\n\n' +
      'Waehrend des Neustarts (etwa 15 Sekunden) kann kein Foto verkauft werden. ' +
      'Nur ausfuehren, wenn gerade niemand am Automaten steht.\n\nFortfahren?'
    )) return;

    setRestarting(true);
    setError(null);
    setStatus(null);

    const headers = await operatorHeaders();
    if (!headers) {
      setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
      setRestarting(false);
      return;
    }

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          park_id: parkId,
          machine_config_id: selectedMachine.id,
          mode,
        }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = body && typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
        setError(`Auftrag konnte nicht gespeichert werden: ${detail}`);
      } else if (mode === 'cancel') {
        setStatus('Der geplante Neustart wurde zurueckgenommen.');
      } else {
        setStatus(
          mode === 'now'
            ? 'Neustart beauftragt. Der Automat fuehrt ihn innerhalb der naechsten Minute aus.'
            : 'Neustart fuer heute Nacht vorgemerkt. Der Automat fuehrt ihn in der Ruhezeit aus.',
        );
        // Erst jetzt ist der volle Ablauf (Bild senden -> live schalten)
        // abgeschlossen - vorher wuerde die Ansicht das alte Bild zeigen.
        setIsEditing(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auftrag fehlgeschlagen.');
    }

    setRestarting(false);
  }

  const assetsForMachine = useMemo(() => {
    if (!selectedMachine) return [];
    return assets.filter((asset) => asset.machine_id === selectedMachine.machine_id);
  }, [assets, selectedMachine]);

  const onlineMinutes = minutesSince(selectedMachine?.last_seen_at || null);
  const isOnline = onlineMinutes !== null && onlineMinutes < 5;

  function currentAssetForSlot(slotId: string) {
    return assetsForMachine.find((item) => item.slot === slotId) || null;
  }

  function slotCaption(slotId: string) {
    const asset = currentAssetForSlot(slotId);
    if (!asset) return 'Noch nichts hochgeladen';
    const when = formatWhen(asset.updated_at || asset.created_at);
    return when ? `Zuletzt geaendert: ${when}` : 'Aktualisiert';
  }

  const currentAsset = currentAssetForSlot(selectedSlotId);

  return (
    <GlassCard className="p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h3 className="text-base font-semibold text-slate-800">Overlays aendern</h3>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {machines.length > 1 && (
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="glass-input text-sm"
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.machine_label || machine.machine_id}
                </option>
              ))}
            </select>
          )}
          {selectedMachine && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              {machines.length === 1 && `${selectedMachine.machine_label || selectedMachine.machine_id} · `}
              {isOnline
                ? 'verbunden'
                : onlineMinutes === null
                  ? 'noch nie gesehen'
                  : `zuletzt vor ${Math.round(onlineMinutes)} Min.`}
            </span>
          )}
          <button onClick={() => void load()} className="glass-button-secondary shrink-0" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aktualisieren'}
          </button>
        </div>
      </div>

      {notDeployed && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Diese Funktion ist auf dem Server noch nicht freigeschaltet. Die Edge Function
            <code className="mx-1 rounded bg-amber-100 px-1">operator-liftpic-assets</code>
            muss einmalig deployed werden.
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-rose-50/80 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {!parkId && <p className="text-sm text-slate-500">Bitte waehle zuerst deinen Park aus.</p>}

      {parkId && !loading && !notDeployed && machines.length === 0 && (
        <p className="text-sm text-slate-500">Fuer deinen Park ist derzeit kein Automat eingerichtet.</p>
      )}

      {machines.length > 0 && (
        <div className="space-y-4">
          <div className="inline-flex rounded-xl bg-white/40 p-1">
            {CUSTOMER_SLOTS.map((slot) => {
              const active = slot.id === selectedSlotId;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => {
                    setSelectedSlotId(slot.id);
                    setIsEditing(false);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>

          {!isEditing ? (
            <div>
              <div className="flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl bg-[conic-gradient(#e5e7eb_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg)] bg-[length:10px_10px] sm:max-w-xs">
                {currentAsset?.preview_url ? (
                  <img
                    src={currentAsset.preview_url}
                    alt={selectedSlot.label}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-slate-300" />
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">{slotCaption(selectedSlotId)}</p>
              <button type="button" onClick={() => setIsEditing(true)} className="glass-button-primary mt-3">
                Aendern
              </button>
            </div>
          ) : (
            <div>
            <div className="mb-3 inline-flex rounded-xl bg-white/40 p-1">
              <button
                type="button"
                onClick={() => setSourceMode('gallery')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  sourceMode === 'gallery' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Meine Overlays ({gallery.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('upload')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  sourceMode === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Neue Datei
              </button>
            </div>

            {sourceMode === 'gallery' && (
              <>
                {gallery.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/50 bg-white/20 px-3 py-3 text-sm text-slate-500">
                    Du hast noch keine Overlays gespeichert. Baue dir unten im Overlay-Builder eines &ndash; es
                    erscheint dann direkt hier.
                  </p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {gallery.map((item) => {
                      const active = item.id === selectedGalleryId;
                      const isDeleting = deletingGalleryId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`w-36 shrink-0 rounded-2xl border p-2 transition ${
                            active
                              ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200'
                              : 'border-white/40 bg-white/40 hover:bg-white/60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedGalleryId(item.id)}
                            className="block w-full text-left"
                          >
                            <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-[conic-gradient(#e5e7eb_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg)] bg-[length:10px_10px]">
                              {item.preview_url ? (
                                <img src={item.preview_url} alt="" className="h-full w-full object-contain" />
                              ) : (
                                <ImageIcon className="h-4 w-4 text-slate-300" />
                              )}
                            </div>
                            <p className="mt-1.5 truncate text-xs font-medium text-slate-700">
                              {basename(item.path)}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {item.width && item.height ? `${item.width} x ${item.height}` : 'Groesse unbekannt'}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteGalleryOverlay(item, e)}
                            disabled={isDeleting}
                            className="mt-1 flex items-center gap-1 text-[11px] text-slate-400 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Loeschen
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {sourceMode === 'upload' && (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="glass-button-secondary w-full"
                  >
                    <Upload className="h-4 w-4" />
                    {file ? 'Anderes Bild waehlen' : 'Bild vom Rechner waehlen'}
                  </button>

                  {file && (
                    <div className="mt-2 rounded-xl bg-white/40 px-3 py-2 text-sm text-slate-600">
                      <p className="truncate font-medium text-slate-700">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {[formatBytes(file.size), dimensions ? `${dimensions.width} x ${dimensions.height} px` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-white/30 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-600">Vorschau</p>
                  <div className="flex h-32 items-center justify-center overflow-hidden rounded-xl bg-[conic-gradient(#e5e7eb_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg)] bg-[length:10px_10px]">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Vorschau" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-slate-300" />
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={saving}
                className="glass-button-secondary"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!hasSelection || !selectedMachine || saving}
                className="glass-button-primary"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? 'Wird uebertragen...' : 'Jetzt aendern'}
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-white/20 p-3">
              <p className="mb-2 text-xs font-medium text-slate-500">
                Danach live schalten &ndash; noetig, damit z. B. ein neuer Hintergrund erscheint
              </p>

              {selectedMachine?.pending_restart ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50/80 px-3 py-1.5">
                  <RotateCw className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
                  <span className="text-sm text-amber-800">
                    {selectedMachine.pending_restart.mode === 'tonight'
                      ? 'Neustart fuer heute Nacht vorgemerkt.'
                      : 'Neustart wird gleich ausgefuehrt.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void requestRestart('cancel')}
                    disabled={restarting}
                    className="text-sm font-medium text-amber-900 underline underline-offset-2"
                  >
                    zuruecknehmen
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void requestRestart('now')}
                    disabled={restarting || !selectedMachine}
                    className="glass-button-secondary"
                  >
                    {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                    Verkaufsprogramm jetzt neu starten
                  </button>
                  <button
                    type="button"
                    onClick={() => void requestRestart('tonight')}
                    disabled={restarting || !selectedMachine}
                    className="glass-button-secondary"
                  >
                    <Moon className="h-4 w-4" />
                    Heute Nacht
                  </button>
                </div>
              )}

              {selectedMachine?.last_restart_at && (
                <p className="mt-2 text-xs text-slate-400">
                  Zuletzt neu gestartet: {formatWhen(selectedMachine.last_restart_at)}.
                </p>
              )}
            </div>
          </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
