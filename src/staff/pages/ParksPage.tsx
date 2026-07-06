
import { Link } from 'react-router-dom';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import { appendActivityEvent } from '../lib/activity-feed';
import ActivityFeedWidget from '../components/ActivityFeedWidget';
import type { Park, ParkPathPrefix, SupportTicket, SupportTicketPriority, SupportTicketStatus } from '../lib/types';

const statusLabelMap: Record<SupportTicketStatus, string> = {
  open: 'Offen',
  in_progress: 'In Bearbeitung',
  resolved: 'Erledigt',
  closed: 'Geschlossen',
};

const priorityLabelMap: Record<SupportTicketPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  critical: 'Kritisch',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

export default function ParksPage() {
  const [parks, setParks] = useState<Park[]>([]);
  const [prefixes, setPrefixes] = useState<ParkPathPrefix[]>([]);
  const [supportPreview, setSupportPreview] = useState<SupportTicket[]>([]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parkForPrefix, setParkForPrefix] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(true);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestSupportTicketIdRef = useRef<string | null>(null);

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

    setParks((parksData || []) as Park[]);
    setPrefixes((prefixData || []) as ParkPathPrefix[]);
    if ((parksData || []).length && !parkForPrefix) {
      setParkForPrefix(parksData![0].id);
    }
  };

  const loadSupportPreview = useCallback(async () => {
    setSupportLoading(true);
    const { data, error: supportLoadError } = await supabaseBrowser
      .from('support_tickets')
      .select('id, organization_id, created_by, subject, description, status, priority, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (supportLoadError) {
      setSupportError(supportLoadError.message);
      setSupportLoading(false);
      return;
    }

    setSupportPreview((data || []) as SupportTicket[]);
    setSupportError(null);
    setSupportLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void loadSupportPreview();
  }, [loadSupportPreview]);

  useEffect(() => {
    const latest = supportPreview[0];
    if (!latest) return;
    if (!latestSupportTicketIdRef.current) {
      latestSupportTicketIdRef.current = latest.id;
      return;
    }
    if (latest.id !== latestSupportTicketIdRef.current) {
      latestSupportTicketIdRef.current = latest.id;
      appendActivityEvent({
        title: 'Neues Support Ticket',
        details: latest.subject,
        level: 'info',
      });
    }
  }, [supportPreview]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel('support-ticket-preview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, async () => {
        await loadSupportPreview();
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'CHANNEL_ERROR') {
          setSupportError('Realtime-Verbindung fehlgeschlagen. Bitte Seite neu laden.');
        }
      });

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadSupportPreview]);

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
    appendActivityEvent({
      title: 'Park gespeichert',
      details: `${name} (${slug})`,
      level: 'success',
    });
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
      setError(getApiErrorMessage(body, 'Prefix konnte nicht gespeichert werden'));
      return;
    }

    setStatus('Prefix gespeichert');
    appendActivityEvent({
      title: 'Prefix gespeichert',
      details: pathPrefix,
      level: 'success',
    });
    setPathPrefix('');
    await load();
  };

  const deletePark = async (parkId: string, parkName: string) => {
    if (!confirm(`Park "${parkName}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(parkId);

    try {
      const res = await edgeFetch(`/api/admin/parks?id=${encodeURIComponent(parkId)}`, {
        method: 'DELETE',
      });
      const body = await res.json();

      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Park konnte nicht gelöscht werden'));
        return;
      }

      if (parkForPrefix === parkId) setParkForPrefix('');
      setStatus('Park gelöscht');
      appendActivityEvent({
        title: 'Park gelöscht',
        details: parkName,
        level: 'warning',
      });
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const deletePrefix = async (prefixId: string, prefix: string) => {
    if (!confirm(`Prefix "${prefix}" wirklich löschen?`)) return;
    setError(null);
    setStatus(null);
    setDeletingId(prefixId);

    try {
      const res = await edgeFetch(`/api/admin/park-prefixes?id=${encodeURIComponent(prefixId)}`, {
        method: 'DELETE',
      });
      const body = await res.json();

      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Prefix konnte nicht gelöscht werden'));
        return;
      }

      setStatus('Prefix gelöscht');
      appendActivityEvent({
        title: 'Prefix gelöscht',
        details: prefix,
        level: 'warning',
      });
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

      <div className="card" id="tour-prefix-map">
        <h2>Path Prefix mappen</h2>
        <p className="note">Upload-Pfad muss mit Prefix starten: `prefix/dateiname.jpg`</p>
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
            <label>Prefix</label>
            <input value={pathPrefix} onChange={(e) => setPathPrefix(e.target.value.trim())} placeholder="plose-plosebob" required />
          </div>
          <button type="submit">Prefix speichern</button>
        </form>
      </div>

      <div className="card" id="tour-support-preview">
        <h2>Support Ticket Kunden</h2>
        <p className="note">Live-Vorschau der neuesten synchronisierten Tickets.</p>
        {supportLoading && <p className="support-loading">Tickets werden geladen...</p>}
        {!supportLoading && supportError && <p className="support-error">{supportError}</p>}
        {!supportLoading && !supportError && supportPreview.length === 0 && (
          <p className="support-empty">Keine Tickets vorhanden.</p>
        )}
        {!supportLoading && !supportError && supportPreview.length > 0 && (
          <ul className="ticket-preview-list ticket-preview-list-scroll">
            {supportPreview.map((ticket) => (
              <li key={ticket.id} className="ticket-preview-item">
                <p className="ticket-preview-subject">{ticket.subject}</p>
                <div className="ticket-preview-meta">
                  <span className={`badge status-${ticket.status}`}>{statusLabelMap[ticket.status]}</span>
                  <span className={`badge priority-${ticket.priority}`}>{priorityLabelMap[ticket.priority]}</span>
                  <span className="note">{formatDateTime(ticket.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link to="/staff/support-ticket-kunden" className="support-link">Zur Support-Ansicht</Link>
      </div>

      <div id="tour-news-feed">
        <ActivityFeedWidget />
      </div>

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Parks</h2>
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

      <div className="card" style={{ gridColumn: '1 / -1' }}>
        <h2>Prefix-Mappings</h2>
        <table className="table">
          <thead><tr><th>Prefix</th><th>Park ID</th><th>Status</th><th>Aktionen</th></tr></thead>
          <tbody>
            {prefixes.map((prefix) => (
              <tr key={prefix.id}>
                <td>{prefix.path_prefix}</td>
                <td>{prefix.park_id}</td>
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

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
