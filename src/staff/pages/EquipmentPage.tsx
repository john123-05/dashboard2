import { FormEvent, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import type { Park } from '../lib/types';

type Kategorie = 'Automat' | 'Kamera' | 'Zubehoer' | 'Software' | 'Sonstiges';
type Status = 'vorhanden' | 'empfohlen' | 'bestellt';

const KATEGORIEN: Kategorie[] = ['Automat', 'Kamera', 'Zubehoer', 'Software', 'Sonstiges'];
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'vorhanden', label: 'Vorhanden' },
  { value: 'empfohlen', label: 'Empfohlen' },
  { value: 'bestellt', label: 'Bestellt' },
];

type EquipmentItem = {
  id: string;
  park_id: string;
  kategorie: Kategorie;
  titel: string;
  beschreibung: string | null;
  status: Status;
  geschaetzter_mehrumsatz_cents: number | null;
  sortierung: number;
};

const emptyForm = {
  id: '',
  kategorie: 'Sonstiges' as Kategorie,
  titel: '',
  beschreibung: '',
  status: 'empfohlen' as Status,
  geschaetzterMehrumsatzEuro: '',
};

/**
 * "Konfiguration/Shop"-Liste je Park: was der Kunde hat, was man ihm
 * empfehlen koennte. Freie Liste (keine Katalog-Tabelle) - Grundlage fuer
 * die Operator-Seite "Konfiguration".
 */
export default function EquipmentPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState('');
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadParks();
  }, []);

  useEffect(() => {
    if (selectedParkId) void loadItems(selectedParkId);
  }, [selectedParkId]);

  async function loadParks() {
    const { data, error: parksError } = await supabaseBrowser
      .from('parks')
      .select('id, slug, name, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (parksError) {
      setError(parksError.message);
      return;
    }
    const list = (data || []) as Park[];
    setParks(list);
    if (list.length && !selectedParkId) setSelectedParkId(list[0].id);
  }

  async function loadItems(parkId: string) {
    const { data, error: itemsError } = await supabaseBrowser
      .from('park_equipment_items')
      .select('id, park_id, kategorie, titel, beschreibung, status, geschaetzter_mehrumsatz_cents, sortierung')
      .eq('park_id', parkId)
      .order('sortierung', { ascending: true });
    if (itemsError) {
      setError(itemsError.message);
      return;
    }
    setItems((data || []) as EquipmentItem[]);
  }

  function startEdit(item: EquipmentItem) {
    setForm({
      id: item.id,
      kategorie: item.kategorie,
      titel: item.titel,
      beschreibung: item.beschreibung ?? '',
      status: item.status,
      geschaetzterMehrumsatzEuro:
        item.geschaetzter_mehrumsatz_cents != null ? String(item.geschaetzter_mehrumsatz_cents / 100) : '',
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedParkId || !form.titel.trim()) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await edgeFetch('/api/admin/park-equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          park_id: selectedParkId,
          kategorie: form.kategorie,
          titel: form.titel.trim(),
          beschreibung: form.beschreibung.trim(),
          status: form.status,
          geschaetzter_mehrumsatz_cents: form.geschaetzterMehrumsatzEuro
            ? Math.round(Number(form.geschaetzterMehrumsatzEuro) * 100)
            : null,
          sortierung: items.length,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(getApiErrorMessage(body, 'Speichern fehlgeschlagen'));
      setForm(emptyForm);
      setStatus('Gespeichert.');
      await loadItems(selectedParkId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await edgeFetch(`/api/admin/park-equipment?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(getApiErrorMessage(body, 'Löschen fehlgeschlagen'));
      await loadItems(selectedParkId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid setup-stack" style={{ gap: 16 }}>
      <div className="card setup-card">
        <h2>Ausstattung</h2>
        <p className="note">
          Was der Park aktuell hat und was man ihm empfehlen könnte - die Grundlage für die Operator-Seite
          „Konfiguration".
        </p>
        <form className="grid" onSubmit={handleSubmit}>
          <div>
            <label>Park</label>
            <select value={selectedParkId} onChange={(e) => setSelectedParkId(e.target.value)}>
              {parks.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Kategorie</label>
            <select value={form.kategorie} onChange={(e) => setForm({ ...form, kategorie: e.target.value as Kategorie })}>
              {KATEGORIEN.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Titel</label>
            <input
              value={form.titel}
              onChange={(e) => setForm({ ...form, titel: e.target.value })}
              placeholder="z. B. SB-Automat Kartenlese-Modul"
              required
            />
          </div>
          <div>
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Geschätzter Mehrumsatz (€/Monat, optional)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.geschaetzterMehrumsatzEuro}
              onChange={(e) => setForm({ ...form, geschaetzterMehrumsatzEuro: e.target.value })}
              placeholder="z. B. 150"
            />
          </div>
          <div>
            <label>Beschreibung (optional)</label>
            <textarea
              value={form.beschreibung}
              onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
              rows={2}
            />
          </div>
          <button type="submit" className="setup-primary-btn" disabled={saving || !form.titel.trim()}>
            {form.id ? 'Änderungen speichern' : 'Hinzufügen'}
          </button>
          {form.id && (
            <button type="button" className="setup-secondary-btn" onClick={() => setForm(emptyForm)}>
              Abbrechen
            </button>
          )}
        </form>
      </div>

      <div className="card setup-card">
        <h2>Einträge</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Kategorie</th>
                <th>Titel</th>
                <th>Status</th>
                <th>Mehrumsatz</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.kategorie}</td>
                  <td>
                    {item.titel}
                    {item.beschreibung && <div className="note">{item.beschreibung}</div>}
                  </td>
                  <td>{STATUS_OPTIONS.find((s) => s.value === item.status)?.label}</td>
                  <td>
                    {item.geschaetzter_mehrumsatz_cents != null
                      ? `+${(item.geschaetzter_mehrumsatz_cents / 100).toLocaleString('de-DE')} €/Monat`
                      : '—'}
                  </td>
                  <td>
                    <button type="button" className="setup-icon-btn" onClick={() => startEdit(item)} title="Bearbeiten">
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="setup-icon-btn"
                      onClick={() => void handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      aria-label={`${item.titel} löschen`}
                      title="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="note">Noch keine Einträge für diesen Park.</td>
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
