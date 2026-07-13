
import { Link } from 'react-router-dom';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import type { Attraction, Park, ParkPathPrefix } from '../lib/types';

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [prefixes, setPrefixes] = useState<ParkPathPrefix[]>([]);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [openTicketCount, setOpenTicketCount] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const [parkForPrefix, setParkForPrefix] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');

  const [parkForAttraction, setParkForAttraction] = useState('');
  const [attractionName, setAttractionName] = useState('');
  const [attractionSlug, setAttractionSlug] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parkNameById = (parkId: string) => parks.find((p) => p.id === parkId)?.name ?? parkId;

  const load = async () => {
    const { data: parksData, error: parksError } = await supabaseBrowser
      .from('parks')
      .select('id, slug, name, is_active')
      .order('name', { ascending: true });
    if (parksError) {
      setError(parksError.message);
      return;
    }

    const { data: prefixData, error: prefixError } = await supabaseBrowser
      .from('park_path_prefixes')
      .select('id, park_id, path_prefix, is_active')
      .order('path_prefix', { ascending: true });

    if (prefixError) {
      setError(prefixError.message);
      return;
    }

    const { data: attractionsData, error: attractionsError } = await supabaseBrowser
      .from('attractions')
      .select('id, park_id, slug, name, is_active')
      .order('name', { ascending: true });

    if (attractionsError) {
      setError(attractionsError.message);
      return;
    }

    const list = (parksData || []) as Park[];
    setParks(list);
    setPrefixes((prefixData || []) as ParkPathPrefix[]);
    setAttractions((attractionsData || []) as Attraction[]);
    if (list.length) {
      if (!parkForPrefix) setParkForPrefix(list[0].id);
      if (!parkForAttraction) setParkForAttraction(list[0].id);
    }
  };

  const loadOpenTicketCount = useCallback(async () => {
    const { count, error: countError } = await supabaseBrowser
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');

    if (!countError) setOpenTicketCount(count ?? 0);
  }, []);

  useEffect(() => {
    void load();
    void loadOpenTicketCount();
  }, [loadOpenTicketCount]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel('support-ticket-count-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
        void loadOpenTicketCount();
      })
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadOpenTicketCount]);

  const createPark = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await edgeFetch('/api/admin/parks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, is_active: true }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Park konnte nicht erstellt werden'));
      return;
    }

    setStatus('Park gespeichert');
    appendActivityEvent({ title: 'Park gespeichert', details: `${name} (${slug})`, level: 'success' });
    setName('');
    setSlug('');
    await load();
  };

  const createPrefix = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await edgeFetch('/api/admin/park-prefixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: parkForPrefix, path_prefix: pathPrefix, is_active: true }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Kürzel konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Kürzel gespeichert');
    appendActivityEvent({ title: 'Foto-Kürzel gespeichert', details: pathPrefix, level: 'success' });
    setPathPrefix('');
    await load();
  };

  const createAttraction = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const res = await edgeFetch('/api/admin/attractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: parkForAttraction, name: attractionName, slug: attractionSlug, is_active: true }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Attraktion konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Attraktion gespeichert');
    appendActivityEvent({ title: 'Attraktion gespeichert', details: attractionName, level: 'success' });
    setAttractionName('');
    setAttractionSlug('');
    await load();
  };

  const deleteAttraction = async (attractionId: string, attractionNameValue: string) => {
    if (!confirm(`Attraktion "${attractionNameValue}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(attractionId);

    try {
      const res = await edgeFetch(`/api/admin/attractions?id=${encodeURIComponent(attractionId)}`, { method: 'DELETE' });
      const body = await res.json();

      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Attraktion konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Attraktion gelöscht');
      appendActivityEvent({ title: 'Attraktion gelöscht', details: attractionNameValue, level: 'warning' });
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const deletePark = async (parkId: string, parkNameValue: string) => {
    if (!confirm(`Park "${parkNameValue}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(parkId);

    try {
      const res = await edgeFetch(`/api/admin/parks?id=${encodeURIComponent(parkId)}`, { method: 'DELETE' });
      const body = await res.json();

      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Park konnte nicht gelöscht werden'));
        return;
      }

      if (parkForPrefix === parkId) setParkForPrefix('');
      if (parkForAttraction === parkId) setParkForAttraction('');
      setStatus('Park gelöscht');
      appendActivityEvent({ title: 'Park gelöscht', details: parkNameValue, level: 'warning' });
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const deletePrefix = async (prefixId: string, prefix: string) => {
    if (!confirm(`Kürzel "${prefix}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(prefixId);

    try {
      const res = await edgeFetch(`/api/admin/park-prefixes?id=${encodeURIComponent(prefixId)}`, { method: 'DELETE' });
      const body = await res.json();

      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Kürzel konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Kürzel gelöscht');
      appendActivityEvent({ title: 'Foto-Kürzel gelöscht', details: prefix, level: 'warning' });
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid three">
      <div className="card" id="tour-park-create">
        <h2>Park anlegen</h2>
        <form className="grid" onSubmit={createPark}>
          <div>
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label>Slug</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="plose-plosebob" required />
          </div>
          <button type="submit">Speichern</button>
        </form>
      </div>

      <div className="card" id="tour-attraction-create">
        <h2>Attraktion anlegen</h2>
        <p className="note">Zum Beispiel eine Sommerrodelbahn oder Achterbahn innerhalb eines Parks.</p>
        <form className="grid" onSubmit={createAttraction}>
          <div>
            <label>Park</label>
            <select value={parkForAttraction} onChange={(e) => setParkForAttraction(e.target.value)}>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Name</label>
            <input value={attractionName} onChange={(e) => setAttractionName(e.target.value)} required />
          </div>
          <div>
            <label>Slug</label>
            <input value={attractionSlug} onChange={(e) => setAttractionSlug(e.target.value.toLowerCase())} required />
          </div>
          <button type="submit">Speichern</button>
        </form>
      </div>

      <div className="card" id="tour-prefix-map">
        <h2>Fotos automatisch zuordnen</h2>
        <p className="note">
          Jeder Park bekommt ein Kürzel. Fotos, deren Dateiname mit diesem Kürzel beginnt, werden automatisch
          diesem Park zugeordnet.
        </p>
        <form className="grid" onSubmit={createPrefix}>
          <div>
            <label>Park</label>
            <select value={parkForPrefix} onChange={(e) => setParkForPrefix(e.target.value)}>
              {parks.map((park) => (
                <option key={park.id} value={park.id}>{park.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Park-Kürzel</label>
            <input value={pathPrefix} onChange={(e) => setPathPrefix(e.target.value.trim())} placeholder="plose-plosebob" required />
          </div>
          <button type="submit">Kürzel speichern</button>
        </form>
      </div>

      <div className="card" id="tour-support-preview">
        <h2>Support-Tickets</h2>
        <p className="note">
          {openTicketCount === null ? 'Lädt...' : `${openTicketCount} offene Anfrage${openTicketCount === 1 ? '' : 'n'} von Kunden.`}
        </p>
        <Link to="/staff/support-ticket-kunden" className="btn-link">
          Support-Tickets öffnen
        </Link>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Parks</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {parks.map((park) => (
                <tr key={park.id}>
                  <td>{park.name}</td>
                  <td>{park.slug}</td>
                  <td><span className={`badge ${park.is_active ? 'ok' : 'warn'}`}>{park.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                  <td>
                    <button
                      type="button"
                      className="danger inline"
                      onClick={() => deletePark(park.id, park.name)}
                      disabled={deletingId === park.id}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Foto-Zuordnungen</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kürzel</th><th>Park</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {prefixes.map((prefix) => (
                <tr key={prefix.id}>
                  <td>{prefix.path_prefix}</td>
                  <td>{parkNameById(prefix.park_id)}</td>
                  <td><span className={`badge ${prefix.is_active ? 'ok' : 'warn'}`}>{prefix.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                  <td>
                    <button
                      type="button"
                      className="danger inline"
                      onClick={() => deletePrefix(prefix.id, prefix.path_prefix)}
                      disabled={deletingId === prefix.id}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Attraktionen</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Park</th><th>Slug</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>
              {attractions.map((attraction) => (
                <tr key={attraction.id}>
                  <td>{attraction.name}</td>
                  <td>{parkNameById(attraction.park_id)}</td>
                  <td>{attraction.slug}</td>
                  <td><span className={`badge ${attraction.is_active ? 'ok' : 'warn'}`}>{attraction.is_active ? 'Aktiv' : 'Inaktiv'}</span></td>
                  <td>
                    <button
                      type="button"
                      className="danger inline"
                      onClick={() => deleteAttraction(attraction.id, attraction.name)}
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
      </div>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
