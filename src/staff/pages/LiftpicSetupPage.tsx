import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Edit3, Eye, EyeOff, Monitor, Power, RotateCcw } from 'lucide-react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';
import type { Attraction, LiftpicAssetDeployment, LiftpicMachineConfig, LiftpicMachineMode, Park } from '../lib/types';

type SetupResponse = {
  parks: Park[];
  attractions: Attraction[];
  configs: LiftpicMachineConfig[];
};

type MachineForm = {
  park_id: string;
  attraction_id: string;
  machine_id: string;
  machine_label: string;
  camera_code: string;
  camera_label: string;
  legacy_customer_code: string;
  mode: LiftpicMachineMode;
  qr_enabled: boolean;
  speed_enabled: boolean;
  count_rides_enabled: boolean;
  upload_all_photos: boolean;
  shadow_mode: boolean;
  raw_dir: string;
  processed_dir: string;
  qrcode_dir: string;
  webout_dir: string;
  statistic_file: string;
  print_count_file: string;
  paper_warn_remaining: number;
  paper_capacity: number;
  is_active: boolean;
};

type AssetForm = {
  machine_config_id: string;
  slot: string;
  label: string;
  target_path: string;
  restart_hint: string;
  notes: string;
};

const defaultForm: MachineForm = {
  park_id: '',
  attraction_id: '',
  machine_id: '',
  machine_label: '',
  camera_code: 'cam1',
  camera_label: 'Kamera 1',
  legacy_customer_code: '0000',
  mode: 'sold_only',
  qr_enabled: true,
  speed_enabled: true,
  count_rides_enabled: true,
  upload_all_photos: false,
  shadow_mode: true,
  raw_dir: 'C:\\liftpic\\fotos',
  processed_dir: 'C:\\liftpic\\fotos\\out',
  qrcode_dir: 'C:\\liftpic\\fotos\\qrcode',
  webout_dir: 'C:\\liftpic\\fotos\\webout',
  statistic_file: 'C:\\liftpic\\samuel_neu\\Statistic.txt',
  print_count_file: 'C:\\liftpic\\samuel_neu\\PrintCount.txt',
  paper_warn_remaining: 30,
  paper_capacity: 0,
  is_active: true,
};

const modeLabels: Record<LiftpicMachineMode, string> = {
  sold_only: 'Nur verkauft',
  all_photos: 'Alle Fotos',
  count_only: 'Nur Fahrten',
};

const assetSlots = [
  {
    id: 'viewer_main_logo',
    label: 'Automat Hauptlogo',
    target: 'C:\\liftpic\\samuel_neu\\diabolos.png',
    hint: 'restart_viewer',
  },
  {
    id: 'viewer_default_photo',
    label: 'Automat Start-/Platzhalterbild',
    target: 'C:\\liftpic\\samuel_neu\\preview_logo3.png',
    hint: 'restart_viewer',
  },
  {
    id: 'viewer_preview_logo',
    label: 'Automat Preview-Logo',
    target: 'C:\\liftpic\\samuel_neu\\diabolos.png',
    hint: 'restart_viewer',
  },
  {
    id: 'viewer_print_overlay',
    label: 'Print-Overlay Bild',
    target: 'C:\\liftpic\\samuel_neu\\image1.png',
    hint: 'restart_viewer',
  },
  {
    id: 'viewer_background',
    label: 'Automat Hintergrund',
    target: 'C:\\liftpic\\samuel_neu\\hintergrund.png',
    hint: 'restart_viewer',
  },
  {
    id: 'viewer_overlay_png',
    label: 'Overlay PNG alt',
    target: 'C:\\liftpic\\samuel_neu\\overlay.png',
    hint: 'restart_viewer',
  },
  {
    id: 'print_logo_legacy',
    label: 'Print Vorlage Logo alt',
    target: 'C:\\liftpic\\imageloader\\Vorlage5.bmp',
    hint: 'restart_print',
  },
  {
    id: 'print_border_legacy',
    label: 'Print Rahmen alt',
    target: 'C:\\liftpic\\imageloader\\vorlage4.bmp',
    hint: 'restart_print',
  },
  {
    id: 'jpeg4web_logo',
    label: 'jpeg4web Logo alt',
    target: 'C:\\liftpic\\jpeg4web\\fiebich.png',
    hint: 'none',
  },
] as const;

