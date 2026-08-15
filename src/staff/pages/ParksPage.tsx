import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import type { Attraction, Park, ParkPathPrefix } from '../lib/types';

const OPERATOR_PROJECT_URL = 'https://xcrxltiiovpoladpaewd.supabase.co';
const OPERATOR_PROJECT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ';

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

async function saveParkAccessPassword(parkId: string, parkName: string, password: string): Promise<string | null> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const staffAccessToken = sessionData.session?.access_token;
  if (!staffAccessToken) return 'Keine Staff-Sitzung gefunden';

  const res = await fetch(`${OPERATOR_PROJECT_URL}/functions/v1/admin-set-park-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: OPERATOR_PROJECT_ANON_KEY },
    body: JSON.stringify({ staffAccessToken, park_id: parkId, park_name: parkName, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return getApiErrorMessage(body, 'Passwort konnte nicht gespeichert werden');
  return null;
}

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [prefixes, setPrefixes] = useState<ParkPathPrefix[]>([]);
  const [attractions, setAttractions] = useState<Attraction[]>([]);

  const [name, setName] = useState('');
  const [parkForAttraction, setParkForAttraction] = useState('');
  const [attractionName, setAttractionName] = useState('');
  const [accessParkId, setAccessParkId] = useState('');
  const [parkPassword, setParkPassword] = useState('');
  const [parkForPrefix, setParkForPrefix] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const derivedParkSlug = slugifyValue(name);
  const derivedAttractionSlug = slugifyValue(attractionName);
  const selectedPrefixPark = parks.find((park) => park.id === parkForPrefix) || null;
  const suggestedPrefix = pathPrefix.trim() || (selectedPrefixPark ? selectedPrefixPark.slug : '');
  const prefixesByParkId = useMemo(() => {
    const grouped = new Map<string, ParkPathPrefix[]>();
    prefixes.forEach((prefix) => {
      const bucket = grouped.get(prefix.park_id) || [];
      bucket.push(prefix);
      grouped.set(prefix.park_id, bucket);
    });
    return grouped;
  }, [prefixes]);

  const parkNameById = (parkId: string) => parks.find((park) => park.id === parkId)?.name ?? parkId;

  async function load() {
    setError(null);

    const [{ data: parksData, error: parksError }, { data: prefixData, error: prefixError }, { data: attractionsData, error: attractionsError }] =
      await Promise.all([
        supabaseBrowser.from('parks').select('id, slug, name, is_active').order('name', { ascending: true }),
        supabaseBrowser.from('park_path_prefixes').select('id, park_id, path_prefix, is_active').order('path_prefix', { ascending: true }),
        supabaseBrowser.from('attractions').select('id, park_id, slug, name, is_active').order('name', { ascending: true }),
      ]);

    if (parksError) {
      setError(parksError.message);
      return;
    }
    if (prefixError) {
      setError(prefixError.message);
      return;
    }
    if (attractionsError) {
      setError(attractionsError.message);
      return;
    }

    const list = (parksData || []) as Park[];
    setParks(list);
    setPrefixes((prefixData || []) as ParkPathPrefix[]);
    setAttractions((attractionsData || []) as Attraction[]);

    if (list.length) {
      if (!parkForAttraction) setParkForAttraction(list[0].id);
      if (!parkForPrefix) setParkForPrefix(list[0].id);
      if (!accessParkId) setAccessParkId(list[0].id);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPark(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const slug = slugifyValue(name);
    if (!slug) {
      setError('Bitte einen gültigen Parknamen eingeben.');
      return;
    }

    const parkRes = await edgeFetch('/api/admin/parks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), slug, is_active: true }),
    });
    const parkBody = await parkRes.json().catch(() => null);

    if (!parkRes.ok) {
      setError(getApiErrorMessage(parkBody, 'Park konnte nicht erstellt werden'));
      return;
    }

    let prefixMessage = '';
    const createdParkId = parkBody?.data?.id as string | undefined;
    if (createdParkId) {
      const prefixRes = await edgeFetch('/api/admin/park-prefixes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ park_id: createdParkId, path_prefix: slug, is_active: true }),
      });
      if (!prefixRes.ok) {
        prefixMessage = ' Foto-Zuordnung bitte unter Sonderfälle prüfen.';
      }
    }

    setStatus(`Park gespeichert.${prefixMessage}`);
    appendActivityEvent({ title: 'Park gespeichert', details: `${name.trim()} (${slug})`, level: 'success' });
    setName('');
    await load();
  }

  async function createAttraction(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const slug = slugifyValue(attractionName);
    if (!slug) {
      setError('Bitte einen gültigen Attraktionsnamen eingeben.');
      return;
    }

    const res = await edgeFetch('/api/admin/attractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: parkForAttraction, name: attractionName.trim(), slug, is_active: true }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Attraktion konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Attraktion gespeichert');
    appendActivityEvent({ title: 'Attraktion gespeichert', details: attractionName.trim(), level: 'success' });
    setAttractionName('');
    await load();
  }

  async function saveAccessPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const park = parks.find((entry) => entry.id === accessParkId);
    if (!park) {
      setError('Bitte zuerst einen Park auswählen.');
      return;
    }

    const passwordError = await saveParkAccessPassword(park.id, park.name, parkPassword.trim());
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setStatus('Dashboard-Passwort gespeichert');
    appendActivityEvent({ title: 'Dashboard-Passwort gespeichert', details: park.name, level: 'success' });
    setParkPassword('');
  }

  async function createPrefix(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const prefixValue = suggestedPrefix.trim();
    if (!prefixValue) {
      setError('Bitte ein gültiges Foto-Kürzel eingeben.');
      return;
    }

    const res = await edgeFetch('/api/admin/park-prefixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: parkForPrefix, path_prefix: prefixValue, is_active: true }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Foto-Zuordnung konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Foto-Zuordnung gespeichert');
    appendActivityEvent({ title: 'Foto-Zuordnung gespeichert', details: prefixValue, level: 'success' });
    setPathPrefix('');
    await load();
  }

  async function deleteAttraction(attractionId: string, attractionNameValue: string) {
    if (!confirm(`Attraktion "${attractionNameValue}" wirklich löschen?`)) return;
    setDeletingId(attractionId);
    setError(null);
    setStatus(null);

    try {
      const res = await edgeFetch(`/api/admin/attractions?id=${encodeURIComponent(attractionId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
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
  }

  async function deletePark(parkId: string, parkNameValue: string) {
    if (!confirm(`Park "${parkNameValue}" wirklich löschen?`)) return;
    setDeletingId(parkId);
    setError(null);
    setStatus(null);

    try {
      const res = await edgeFetch(`/api/admin/parks?id=${encodeURIComponent(parkId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Park konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Park gelöscht');
      appendActivityEvent({ title: 'Park gelöscht', details: parkNameValue, level: 'warning' });
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  async function deletePrefix(prefixId: string, prefix: string) {
    if (!confirm(`Foto-Zuordnung "${prefix}" wirklich löschen?`)) return;
    setDeletingId(prefixId);
    setError(null);
    setStatus(null);

    try {
      const res = await edgeFetch(`/api/admin/park-prefixes?id=${encodeURIComponent(prefixId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Foto-Zuordnung konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Foto-Zuordnung gelöscht');
      appendActivityEvent({ title: 'Foto-Zuordnung gelöscht', details: prefix, level: 'warning' });
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid setup-stack" style={{ gap: 16 }}>
      <div className="grid three setup-step-grid">
        <div className="card setup-card" id="tour-park-create">
          <h2>1. Park anlegen</h2>
          <form className="grid" onSubmit={createPark}>
            <div>
              <label>Parkname</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imster Bergbahnen" required />
            </div>
            <button type="submit" className="setup-primary-btn" disabled={!derivedParkSlug}>Park speichern</button>
          </form>
        </div>

        <div className="card setup-card" id="tour-attraction-create">
          <h2>2. Attraktion anlegen</h2>
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
              <label>Name der Attraktion</label>
              <input value={attractionName} onChange={(e) => setAttractionName(e.target.value)} placeholder="Alpine Coaster" required />
            </div>
            <button type="submit" className="setup-primary-btn" disabled={!parkForAttraction || !derivedAttractionSlug}>
              Attraktion speichern
            </button>
          </form>
        </div>

        <div className="card setup-card">
          <h2>3. Zugang setzen</h2>
          <form className="grid" onSubmit={saveAccessPassword}>
            <div>
              <label>Park</label>
              <select value={accessParkId} onChange={(e) => setAccessParkId(e.target.value)}>
                {parks.map((park) => (
                  <option key={park.id} value={park.id}>{park.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Dashboard-Passwort</label>
              <input
                type="text"
                value={parkPassword}
                onChange={(e) => setParkPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                minLength={6}
                required
              />
            </div>
            <button type="submit" className="setup-secondary-btn">Zugang speichern</button>
          </form>
        </div>
      </div>

      <details className="card setup-card">
        <summary>Sonderfälle: Foto-Zuordnung</summary>
        <div className="grid" style={{ gap: 14, marginTop: 14 }}>
          <form className="grid two" onSubmit={createPrefix}>
            <div>
              <label>Park</label>
              <select value={parkForPrefix} onChange={(e) => setParkForPrefix(e.target.value)}>
                {parks.map((park) => (
                  <option key={park.id} value={park.id}>{park.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Foto-Kürzel</label>
              <input
                value={pathPrefix}
                onChange={(e) => setPathPrefix(slugifyValue(e.target.value))}
                placeholder={selectedPrefixPark?.slug || 'imster-bergbahnen'}
              />
            </div>
            <div>
              <button type="submit" className="setup-secondary-btn">Sonderfall speichern</button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Park</th><th>Aktive Foto-Zuordnung</th><th>Aktionen</th></tr></thead>
              <tbody>
                {parks.map((park) => {
                  const parkPrefixes = prefixesByParkId.get(park.id) || [];
                  return (
                    <tr key={park.id}>
                      <td>{park.name}</td>
                      <td>
                        <strong>{park.slug}</strong>
                        {parkPrefixes.map((prefix) => (
                          <div key={prefix.id} className="note">{prefix.path_prefix}</div>
                        ))}
                      </td>
                      <td>
                        {parkPrefixes.length === 0 ? (
                          <span className="note">Automatisch über Parknamen</span>
                        ) : (
                          parkPrefixes.map((prefix) => (
                            <button
                              key={prefix.id}
                              type="button"
                              className="setup-icon-btn"
                              onClick={() => void deletePrefix(prefix.id, prefix.path_prefix)}
                              disabled={deletingId === prefix.id}
                              aria-label={`Foto-Zuordnung ${prefix.path_prefix} löschen`}
                              title="Löschen"
                            >
                              <Trash2 size={14} />
                            </button>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <div className="grid two setup-overview-grid">
        <div className="card setup-card">
          <h2>Bestehende Parks</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Park</th><th>Aktionen</th></tr></thead>
              <tbody>
                {parks.map((park) => (
                  <tr key={park.id}>
                    <td>{park.name}</td>
                    <td>
                      <button
                        type="button"
                        className="setup-icon-btn"
                        onClick={() => void deletePark(park.id, park.name)}
                        disabled={deletingId === park.id}
                        aria-label={`Park ${park.name} löschen`}
                        title="Löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card setup-card">
          <h2>Bestehende Attraktionen</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Attraktion</th><th>Park</th><th>Aktionen</th></tr></thead>
              <tbody>
                {attractions.map((attraction) => (
                  <tr key={attraction.id}>
                    <td>{attraction.name}</td>
                    <td>{parkNameById(attraction.park_id)}</td>
                    <td>
                      <button
                        type="button"
                        className="setup-icon-btn"
                        onClick={() => void deleteAttraction(attraction.id, attraction.name)}
                        disabled={deletingId === attraction.id}
                        aria-label={`Attraktion ${attraction.name} löschen`}
                        title="Löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
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
