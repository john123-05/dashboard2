import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createStaffCredential,
  deleteStaffCredential,
  fetchStaffCredentials,
  type StaffCredential,
} from '../lib/staffCredentials';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

const CATEGORY_SUGGESTIONS = ['Kunde', 'Park-Passwort', 'Social Media', 'Tool', 'Sonstiges'];

const emptyForm = {
  label: '',
  category: '',
  person_name: '',
  login: '',
  password: '',
  notes: '',
};

export default function PasswordsPage() {
  const [searchParams] = useSearchParams();
  // Initial value only (deep link from the Hilfe search) — freely editable after.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [credentials, setCredentials] = useState<StaffCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { copiedId, copy } = useCopyToClipboard();

  const filteredCredentials = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return credentials;
    return credentials.filter((c) =>
      [c.label, c.category, c.person_name, c.login, c.notes].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [credentials, query]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchStaffCredentials();
      setCredentials(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.label.trim() || !form.password.trim()) {
      setFormError('Bezeichnung und Passwort sind Pflichtfelder.');
      return;
    }

    setSaving(true);
    try {
      await createStaffCredential({
        label: form.label.trim(),
        category: form.category.trim(),
        person_name: form.person_name.trim(),
        login: form.login.trim(),
        password: form.password,
        notes: form.notes.trim(),
      });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(cred: StaffCredential) {
    if (!window.confirm(`"${cred.label}" wirklich löschen?`)) return;
    try {
      await deleteStaffCredential(cred.id);
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Fehler beim Löschen.');
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Passwörter</h2>
        <p className="note">
          Interne Übersicht aller Zugangsdaten — Kunden-Logins, Park-Passwörter, Social Media, Tools. Nur für
          eingeloggte Admins sichtbar.
        </p>
      </div>

      <div className="card">
        <h3>Neues Passwort anlegen</h3>
        <form onSubmit={onSubmit} className="grid two" style={{ marginTop: 8 }}>
          <div>
            <label>Wozu gehört es? *</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="z. B. Imst Bergbahnen – Kunden-Login"
              required
            />
          </div>
          <div>
            <label>Kategorie</label>
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="z. B. Kunde, Social Media, Tool ..."
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label>Name (optional)</label>
            <input
              value={form.person_name}
              onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))}
              placeholder="z. B. Stefan Kropf"
            />
          </div>
          <div>
            <label>Anmeldename / E-Mail</label>
            <input
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              placeholder="z. B. name@example.com"
            />
          </div>
          <div>
            <label>Passwort *</label>
            <input
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Passwort"
              required
            />
          </div>
          <div>
            <label>Notiz (optional)</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="z. B. Dropdown-Auswahl, Kontext ..."
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {formError && <p className="error">{formError}</p>}
            <button type="submit" disabled={saving} style={{ width: 'auto' }}>
              {saving ? 'Speichert...' : 'Passwort speichern'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Gespeicherte Passwörter</h3>
          <span className="note">
            {query.trim() ? `${filteredCredentials.length} von ${credentials.length}` : credentials.length} Einträge
          </span>
        </div>

        {credentials.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Bezeichnung, Kategorie, Name, Login oder Notiz ..."
            style={{ marginBottom: 10 }}
          />
        )}

        {loading && <p className="note">Lädt...</p>}
        {error && <p className="error">{error}</p>}
        {!loading && !error && credentials.length === 0 && (
          <p className="note">Noch keine Passwörter gespeichert. Leg oben das erste an.</p>
        )}
        {!loading && !error && credentials.length > 0 && filteredCredentials.length === 0 && (
          <p className="note">Kein Treffer für „{query}“.</p>
        )}

        <div className="grid" style={{ gap: 10, marginTop: 8 }}>
          {filteredCredentials.map((cred) => (
            <div key={cred.id} className="material-card">
              <div className="material-card-head">
                <div>
                  <h4 style={{ marginBottom: 2 }}>{cred.label}</h4>
                  {cred.person_name && <p className="material-desc" style={{ margin: 0 }}>{cred.person_name}</p>}
                </div>
                {cred.category && <span className="material-lang-badge lang-en">{cred.category}</span>}
              </div>

              {cred.login && (
                <div className="row" style={{ alignItems: 'center' }}>
                  <span className="note" style={{ flex: '0 0 110px' }}>
                    Anmeldename
                  </span>
                  <code style={{ flex: 1, wordBreak: 'break-all' }}>{cred.login}</code>
                  <button
                    type="button"
                    className="secondary inline"
                    style={{ flex: 'none' }}
                    onClick={() => copy(`${cred.id}-login`, cred.login ?? '')}
                  >
                    {copiedId === `${cred.id}-login` ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
              )}

              <div className="row" style={{ alignItems: 'center' }}>
                <span className="note" style={{ flex: '0 0 110px' }}>
                  Passwort
                </span>
                <code style={{ flex: 1, wordBreak: 'break-all' }}>
                  {visible[cred.id] ? cred.password : '••••••••••••'}
                </code>
                <button
                  type="button"
                  className="secondary inline"
                  style={{ flex: 'none' }}
                  onClick={() => setVisible((prev) => ({ ...prev, [cred.id]: !prev[cred.id] }))}
                >
                  {visible[cred.id] ? 'Verbergen' : 'Anzeigen'}
                </button>
                <button
                  type="button"
                  className="secondary inline"
                  style={{ flex: 'none' }}
                  onClick={() => copy(`${cred.id}-password`, cred.password)}
                >
                  {copiedId === `${cred.id}-password` ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>

              {cred.notes && <p className="material-desc">{cred.notes}</p>}

              <div className="material-actions">
                <button type="button" className="danger inline" onClick={() => onDelete(cred)}>
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
