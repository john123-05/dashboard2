import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Cable, Copy, Download, Edit3, Eye, EyeOff, FileImage, Monitor, Power, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
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
  is_active: true,
};

const modeLabels: Record<LiftpicMachineMode, string> = {
  sold_only: 'Nur verkaufte QR-Fotos',
  all_photos: 'Alle Fotos hochladen',
  count_only: 'Nur Fahrten zaehlen',
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
  const filteredAttractions = useMemo(
    () => attractions.filter((attraction) => attraction.park_id === form.park_id),
    [attractions, form.park_id],
  );

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

    const payload = {
      ...form,
      id: editingId || undefined,
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
      details: form.machine_label || form.machine_id,
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
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="support-panel-header">
          <div>
            <p className="eyebrow">Liftpic Sync</p>
            <h2>PCs, Kameras und Upload-Modus</h2>
            <p className="note">
              Hier wird pro Attraktions-PC festgelegt, was der neue Uploader tun soll. Kamera und Aida bleiben separat.
            </p>
          </div>
          <button type="button" className="secondary inline" onClick={() => void load()}>
            Aktualisieren
          </button>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>{editingId ? 'Liftpic PC bearbeiten' : 'Neuen Liftpic PC vorbereiten'}</h3>
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
                <label>PC-ID</label>
                <input
                  value={form.machine_id}
                  onChange={(e) => patchForm({ machine_id: e.target.value.trim().toLowerCase() })}
                  placeholder="plosebob-pc-1"
                  required
                />
              </div>
              <div>
                <label>PC-Name</label>
                <input
                  value={form.machine_label}
                  onChange={(e) => patchForm({ machine_label: e.target.value })}
                  placeholder="Plosebob Kasse"
                  required
                />
              </div>
            </div>

            <div className="row">
              <div>
                <label>Kamera</label>
                <input
                  value={form.camera_label}
                  onChange={(e) => patchForm({ camera_label: e.target.value })}
                  placeholder="Kamera 1"
                  required
                />
              </div>
              <div>
                <label>Kamera-Code intern</label>
                <input
                  value={form.camera_code}
                  onChange={(e) => patchForm({ camera_code: e.target.value.trim().toLowerCase() })}
                  placeholder="cam1"
                  required
                />
              </div>
              <div>
                <label>Kundencode alt</label>
                <input
                  value={form.legacy_customer_code}
                  onChange={(e) => patchForm({ legacy_customer_code: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="1234"
                  required
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
                    <span>
                      {mode === 'sold_only' && 'Standard: nur gekaufte QR-Bilder werden hochgeladen.'}
                      {mode === 'all_photos' && 'Diagnose oder Foto-Shop: jedes fertige Bild wird gesendet.'}
                      {mode === 'count_only' && 'Nur Zaehler und Health, keine Bild-Uploads.'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="liftpic-toggle-grid">
              <label className="liftpic-toggle-card">
                <input type="checkbox" checked={form.qr_enabled} onChange={(e) => patchForm({ qr_enabled: e.target.checked })} />
                <span>
                  <strong>QR-Verkauf</strong>
                  <small>Verkaufte Bilder aus qrcode beachten</small>
                </span>
              </label>
              <label className="liftpic-toggle-card">
                <input type="checkbox" checked={form.speed_enabled} onChange={(e) => patchForm({ speed_enabled: e.target.checked })} />
                <span>
                  <strong>Speedmessung</strong>
                  <small>AidaTest-Namen auswerten</small>
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
                  <small>Auch ohne Bild-Upload</small>
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
                  <small>Erst testen, dann live schalten</small>
                </span>
              </label>
            </div>

            <div className="row">
              <div>
                <label>Warnung Fotopapier ab</label>
                <input
                  type="number"
                  min={0}
                  value={form.paper_warn_remaining}
                  onChange={(e) => patchForm({ paper_warn_remaining: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label>RAW Ordner</label>
                <input value={form.raw_dir} onChange={(e) => patchForm({ raw_dir: e.target.value })} />
              </div>
            </div>

            <details>
              <summary className="note">Ordner und Statusdateien anzeigen</summary>
              <div className="grid" style={{ gap: 10, marginTop: 10 }}>
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

            <div className="row">
              <button type="submit" disabled={saving || !parks.length}>
                {saving ? 'Speichert...' : editingId ? 'Aktualisieren' : 'PC vorbereiten'}
              </button>
              {editingId && (
                <button type="button" className="secondary" onClick={resetForm}>
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="support-panel-header">
            <div>
              <p className="eyebrow">Installation</p>
              <h3>Einfacher Ablauf am Kunden-PC</h3>
              <p className="note">Eine Datei herunterladen, als Administrator starten, Pairing-Code eingeben.</p>
            </div>
            <button
              type="button"
              className="secondary inline"
              onClick={() => void downloadBootstrapInstaller()}
            >
              <Download size={16} />
              Install-Datei
            </button>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            <div className="material-card">
              <Cable size={18} />
              <h4>1. Park und Attraktion anlegen</h4>
              <p className="material-desc">Erst links im Tab Kunden & Parks den Kunden/Park und die Attraktion anlegen oder pruefen.</p>
            </div>
            <div className="material-card">
              <Monitor size={18} />
              <h4>2. Liftpic PC vorbereiten</h4>
              <p className="material-desc">Hier Park, Kamera, Kundencode, Ordner, QR, Speed und Papierwarnung eintragen. Fuer Live-Test: Shadow Mode anlassen.</p>
            </div>
            <div className="material-card">
              <Copy size={18} />
              <h4>3. Install-Datei auf den Kunden-PC</h4>
              <p className="material-desc">Datei in Downloads speichern, PowerShell als Administrator oeffnen, Install-Befehl aus der PC-Zeile kopieren und starten.</p>
            </div>
            <div className="material-card">
              <Power size={18} />
              <h4>4. Kontrolle</h4>
              <p className="material-desc">Hier sollte nach kurzer Zeit Zuletzt gesehen, Papier, Fahrten und Queue erscheinen. Erst danach live schalten.</p>
            </div>
            <div className="material-card">
              <FileImage size={18} />
              <h4>Laufende Attraktion sicher testen</h4>
              <p className="material-desc">Kamera, Aida, PhotoViewer und Print bleiben an. Liftpic Sync liest nur mit, solange Shadow Mode aktiv ist.</p>
            </div>
            <div className="material-card">
              <UploadCloud size={18} />
              <h4>Wann alten Uploader stoppen?</h4>
              <p className="material-desc">Erst wenn Health und Test-Uploads passen. Nicht alten und neuen Uploader gleichzeitig live auf dieselben Bilder senden lassen.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
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
                        className={config.shadow_mode ? 'secondary inline' : 'danger inline'}
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
                      className="secondary inline"
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
                      className="secondary inline"
                      onClick={() => copy(`pair-${config.id}`, installCommand(config))}
                    >
                      <Copy size={14} />
                      {copiedId === `pair-${config.id}` ? 'Kopiert' : 'Install-Befehl'}
                    </button>
                    <button
                      type="button"
                      className="secondary inline"
                      onClick={() => void rotatePairing(config)}
                      disabled={busyId === config.id}
                    >
                      <RotateCcw size={14} />
                      Neuer Code
                    </button>
                    <button
                      type="button"
                      className="danger inline"
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

      <div className="grid two">
        <div className="card">
          <div className="support-panel-header">
            <div>
              <p className="eyebrow">Lokale Dateien</p>
              <h3>Automat-Logo oder Print-Overlay vorbereiten</h3>
              <p className="note">
                Die Datei wird in Supabase gespeichert. Der Attraktions-PC holt sie per Liftpic Sync ab und ersetzt nur
                den erlaubten Zielpfad mit Backup.
              </p>
            </div>
            <FileImage size={22} />
          </div>
          <form className="grid liftpic-asset-form" onSubmit={submitAsset}>
            <div>
              <label>PC / Kamera</label>
              <select
                value={assetForm.machine_config_id}
                onChange={(e) => patchAssetForm({ machine_config_id: e.target.value })}
                required
              >
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {parkNameById.get(config.park_id) || config.park_id} - {config.machine_label} / {config.camera_label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Was soll ersetzt werden?</label>
              <select value={assetForm.slot} onChange={(e) => setAssetSlot(e.target.value)}>
                {assetSlots.map((slot) => (
                  <option key={slot.id} value={slot.id}>{slot.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Name im Dashboard</label>
              <input value={assetForm.label} onChange={(e) => patchAssetForm({ label: e.target.value })} />
            </div>

            <div>
              <label>Zielpfad auf dem PC</label>
              <input value={assetForm.target_path} onChange={(e) => patchAssetForm({ target_path: e.target.value })} />
              <p className="note">Erlaubt sind spaeter nur samuel_neu, imageloader und jpeg4web.</p>
            </div>

            <div className="row">
              <div>
                <label>Hinweis nach Download</label>
                <select value={assetForm.restart_hint} onChange={(e) => patchAssetForm({ restart_hint: e.target.value })}>
                  <option value="restart_viewer">Verkaufsautomat neu starten</option>
                  <option value="restart_print">Print/Viewer neu starten</option>
                  <option value="none">Kein Neustart bekannt</option>
                </select>
              </div>
              <div>
                <label>Datei</label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.bmp,.gif,image/png,image/jpeg,image/bmp,image/gif"
                  onChange={(e) => setAssetFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
            </div>

            <div>
              <label>Notiz</label>
              <input
                value={assetForm.notes}
                onChange={(e) => patchAssetForm({ notes: e.target.value })}
                placeholder="z.B. Sommermotiv 2026"
              />
            </div>

            <button type="submit" disabled={assetSaving || !configs.length}>
              <UploadCloud size={16} />
              {assetSaving ? 'Bereitet vor...' : 'Datei fuer PC vorbereiten'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="support-panel-header">
            <div>
              <p className="eyebrow">Ausgerollte Slots</p>
              <h3>Aktive lokale Dateien</h3>
              <p className="note">Diese Liste liest der PC beim Asset-Sync als Manifest.</p>
            </div>
            <button type="button" className="secondary inline" onClick={() => void load()}>
              Aktualisieren
            </button>
          </div>
          <div className="table-wrap">
            <table className="table liftpic-assets-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>PC</th>
                  <th>Ziel</th>
                  <th>Datei</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const machineLabel = configLabelByMachine.get(`${asset.machine_id || ''}|${asset.camera_code || ''}`);
                  return (
                    <tr key={asset.id}>
                      <td>
                        <strong>{asset.label || slotLabelById.get(asset.slot) || asset.slot}</strong>
                        <div className="note">{asset.slot}</div>
                      </td>
                      <td>
                        {machineLabel || asset.machine_id || 'Parkweit'}
                        {asset.camera_code && <div className="note">{asset.camera_code}</div>}
                      </td>
                      <td className="mono-path">{asset.target_path}</td>
                      <td>
                        {formatBytes(asset.file_size)}
                        <div className="note">{formatDate(asset.updated_at)}</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="danger inline"
                          onClick={() => void disableAsset(asset)}
                          disabled={assetBusyId === asset.id}
                        >
                          <Trash2 size={14} />
                          Deaktivieren
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="note">Noch keine lokalen Automaten-Dateien vorbereitet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
