import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Cable, Copy, Edit3, Monitor, Power, RotateCcw } from 'lucide-react';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';
import type { Attraction, LiftpicMachineConfig, LiftpicMachineMode, Park } from '../lib/types';

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

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
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
  const [form, setForm] = useState<MachineForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copiedId, copy } = useCopyToClipboard();

  const parkNameById = useMemo(() => new Map(parks.map((park) => [park.id, park.name])), [parks]);
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
    const res = await edgeFetch('/api/admin/liftpic-machines');
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Liftpic Setup konnte nicht geladen werden'));
      setLoading(false);
      return;
    }

    const data = (body?.data || {}) as SetupResponse;
    setParks(data.parks || []);
    setAttractions(data.attractions || []);
    setConfigs(data.configs || []);
    setForm((current) => ({
      ...current,
      park_id: current.park_id || data.parks?.[0]?.id || '',
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

  function installCommand(config: LiftpicMachineConfig) {
    return `cd C:\\liftpic\\liftpic-sync && .\\liftpic-sync.exe pair --code ${config.pairing_code}`;
  }

  if (loading) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="card">
          <p className="note">Liftpic Setup wird geladen...</p>
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
              <div className="grid three" style={{ gap: 8 }}>
                {(['sold_only', 'all_photos', 'count_only'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={form.mode === mode ? '' : 'secondary'}
                    onClick={() => setMode(mode)}
                  >
                    {modeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid two">
              <label className="material-card">
                <input type="checkbox" checked={form.qr_enabled} onChange={(e) => patchForm({ qr_enabled: e.target.checked })} />
                QR-Verkauf ist aktiv
              </label>
              <label className="material-card">
                <input type="checkbox" checked={form.speed_enabled} onChange={(e) => patchForm({ speed_enabled: e.target.checked })} />
                Speedmessung lesen
              </label>
              <label className="material-card">
                <input
                  type="checkbox"
                  checked={form.count_rides_enabled}
                  onChange={(e) => patchForm({ count_rides_enabled: e.target.checked })}
                />
                Fahrten zaehlen
              </label>
              <label className="material-card">
                <input
                  type="checkbox"
                  checked={form.shadow_mode}
                  onChange={(e) => patchForm({ shadow_mode: e.target.checked })}
                />
                Shadow Mode fuer Tests
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
          <h3>Einfacher Ablauf</h3>
          <div className="grid" style={{ gap: 10 }}>
            <div className="material-card">
              <Cable size={18} />
              <h4>1. Alte Programme laufen lassen</h4>
              <p className="material-desc">TIScapture/CAM und AidaTest bleiben unveraendert und schreiben weiter in ihre Ordner.</p>
            </div>
            <div className="material-card">
              <Monitor size={18} />
              <h4>2. Diesen PC hier anlegen</h4>
              <p className="material-desc">Park, Kamera, QR, Speed und Papierwarnung werden zentral gespeichert.</p>
            </div>
            <div className="material-card">
              <Copy size={18} />
              <h4>3. Pairing-Code am Attraktions-PC eingeben</h4>
              <p className="material-desc">Danach holt sich Liftpic Sync die Einstellungen und meldet Health/Papier/Fahrten.</p>
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
                  <td colSpan={8} className="note">Noch kein Attraktions-PC vorbereitet.</td>
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