const defaultAssetForm: AssetForm = {
  machine_config_id: '',
  slot: assetSlots[3].id,
  label: assetSlots[3].label,
  target_path: assetSlots[3].target,
  restart_hint: assetSlots[3].hint,
  notes: '',
};

const bootstrapInstallerUrl =
  'https://raw.githubusercontent.com/john123-05/testsoftware/main/scripts/install_liftpic_sync_bootstrap.ps1';

function slugifyValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatBytes(value: number | null) {
  if (!value) return '-';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function toForm(config: LiftpicMachineConfig): MachineForm {
  return {
    park_id: config.park_id,
    attraction_id: config.attraction_id || '',
    machine_id: config.machine_id,
    machine_label: config.machine_label,
    camera_code: config.camera_code,
    camera_label: config.camera_label,
    legacy_customer_code: config.legacy_customer_code,
    mode: config.mode,
    qr_enabled: config.qr_enabled,
    speed_enabled: config.speed_enabled,
    count_rides_enabled: config.count_rides_enabled,
    upload_all_photos: config.upload_all_photos,
    shadow_mode: config.shadow_mode,
    raw_dir: config.raw_dir,
    processed_dir: config.processed_dir,
    qrcode_dir: config.qrcode_dir,
    webout_dir: config.webout_dir,
    statistic_file: config.statistic_file,
    print_count_file: config.print_count_file,
    paper_warn_remaining: config.paper_warn_remaining,
    paper_capacity: config.paper_capacity ?? 0,
    is_active: config.is_active,
  };
}

export default function LiftpicSetupPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [configs, setConfigs] = useState<LiftpicMachineConfig[]>([]);
  const [assets, setAssets] = useState<LiftpicAssetDeployment[]>([]);
  const [form, setForm] = useState<MachineForm>(defaultForm);
  const [assetForm, setAssetForm] = useState<AssetForm>(defaultAssetForm);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetSaving, setAssetSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assetBusyId, setAssetBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copiedId, copy } = useCopyToClipboard();

  const parkNameById = useMemo(() => new Map(parks.map((park) => [park.id, park.name])), [parks]);
  const configById = useMemo(() => new Map(configs.map((config) => [config.id, config])), [configs]);
  const configLabelByMachine = useMemo(
    () => new Map(configs.map((config) => [`${config.machine_id}|${config.camera_code}`, `${config.machine_label} / ${config.camera_label}`])),
    [configs],
  );
  const slotLabelById = useMemo<Map<string, string>>(
    () => new Map(assetSlots.map((slot) => [slot.id, slot.label])),
    [],
  );
  const attractionNameById = useMemo(
    () => new Map(attractions.map((attraction) => [attraction.id, attraction.name])),
    [attractions],
  );
  const parkById = useMemo(() => new Map(parks.map((park) => [park.id, park])), [parks]);
  const attractionById = useMemo(() => new Map(attractions.map((attraction) => [attraction.id, attraction])), [attractions]);
  const filteredAttractions = useMemo(
    () => attractions.filter((attraction) => attraction.park_id === form.park_id),
    [attractions, form.park_id],
  );
  const selectedPark = form.park_id ? parkById.get(form.park_id) || null : null;
  const selectedAttraction = form.attraction_id ? attractionById.get(form.attraction_id) || null : null;
  const parkConfigCount = useMemo(
    () => configs.filter((config) => config.park_id === form.park_id).length,
    [configs, form.park_id],
  );
  const suggestedMachineLabel = selectedAttraction?.name
    ? `${selectedAttraction.name} PC`
    : selectedPark?.name
      ? `${selectedPark.name} PC`
      : 'Liftpic PC';
  const suggestedMachineId = `${selectedPark ? slugifyValue(selectedPark.slug || selectedPark.name) : 'liftpic'}-pc-${Math.max(1, parkConfigCount + (editingId ? 0 : 1))}`;
  const suggestedCameraIndex = Math.max(1, parkConfigCount + (editingId ? 0 : 1));
  const suggestedCameraLabel = selectedAttraction?.name || `Kamera ${suggestedCameraIndex}`;
  const suggestedCameraCode = `cam${suggestedCameraIndex}`;

  async function load() {
    setLoading(true);
    setError(null);
    const [res, assetRes] = await Promise.all([
      edgeFetch('/api/admin/liftpic-machines'),
      edgeFetch('/api/admin/liftpic-assets'),
    ]);
    const body = await res.json().catch(() => null);
    const assetBody = await assetRes.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Liftpic PC-Bereich konnte nicht geladen werden'));
      setLoading(false);
      return;
    }

    const data = (body?.data || {}) as SetupResponse;
    const nextConfigs = data.configs || [];
    setParks(data.parks || []);
    setAttractions(data.attractions || []);
    setConfigs(nextConfigs);
    if (assetRes.ok) {
      setAssets((assetBody?.data || []) as LiftpicAssetDeployment[]);
    } else {
      setAssets([]);
      setError(getApiErrorMessage(assetBody, 'Lokale Automaten-Dateien konnten noch nicht geladen werden'));
    }
    setForm((current) => ({
      ...current,
      park_id: current.park_id || data.parks?.[0]?.id || '',
    }));
    setAssetForm((current) => ({
      ...current,
      machine_config_id: current.machine_config_id || nextConfigs[0]?.id || '',
    }));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function patchForm(patch: Partial<MachineForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function setMode(mode: LiftpicMachineMode) {
    patchForm({
      mode,
      qr_enabled: mode === 'count_only' ? false : form.qr_enabled,
      upload_all_photos: mode === 'all_photos',
    });
  }

  function patchAssetForm(patch: Partial<AssetForm>) {
    setAssetForm((current) => ({ ...current, ...patch }));
  }

  function setAssetSlot(slotId: string) {
    const slot = assetSlots.find((item) => item.id === slotId);
    patchAssetForm({
      slot: slotId,
      label: slot?.label || assetForm.label,
      target_path: slot?.target || assetForm.target_path,
      restart_hint: slot?.hint || assetForm.restart_hint,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      ...defaultForm,
      park_id: form.park_id || parks[0]?.id || '',
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    setError(null);

    const machineLabel = form.machine_label.trim() || suggestedMachineLabel;
    const machineId = form.machine_id.trim().toLowerCase() || suggestedMachineId;
    const cameraLabel = form.camera_label.trim() || suggestedCameraLabel;
    const cameraCode = form.camera_code.trim().toLowerCase() || suggestedCameraCode;

    const payload = {
      ...form,
      id: editingId || undefined,
      machine_label: machineLabel,
      machine_id: machineId,
      camera_label: cameraLabel,
      camera_code: cameraCode,
      legacy_customer_code: form.legacy_customer_code.replace(/\D/g, '').slice(0, 4).padStart(4, '0'),
      attraction_id: form.attraction_id || null,
    };

    const res = await edgeFetch('/api/admin/liftpic-machines', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Liftpic PC konnte nicht gespeichert werden'));
      return;
    }

    setStatus(editingId ? 'Liftpic PC aktualisiert' : 'Liftpic PC angelegt');
    appendActivityEvent({
      title: editingId ? 'Liftpic PC aktualisiert' : 'Liftpic PC angelegt',
      details: machineLabel || machineId,
      level: 'success',
    });
    resetForm();
    await load();
  }

  async function rotatePairing(config: LiftpicMachineConfig) {
    setBusyId(config.id);
    setStatus(null);
    setError(null);

    const res = await edgeFetch('/api/admin/liftpic-machines', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config.id, action: 'new_pairing_code' }),
    });
    const body = await res.json().catch(() => null);
    setBusyId(null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Pairing-Code konnte nicht erneuert werden'));
      return;
    }

    setStatus('Neuer Pairing-Code erstellt');
    appendActivityEvent({
      title: 'Liftpic Pairing-Code erneuert',
      details: config.machine_label || config.machine_id,
      level: 'success',
    });
    await load();
  }

  async function toggleShadowMode(config: LiftpicMachineConfig) {
    if (config.mode === 'count_only') {
      setError('Bei "Nur Fahrten zaehlen" bleibt Shadow Mode automatisch an.');
      return;
    }

    const nextShadowMode = !config.shadow_mode;
    if (!nextShadowMode && !confirm(`"${config.machine_label || config.machine_id}" wirklich live schalten? Dann kann dieser PC echte Uploads ausfuehren.`)) {
      return;
    }

    setBusyId(config.id);
    setStatus(null);
    setError(null);

    const payload = {
      ...toForm(config),
      id: config.id,
      shadow_mode: nextShadowMode,
      attraction_id: config.attraction_id || null,
    };

    const res = await edgeFetch('/api/admin/liftpic-machines', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    setBusyId(null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Shadow Mode konnte nicht geaendert werden'));
      return;
    }

    setStatus(nextShadowMode ? 'Shadow Mode eingeschaltet' : 'Live-Modus eingeschaltet');
    appendActivityEvent({
      title: nextShadowMode ? 'Liftpic Shadow Mode eingeschaltet' : 'Liftpic Live-Modus eingeschaltet',
      details: config.machine_label || config.machine_id,
      level: nextShadowMode ? 'success' : 'warning',
    });
    await load();
  }

  async function disableConfig(config: LiftpicMachineConfig) {
    if (!confirm(`Liftpic PC "${config.machine_label || config.machine_id}" deaktivieren?`)) return;
    setBusyId(config.id);
    setStatus(null);
    setError(null);

    const res = await edgeFetch(`/api/admin/liftpic-machines?id=${encodeURIComponent(config.id)}`, {
      method: 'DELETE',
    });
    const body = await res.json().catch(() => null);
    setBusyId(null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Liftpic PC konnte nicht deaktiviert werden'));
      return;
    }

    setStatus('Liftpic PC deaktiviert');
    appendActivityEvent({
      title: 'Liftpic PC deaktiviert',
      details: config.machine_label || config.machine_id,
      level: 'warning',
    });
    await load();
  }

  async function submitAsset(e: FormEvent) {
    e.preventDefault();
    if (!assetFile) {
      setError('Bitte zuerst eine Datei auswaehlen');
      return;
    }

    setAssetSaving(true);
    setStatus(null);
    setError(null);

    const selectedConfig = configById.get(assetForm.machine_config_id);
    const formData = new FormData();
    formData.append('machine_config_id', assetForm.machine_config_id);
    if (selectedConfig) {
      formData.append('park_id', selectedConfig.park_id);
      formData.append('machine_id', selectedConfig.machine_id);
      formData.append('camera_code', selectedConfig.camera_code);
    }
    formData.append('slot', assetForm.slot);
    formData.append('label', assetForm.label);
    formData.append('target_path', assetForm.target_path);
    formData.append('restart_hint', assetForm.restart_hint);
    formData.append('notes', assetForm.notes);
    formData.append('file', assetFile);

    const res = await edgeFetch('/api/admin/liftpic-assets', {
      method: 'POST',
      body: formData,
    });
    const body = await res.json().catch(() => null);
    setAssetSaving(false);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Datei konnte nicht fuer den PC vorbereitet werden'));
      return;
    }

    setAssetFile(null);
    setStatus('Lokale Automaten-Datei vorbereitet');
    appendActivityEvent({
      title: 'Liftpic Datei vorbereitet',
      details: `${assetForm.label} -> ${selectedConfig?.machine_label || 'Liftpic PC'}`,
      level: 'success',
    });
    await load();
  }

  async function disableAsset(asset: LiftpicAssetDeployment) {
    if (!confirm(`Datei-Zuweisung "${asset.label || asset.slot}" deaktivieren?`)) return;

    setAssetBusyId(asset.id);
    setStatus(null);
    setError(null);

    const res = await edgeFetch(`/api/admin/liftpic-assets?id=${encodeURIComponent(asset.id)}`, {
      method: 'DELETE',
    });
    const body = await res.json().catch(() => null);
    setAssetBusyId(null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Datei-Zuweisung konnte nicht deaktiviert werden'));
      return;
    }

    setStatus('Datei-Zuweisung deaktiviert');
    await load();
  }

  async function downloadBootstrapInstaller() {
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(bootstrapInstallerUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'install_liftpic_sync_bootstrap.ps1';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Install-Datei heruntergeladen');
    } catch (err) {
      window.open(bootstrapInstallerUrl, '_blank', 'noopener,noreferrer');
      setError(`Download konnte nicht automatisch starten: ${err instanceof Error ? err.message : 'unbekannter Fehler'}`);
    }
  }

  function installCommand(config: LiftpicMachineConfig) {
    return `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\install_liftpic_sync_bootstrap.ps1" -PairingCode ${config.pairing_code}`;
  }

  if (loading) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="card">
          <p className="note">Liftpic PC-Bereich wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid setup-stack" style={{ gap: 16 }}>
      <div className="card setup-card">
        <div className="setup-section-head">
          <div>
            <h2>PC-Setup</h2>
          </div>
          <button type="button" className="setup-secondary-btn" onClick={() => void load()}>
            Aktualisieren
          </button>
        </div>
      </div>

      <div className="grid two setup-overview-grid">
        <div className="card setup-card">
          <h3>{editingId ? 'PC bearbeiten' : 'PC vorbereiten'}</h3>
          <form className="grid" onSubmit={submit}>
            <div className="row">
              <div>
                <label>Park</label>
                <select value={form.park_id} onChange={(e) => patchForm({ park_id: e.target.value, attraction_id: '' })} required>
                  {parks.map((park) => (
                    <option key={park.id} value={park.id}>{park.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Attraktion</label>
                <select value={form.attraction_id} onChange={(e) => patchForm({ attraction_id: e.target.value })}>
                  <option value="">Keine feste Attraktion</option>
                  {filteredAttractions.map((attraction) => (
                    <option key={attraction.id} value={attraction.id}>{attraction.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row">
              <div>
                <label>PC-Name</label>
                <input
                  value={form.machine_label}
                  onChange={(e) => patchForm({ machine_label: e.target.value })}
                  placeholder={suggestedMachineLabel}
                />
              </div>
            </div>

            <div>
              <label>Modus</label>
              <div className="liftpic-mode-grid">
                {(['sold_only', 'all_photos', 'count_only'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`liftpic-mode-option ${form.mode === mode ? 'active' : ''}`}
                    onClick={() => setMode(mode)}
                  >
                  <strong>{modeLabels[mode]}</strong>
                  </button>
                ))}
              </div>
            </div>

            <div className="liftpic-toggle-grid">
                <label className="liftpic-toggle-card">
                  <input type="checkbox" checked={form.qr_enabled} onChange={(e) => patchForm({ qr_enabled: e.target.checked })} />
                  <span>
                    <strong>QR-Verkauf</strong>
                  </span>
                </label>
              <label className="liftpic-toggle-card">
                <input type="checkbox" checked={form.speed_enabled} onChange={(e) => patchForm({ speed_enabled: e.target.checked })} />
                <span>
                  <strong>Speedmessung</strong>
                </span>
              </label>
              <label className="liftpic-toggle-card">
                <input
                  type="checkbox"
                  checked={form.count_rides_enabled}
                  onChange={(e) => patchForm({ count_rides_enabled: e.target.checked })}
                />
                <span>
                  <strong>Fahrten zaehlen</strong>
                </span>
              </label>
              <label className="liftpic-toggle-card">
                <input
                  type="checkbox"
                  checked={form.shadow_mode}
                  onChange={(e) => patchForm({ shadow_mode: e.target.checked })}
                />
                <span>
                  <strong>Shadow Mode</strong>
                </span>
              </label>
            </div>

            <div className="row">
              <div>
                <label>Papier-Kapazität (Bilder pro Rolle)</label>
                <input
                  type="number"
                  min={0}
                  value={form.paper_capacity}
                  onChange={(e) => patchForm({ paper_capacity: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label>Warnung wenn Rest ≤</label>
                <input
                  type="number"
                  min={0}
                  value={form.paper_warn_remaining}
                  onChange={(e) => patchForm({ paper_warn_remaining: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <details>
              <summary className="note">Technische Felder anzeigen</summary>
              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
                <div className="row">
                  <div>
                    <label>PC-Kennung intern</label>
                    <input
                      value={form.machine_id}
                      onChange={(e) => patchForm({ machine_id: e.target.value.trim().toLowerCase() })}
                      placeholder={suggestedMachineId}
                    />
                  </div>
                  <div>
                    <label>Kamera-Kennung intern</label>
                    <input
                      value={form.camera_code}
                      onChange={(e) => patchForm({ camera_code: e.target.value.trim().toLowerCase() })}
                      placeholder={suggestedCameraCode}
                    />
                  </div>
                </div>
                <div>
                  <label>Kamera-Name</label>
                  <input
                    value={form.camera_label}
                    onChange={(e) => patchForm({ camera_label: e.target.value })}
                    placeholder={suggestedCameraLabel}
                  />
                </div>
                <div>
                  <label>Alter Kundencode (nur Altbestand)</label>
                  <input
                    value={form.legacy_customer_code}
                    onChange={(e) => patchForm({ legacy_customer_code: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="0000"
                  />
                </div>
                <div>
                  <label>RAW Ordner</label>
                  <input value={form.raw_dir} onChange={(e) => patchForm({ raw_dir: e.target.value })} />
                </div>
                <div>
                  <label>Fertige Fotos</label>
                  <input value={form.processed_dir} onChange={(e) => patchForm({ processed_dir: e.target.value })} />
                </div>
                <div>
                  <label>QR-Verkauf</label>
                  <input value={form.qrcode_dir} onChange={(e) => patchForm({ qrcode_dir: e.target.value })} />
                </div>
                <div>
                  <label>Webout Kontrolle</label>
                  <input value={form.webout_dir} onChange={(e) => patchForm({ webout_dir: e.target.value })} />
                </div>
                <div>
                  <label>Verkaufsdatei</label>
                  <input value={form.statistic_file} onChange={(e) => patchForm({ statistic_file: e.target.value })} />
                </div>
                <div>
                  <label>Papierzaehler</label>
                  <input value={form.print_count_file} onChange={(e) => patchForm({ print_count_file: e.target.value })} />
                </div>
              </div>
            </details>

            <div className="setup-form-actions">
              <button type="submit" className="setup-primary-btn" disabled={saving || !parks.length}>
                {saving ? 'Speichert...' : editingId ? 'Aktualisieren' : 'PC vorbereiten'}
              </button>
              {editingId && (
                <button type="button" className="setup-secondary-btn" onClick={resetForm}>
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card setup-card">
          <div className="setup-section-head">
            <div>
              <h3>2. Installation</h3>
            </div>
            <button type="button" className="setup-secondary-btn" onClick={() => void downloadBootstrapInstaller()}>
              <Download size={16} />
              Install-Datei laden
            </button>
          </div>
          <div className="grid setup-mini-grid" style={{ gap: 10 }}>
            <div className="material-card setup-mini-card">
              <span className="setup-mini-index">1</span>
              <Download size={18} />
              <h4>Install-Datei laden</h4>
            </div>
            <div className="material-card setup-mini-card">
              <span className="setup-mini-index">2</span>
              <Monitor size={18} />
              <h4>Am Kunden-PC starten</h4>
            </div>
            <div className="material-card setup-mini-card">
              <span className="setup-mini-index">3</span>
              <Copy size={18} />
              <h4>Pairing-Code unten kopieren</h4>
            </div>
          </div>
          <p className="note" style={{ marginTop: 12 }}>
            Den passenden Kopplungs-Code holst du unten beim vorbereiteten PC.
          </p>
        </div>
      </div>

      <div className="card setup-card">
        <h3>Vorbereitete PCs</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>PC</th>
                <th>Park</th>
                <th>Kamera</th>
                <th>Modus</th>
                <th>Shadow</th>
                <th>Funktionen</th>
                <th>Pairing</th>
                <th>Zuletzt gesehen</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => (
                <tr key={config.id}>
                  <td>
                    <strong>{config.machine_label}</strong>
                    <div className="note">{config.machine_id}</div>
                  </td>
                  <td>{parkNameById.get(config.park_id) || config.park_id}</td>
                  <td>
                    {config.camera_label}
                    <div className="note">
                      {config.legacy_customer_code}
                      {config.attraction_id ? ` - ${attractionNameById.get(config.attraction_id) || config.attraction_id}` : ''}
                    </div>
                  </td>
                  <td>{modeLabels[config.mode]}</td>
                  <td>
                    <span className={`badge ${config.shadow_mode ? 'ok' : 'warn'}`}>
                      {config.shadow_mode ? 'Testmodus' : 'Live'}
                    </span>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className={config.shadow_mode ? 'setup-secondary-btn' : 'setup-danger-btn'}
                        onClick={() => void toggleShadowMode(config)}
                        disabled={busyId === config.id || config.mode === 'count_only'}
                        title={config.mode === 'count_only' ? 'Bei Nur Fahrten zaehlen bleibt Shadow automatisch an' : undefined}
                      >
                        {config.shadow_mode ? <EyeOff size={14} /> : <Eye size={14} />}
                        {config.shadow_mode ? 'Live schalten' : 'Shadow an'}
                      </button>
                    </div>
                    {config.mode === 'count_only' && (
                      <div className="note">Bei Nur Fahrten zaehlen immer an</div>
                    )}
                  </td>
                  <td>
                    <div className="note">
                      {[
                        config.qr_enabled ? 'QR' : null,
                        config.speed_enabled ? 'Speed' : null,
                        config.count_rides_enabled ? 'Fahrten' : null,
                        config.upload_all_photos ? 'Alle Fotos' : null,
                        config.shadow_mode ? 'Shadow' : null,
                      ].filter(Boolean).join(', ') || '-'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${config.pairing_status === 'paired' ? 'ok' : config.pairing_status === 'disabled' ? 'warn' : ''}`}>
                      {config.pairing_status}
                    </span>
                    <div className="note">{config.pairing_code}</div>
                  </td>
                  <td>{formatDate(config.last_seen_at)}</td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="setup-secondary-btn"
                      onClick={() => {
                        setEditingId(config.id);
                        setForm(toForm(config));
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <Edit3 size={14} />
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="setup-secondary-btn"
                      onClick={() => copy(`pair-${config.id}`, installCommand(config))}
                    >
                      <Copy size={14} />
                      {copiedId === `pair-${config.id}` ? 'Kopiert' : 'Befehl kopieren'}
                    </button>
                    <button
                      type="button"
                      className="setup-secondary-btn"
                      onClick={() => void rotatePairing(config)}
                      disabled={busyId === config.id}
                    >
                      <RotateCcw size={14} />
                      Neuer Code
                    </button>
                    <button
                      type="button"
                      className="setup-danger-btn"
                      onClick={() => void disableConfig(config)}
                      disabled={busyId === config.id}
                    >
                      <Power size={14} />
                      Deaktivieren
                    </button>
                  </td>
                </tr>
              ))}
              {configs.length === 0 && (
                <tr>
                  <td colSpan={9} className="note">Noch kein Attraktions-PC vorbereitet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
