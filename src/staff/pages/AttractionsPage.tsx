
import { FormEvent, useEffect, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import type { Attraction, Park } from '../lib/types';

export default function AttractionsPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [selectedParkId, setSelectedParkId] = useState('');
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadParks = async () => {
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
    if (list.length && !selectedParkId) {
      setSelectedParkId(list[0].id);
    }
  };

  const loadAttractions = async (parkId: string) => {
    if (!parkId) return;
    const { data, error: attrError } = await supabaseBrowser
      .from('attractions')
      .select('id, park_id, slug, name, is_active')
      .eq('park_id', parkId)
      .order('name', { ascending: true });

    if (attrError) {
      setError(attrError.message);
      return;
    }

    setAttractions((data || []) as Attraction[]);
  };

  useEffect(() => { loadParks(); }, []);
  useEffect(() => { if (selectedParkId) loadAttractions(selectedParkId); }, [selectedParkId]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await edgeFetch('/api/admin/attractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: selectedParkId, slug, name, is_active: true }),
    });

    const body = await res.json();
    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Attraktion konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Attraktion gespeichert');
    appendActivityEvent({
      title: 'Attraktion gespeichert',
      details: `${name} (${slug})`,
      level: 'success',
    });
    setName('');
    setSlug('');
    await loadAttractions(selectedParkId);
  };

  const onDelete = async (attractionId: string, attractionName: string) => {
    if (!confirm(`Attraktion "${attractionName}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(attractionId);

    try {
      const res = await edgeFetch(`/api/admin/attractions?id=${encodeURIComponent(attractionId)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Attraktion konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Attraktion gelöscht');
      appendActivityEvent({
        title: 'Attraktion gelöscht',
        details: attractionName,
        level: 'warning',
      });
      await loadAttractions(selectedParkId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid two">
      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Attraktionen</h2>
        <div className="row">
          <div>
            <label>Park</label>
            <select value={selectedParkId} onChange={(e) => setSelectedParkId(e.target.value)}>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Neue Attraktion</h3>
        <form className="grid" onSubmit={onCreate}>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} required />
          </div>
          <button type="submit">Speichern</button>
        </form>
      </div>

      <div className="card">
        <h3>Liste</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Aktionen</th></tr></thead>
          <tbody>
            {attractions.map((attraction) => (
              <tr key={attraction.id}>
                <td>{attraction.name}</td>
                <td>{attraction.slug}</td>
                <td><span className={`badge ${attraction.is_active ? 'ok' : 'warn'}`}>{attraction.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                <td>
                  <button
                    type="button"
                    className="danger inline"
                    onClick={() => onDelete(attraction.id, attraction.name)}
                    disabled={deletingId === attraction.id}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
