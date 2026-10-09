import { useI18n, translate as t, currentLocaleTag } from '../lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle, Monitor, Image as ImageIcon, RotateCw, Moon, Trash2, PencilRuler, History } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import { currentRefKey, listCurrentRefs, uploadCurrentRef, type CurrentRef } from '../lib/overlayLibrary';
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
    label: 'branding.slot.overlay',
    description: 'branding.slot.overlay_desc',
    tip: 'branding.slot.overlay_tip',
  },
  {
    id: 'viewer_main_logo',
    label: 'branding.slot.logo',
    description: 'branding.slot.logo_desc',
    tip: 'branding.slot.logo_tip',
  },
  {
    id: 'viewer_background',
    label: 'branding.slot.background',
    description: 'branding.slot.background_desc',
    tip: 'branding.slot.background_tip',
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
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(currentLocaleTag());
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

export default function AutomatBranding({ onOpenInEditor }: { onOpenInEditor?: (url: string) => void } = {}) {
  useI18n();
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
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const [refs, setRefs] = useState<Record<string, CurrentRef>>({});
  const [refSlot, setRefSlot] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState<string | null>(null);

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
      setError(t('camera.session_expired_relogin'));
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
          setError(t('branding.load_failed', { detail }));
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

    await Promise.all([loadGallery(), loadRefs()]);
    setLoading(false);
  }

  /** Hinterlegte Bilder "so ist es gerade am Automaten" (nur Anzeige, siehe overlayLibrary.ts). */
  async function loadRefs() {
    if (!parkId) {
      setRefs({});
      return;
    }
    try {
      setRefs(await listCurrentRefs(parkId));
    } catch {
      setRefs({});
    }
  }

  async function handleReferenceFile(fileToStore: File | undefined) {
    const slotId = refSlot;
    if (refInputRef.current) refInputRef.current.value = '';
    if (!fileToStore || !slotId || !selectedMachine || !parkId) return;
    setRefUploading(slotId);
    setError(null);
    setStatus(null);
    try {
      await uploadCurrentRef(parkId, selectedMachine.machine_id, slotId, fileToStore);
      await loadRefs();
      const slot = CUSTOMER_SLOTS.find((x) => x.id === slotId);
      setStatus(t('branding.reference_saved', { slot: slot ? t(slot.label) : slotId }));
    } catch (err) {
      setError(t('branding.reference_failed', { detail: err instanceof Error ? err.message : t('branding.unknown_error') }));
    }
    setRefUploading(null);
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
        t('branding.gallery_load_failed', { detail: `${overlay.bucket}/${basename(overlay.path)}: ${downloadError?.message || t('branding.unknown_error')}` }),
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
      setError(t('camera.session_expired_relogin'));
      setSaving(false);
      return;
    }

    let outgoing: File;
    try {
      if (sourceMode === 'gallery') {
        if (!selectedGalleryOverlay) throw new Error(t('branding.pick_saved'));
        outgoing = await fileFromGallery(selectedGalleryOverlay);
      } else {
        if (!file) throw new Error(t('branding.pick_file'));
        outgoing = file;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('branding.prepare_failed'));
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
        setError(t('branding.server_rejected', { detail }));
        setSaving(false);
        return;
      }

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setStatus(
        t('branding.handed_over', { slot: t(selectedSlot.label), machine: selectedMachine.machine_label || selectedMachine.machine_id }),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('branding.transfer_failed'));
    }

    setSaving(false);
  }

  /** Neustart des Verkaufsprogramms beauftragen bzw. einen Auftrag zuruecknehmen.
   *  Der Automat holt den Auftrag beim naechsten Abgleich ab; `tonight` wartet
   *  dort bis zur Ruhezeit, damit kein laufender Verkauf unterbrochen wird. */
  async function requestRestart(mode: 'now' | 'tonight' | 'cancel') {
    if (!selectedMachine || !parkId) return;
    if (mode === 'now' && !confirm(t('branding.confirm_restart'))) return;

    setRestarting(true);
    setError(null);
    setStatus(null);

    const headers = await operatorHeaders();
    if (!headers) {
      setError(t('camera.session_expired_relogin'));
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
        setError(t('branding.job_not_saved', { detail }));
      } else if (mode === 'cancel') {
        setStatus(t('health.restart_cancelled'));
      } else {
        setStatus(
          mode === 'now'
            ? t('branding.restart_now_done')
            : t('branding.restart_tonight_done'),
        );
        // Erst jetzt ist der volle Ablauf (Bild senden -> live schalten)
        // abgeschlossen - vorher wuerde die Ansicht das alte Bild zeigen.
        setIsEditing(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('camera.job_failed'));
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

  /** Was der Platz gerade zeigt: das über das Dashboard gesendete Bild oder ein
   *  hinterlegtes Bild vom aktuellen Stand - das neuere von beiden. */
  function displayFor(slotId: string): { url: string; kind: 'sent' | 'reference'; when: string | null } | null {
    const sent = currentAssetForSlot(slotId);
    const ref = selectedMachine ? refs[currentRefKey(selectedMachine.machine_id, slotId)] : undefined;
    const sentWhen = sent ? sent.updated_at || sent.created_at : null;
    const sentEntry = sent?.preview_url ? { url: sent.preview_url, kind: 'sent' as const, when: sentWhen } : null;
    const refEntry = ref ? { url: ref.url, kind: 'reference' as const, when: ref.createdAt } : null;
    if (sentEntry && refEntry) {
      return new Date(refEntry.when ?? 0).getTime() > new Date(sentEntry.when ?? 0).getTime() ? refEntry : sentEntry;
    }
    return sentEntry ?? refEntry;
  }

  const checker = 'repeating-conic-gradient(#e5e9f0 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('branding.title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('branding.subtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {machines.length > 1 && (
            <select
              value={selectedMachineId}
              onChange={(e) => {
                setSelectedMachineId(e.target.value);
                setIsEditing(false);
              }}
              className="glass-input w-auto py-1.5 text-sm"
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
                isOnline ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              {machines.length === 1 && `${selectedMachine.machine_label || selectedMachine.machine_id} · `}
              {isOnline
                ? t('health.connected')
                : onlineMinutes === null
                  ? t('branding.never_seen')
                  : t('branding.last_seen', { n: Math.round(onlineMinutes) })}
            </span>
          )}
          <button onClick={() => void load()} className="glass-button-secondary shrink-0 py-1.5" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('health.refresh')}
          </button>
        </div>
      </div>

      {notDeployed && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('branding.not_deployed', { fn: 'operator-liftpic-assets' })}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {!parkId && <p className="text-sm text-slate-500">{t('branding.pick_park')}</p>}

      {parkId && !loading && !notDeployed && machines.length === 0 && (
        <p className="text-sm text-slate-500">{t('branding.no_machine')}</p>
      )}

      {machines.length > 0 && (
        <div className="space-y-5">
          <input
            ref={refInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void handleReferenceFile(e.target.files?.[0])}
          />

          <div className="grid gap-4 md:grid-cols-3">
            {CUSTOMER_SLOTS.map((slot) => {
              const shown = displayFor(slot.id);
              const active = isEditing && slot.id === selectedSlotId;
              const when = formatWhen(shown?.when ?? null);
              return (
                <div
                  key={slot.id}
                  className={`flex flex-col overflow-hidden rounded-xl border bg-white transition ${
                    active ? 'border-brand-600 ring-1 ring-brand-600' : 'border-[color:var(--line)]'
                  }`}
                >
                  <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: checker }}>
                    {shown ? (
                      <img src={shown.url} alt={t(slot.label)} className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-300" />
                    )}
                    {shown && (
                      <span
                        className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          shown.kind === 'sent' ? 'bg-emerald-600 text-white' : 'bg-white/95 text-[color:var(--ink-2)] ring-1 ring-black/10'
                        }`}
                      >
                        {shown.kind === 'sent' ? t('branding.badge_sent') : t('branding.badge_reference')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="text-sm font-semibold text-[color:var(--ink)]">{t(slot.label)}</p>
                    <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">{t(slot.description)}</p>
                    <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">
                      {shown ? (when ? t('branding.last_changed', { time: when }) : t('branding.updated')) : t('branding.nothing_uploaded')}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setIsEditing(true);
                        }}
                        className="glass-button-primary px-3.5 py-1.5 text-xs"
                      >
                        {t('branding.change')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRefSlot(slot.id);
                          refInputRef.current?.click();
                        }}
                        disabled={refUploading !== null}
                        title={t('branding.reference_hint')}
                        className="glass-button-secondary px-3 py-1.5 text-xs"
                      >
                        {refUploading === slot.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
                        {t('branding.reference_upload')}
                      </button>
                      {shown && onOpenInEditor && (
                        <button
                          type="button"
                          onClick={() => onOpenInEditor(shown.url)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                        >
                          <PencilRuler className="h-3.5 w-3.5" />
                          {t('branding.open_in_editor')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[color:var(--ink-3)]">{t('branding.reference_hint')}</p>

          {isEditing && (
            <div className="rounded-xl border border-[color:var(--line)] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-[color:var(--ink)]">
                  {t('branding.change_slot', { slot: t(selectedSlot.label) })}
                </p>
                <p className="text-xs text-[color:var(--ink-3)]">{t(selectedSlot.tip)}</p>
              </div>
              <div className="mb-3 inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5">
                {(['gallery', 'upload'] as SourceMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSourceMode(mode)}
                    className={`rounded px-3 py-1 text-sm transition ${
                      sourceMode === mode ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
                    }`}
                  >
                    {mode === 'gallery' ? t('branding.my_overlays', { count: gallery.length }) : t('branding.new_file')}
                  </button>
                ))}
              </div>

              {sourceMode === 'gallery' &&
                (gallery.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[color:var(--line-strong)] px-3 py-3 text-sm text-[color:var(--ink-3)]">
                    {t('branding.no_saved')}
                  </p>
                ) : (
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {gallery.map((item) => {
                      const active = item.id === selectedGalleryId;
                      const isDeleting = deletingGalleryId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`w-36 shrink-0 rounded-lg border p-2 transition ${
                            active ? 'border-brand-600 ring-1 ring-brand-600' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
                          }`}
                        >
                          <button type="button" onClick={() => setSelectedGalleryId(item.id)} className="block w-full text-left">
                            <div className="flex h-20 items-center justify-center overflow-hidden rounded-md" style={{ background: checker }}>
                              {item.preview_url ? (
                                <img src={item.preview_url} alt="" className="h-full w-full object-contain" />
                              ) : (
                                <ImageIcon className="h-4 w-4 text-slate-300" />
                              )}
                            </div>
                            <p className="mt-1.5 truncate text-xs font-medium text-[color:var(--ink-2)]">{basename(item.path)}</p>
                            <p className="text-[11px] text-[color:var(--ink-3)]">
                              {item.width && item.height ? `${item.width} × ${item.height}` : t('branding.size_unknown')}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => void handleDeleteGalleryOverlay(item, e)}
                            disabled={isDeleting}
                            className="mt-1 flex items-center gap-1 text-[11px] text-[color:var(--ink-3)] transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            {t('branding.delete')}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}

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
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="glass-button-secondary w-full">
                      <Upload className="h-4 w-4" />
                      {file ? t('branding.other_image') : t('branding.pick_image')}
                    </button>
                    {file && (
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-[color:var(--ink-2)]">
                        <p className="truncate font-medium text-[color:var(--ink)]">{file.name}</p>
                        <p className="text-xs text-[color:var(--ink-3)]">
                          {[formatBytes(file.size), dimensions ? `${dimensions.width} × ${dimensions.height} px` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-[color:var(--ink-3)]">{t('branding.preview')}</p>
                    <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg" style={{ background: checker }}>
                      {previewUrl ? (
                        <img src={previewUrl} alt={t('branding.preview')} className="h-full w-full object-contain" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setIsEditing(false)} disabled={saving} className="glass-button-secondary">
                  {t('branding.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={!hasSelection || !selectedMachine || saving}
                  className="glass-button-primary"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {saving ? t('branding.transferring') : t('branding.change_now')}
                </button>
              </div>

              <div className="mt-4 border-t border-[color:var(--line)] pt-4">
                <p className="mb-2 text-xs font-medium text-[color:var(--ink-3)]">{t('branding.go_live_hint')}</p>
                {selectedMachine?.pending_restart ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5">
                    <RotateCw className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
                    <span className="text-sm text-amber-800">
                      {selectedMachine.pending_restart.mode === 'tonight' ? t('branding.restart_tonight_pending') : t('branding.restart_soon')}
                    </span>
                    <button
                      type="button"
                      onClick={() => void requestRestart('cancel')}
                      disabled={restarting}
                      className="text-sm font-medium text-amber-900 underline underline-offset-2"
                    >
                      {t('branding.undo')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void requestRestart('now')} disabled={restarting || !selectedMachine} className="glass-button-secondary">
                      {restarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                      {t('branding.restart_sales_now')}
                    </button>
                    <button type="button" onClick={() => void requestRestart('tonight')} disabled={restarting || !selectedMachine} className="glass-button-secondary">
                      <Moon className="h-4 w-4" />
                      {t('branding.tonight')}
                    </button>
                  </div>
                )}
                {selectedMachine?.last_restart_at && (
                  <p className="mt-2 text-xs text-[color:var(--ink-3)]">
                    {t('branding.last_restart', { time: formatWhen(selectedMachine.last_restart_at) ?? '' })}
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
