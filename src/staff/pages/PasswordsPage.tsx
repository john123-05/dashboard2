import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, Eye, EyeOff, KeyRound, PencilLine, Plus, Search, Trash2, Users } from 'lucide-react';
import {
  createStaffCredential,
  deleteStaffCredential,
  fetchStaffCredentials,
  updateStaffCredential,
  type StaffCredential,
} from '../lib/staffCredentials';
import { supabaseBrowser } from '../lib/supabase';
import type { Park } from '../lib/types';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

const CATEGORY_SUGGESTIONS = ['Kunde', 'Park-Passwort', 'Dashboard-Zugang', 'Social Media', 'Tool', 'Sonstiges'];

const emptyForm = {
  label: '',
  category: '',
  person_name: '',
  login: '',
  password: '',
  notes: '',
};

type PasswordView = 'customer' | 'all' | 'tools';

type CredentialForm = typeof emptyForm;

function credentialMatchesPark(park: Pick<Park, 'name' | 'slug'>, credential: StaffCredential) {
  const haystack = [credential.label, credential.category, credential.person_name, credential.login, credential.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(park.name.toLowerCase()) || haystack.includes(park.slug.toLowerCase());
}

function credentialKind(credential: StaffCredential): 'dashboard' | 'park' | 'tool' | 'other' {
  const category = (credential.category || '').trim().toLowerCase();
  const label = credential.label.trim().toLowerCase();

  if (category === 'dashboard-zugang' || label.includes('dashboard-zugang')) return 'dashboard';
  if (category === 'park-passwort' || label.includes('park-passwort')) return 'park';
  if (category === 'social media' || category === 'tool') return 'tool';
  return 'other';
}

function formatCredentialMeta(credential: StaffCredential) {
  return [credential.person_name, credential.login].filter(Boolean).join(' · ');
}

export default function PasswordsPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [credentials, setCredentials] = useState<StaffCredential[]>([]);
  const [parks, setParks] = useState<Pick<Park, 'id' | 'name' | 'slug'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<CredentialForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeView, setActiveView] = useState<PasswordView>('customer');
  const { copiedId, copy } = useCopyToClipboard();

  const filteredCredentials = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return credentials;
    return credentials.filter((c) =>
      [c.label, c.category, c.person_name, c.login, c.notes].some((field) => field?.toLowerCase().includes(q)),
    );
  }, [credentials, query]);

  const dashboardCredentials = useMemo(
    () => filteredCredentials.filter((credential) => credentialKind(credential) === 'dashboard'),
    [filteredCredentials],
  );

  const parkPasswordCredentials = useMemo(
    () => filteredCredentials.filter((credential) => credentialKind(credential) === 'park'),
    [filteredCredentials],
  );

  const toolCredentials = useMemo(
    () => filteredCredentials.filter((credential) => credentialKind(credential) === 'tool'),
    [filteredCredentials],
  );

  const otherCredentials = useMemo(
    () => filteredCredentials.filter((credential) => credentialKind(credential) === 'other'),
    [filteredCredentials],
  );

  const customerGroups = useMemo(() => {
    const grouped = parks
      .map((park) => {
        const matchedDashboardUsers = dashboardCredentials.filter((credential) => credentialMatchesPark(park, credential));
        const matchedParkPassword = parkPasswordCredentials.find((credential) => credentialMatchesPark(park, credential)) || null;
        return {
          park,
          dashboardUsers: matchedDashboardUsers,
          parkPassword: matchedParkPassword,
        };
      })
      .filter((group) => group.dashboardUsers.length > 0 || group.parkPassword);

    const groupedIds = new Set(
      grouped.flatMap((group) => [
        ...group.dashboardUsers.map((credential) => credential.id),
        ...(group.parkPassword ? [group.parkPassword.id] : []),
      ]),
    );

    const unassigned = [...dashboardCredentials, ...parkPasswordCredentials].filter((credential) => !groupedIds.has(credential.id));

    return { grouped, unassigned };
  }, [parks, dashboardCredentials, parkPasswordCredentials]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [{ data: parkRows, error: parkError }, credentialRows] = await Promise.all([
        supabaseBrowser.from('parks').select('id, name, slug').eq('is_active', true).order('name'),
        fetchStaffCredentials(),
      ]);

      if (parkError) throw parkError;

      setParks(parkRows ?? []);
      setCredentials(credentialRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setFormError(null);
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate(category?: string) {
    setEditingId(null);
    setForm({
      ...emptyForm,
      category: category || '',
    });
    setFormError(null);
    setShowForm(true);
  }

  function startEdit(credential: StaffCredential) {
    setEditingId(credential.id);
    setForm({
      label: credential.label,
      category: credential.category || '',
      person_name: credential.person_name || '',
      login: credential.login || '',
      password: credential.password,
      notes: credential.notes || '',
    });
    setFormError(null);
    setShowForm(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.label.trim() || !form.password.trim()) {
      setFormError('Bezeichnung und Passwort sind Pflichtfelder.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        category: form.category.trim(),
        person_name: form.person_name.trim(),
        login: form.login.trim(),
        password: form.password,
        notes: form.notes.trim(),
      };

      if (editingId) {
        await updateStaffCredential(editingId, payload);
      } else {
        await createStaffCredential(payload);
      }

      resetForm();
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
      if (editingId === cred.id) resetForm();
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Fehler beim Löschen.');
    }
  }

  function renderCredentialRow(cred: StaffCredential) {
    const meta = formatCredentialMeta(cred);

    return (
      <article key={cred.id} className="password-row-card">
        <div className="password-row-main">
          <div className="password-row-head">
            <strong>{cred.label}</strong>
            {cred.category && <span className="marketing-meta-pill subtle">{cred.category}</span>}
          </div>
          {meta && <small>{meta}</small>}
          {cred.notes && <p className="note">{cred.notes}</p>}
        </div>

        <div className="password-row-secret">
          <code>{visible[cred.id] ? cred.password : '••••••••••••'}</code>
        </div>

        <div className="password-row-actions">
          {cred.login && (
            <button
              type="button"
              className="customer-icon-btn"
              onClick={() => copy(`${cred.id}-login`, cred.login || '')}
              aria-label="Login kopieren"
              title={copiedId === `${cred.id}-login` ? 'Login kopiert' : 'Login kopieren'}
            >
              <Users size={14} />
            </button>
          )}
          <button
            type="button"
            className="customer-icon-btn"
            onClick={() => setVisible((prev) => ({ ...prev, [cred.id]: !prev[cred.id] }))}
            aria-label={visible[cred.id] ? 'Passwort verbergen' : 'Passwort anzeigen'}
            title={visible[cred.id] ? 'Verbergen' : 'Anzeigen'}
          >
            {visible[cred.id] ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            className="customer-icon-btn"
            onClick={() => copy(`${cred.id}-password`, cred.password)}
            aria-label="Passwort kopieren"
            title={copiedId === `${cred.id}-password` ? 'Passwort kopiert' : 'Passwort kopieren'}
          >
            <Copy size={14} />
          </button>
          <button type="button" className="customer-icon-btn" onClick={() => startEdit(cred)} aria-label="Bearbeiten" title="Bearbeiten">
            <PencilLine size={14} />
          </button>
          <button type="button" className="customer-icon-btn" onClick={() => onDelete(cred)} aria-label="Löschen" title="Löschen">
            <Trash2 size={14} />
          </button>
        </div>
      </article>
    );
  }

  const showEmpty = !loading && !error && filteredCredentials.length === 0;

  return (
    <div className="card customer-directory-shell password-page-shell">
      <div className="customer-directory-head">
        <div>
          <h2>Passwörter</h2>
        </div>
        <button type="button" className="customer-open-btn" onClick={() => startCreate()}>
          <Plus size={14} />
          Neu
        </button>
      </div>

      <div className="customer-detail-tabs" role="tablist" aria-label="Passwort-Bereiche">
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveView('customer')}
          aria-pressed={activeView === 'customer'}
        >
          <span className="customer-detail-tab-icon">
            <Users size={15} />
          </span>
          <span className="customer-detail-tab-label">Kunden-Zugänge</span>
        </button>
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'all' ? 'active' : ''}`}
          onClick={() => setActiveView('all')}
          aria-pressed={activeView === 'all'}
        >
          <span className="customer-detail-tab-icon">
            <KeyRound size={15} />
          </span>
          <span className="customer-detail-tab-label">Alle Einträge</span>
        </button>
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveView('tools')}
          aria-pressed={activeView === 'tools'}
        >
          <span className="customer-detail-tab-icon">
            <PencilLine size={15} />
          </span>
          <span className="customer-detail-tab-label">Tools & Social</span>
        </button>
      </div>

      <div className="customer-directory-toolbar">
        <label className="customer-directory-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Bezeichnung, Login, Kunde oder Notiz..."
          />
        </label>
      </div>

      {showForm && (
        <div className="customer-simple-card password-form-card">
          <div className="customer-inline-head">
            <div>
              <strong>{editingId ? 'Eintrag bearbeiten' : 'Neuen Eintrag anlegen'}</strong>
            </div>
            <button type="button" className="customer-quiet-btn" onClick={resetForm}>
              Schließen
            </button>
          </div>

          <form onSubmit={onSubmit} className="grid customer-compact-form">
            <div className="row">
              <div>
                <label>Bezeichnung</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="z. B. Imster Bergbahnen – Dashboard-Zugang"
                  required
                />
              </div>
              <div>
                <label>Kategorie</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  list="password-category-suggestions"
                  placeholder="z. B. Dashboard-Zugang"
                />
                <datalist id="password-category-suggestions">
                  {CATEGORY_SUGGESTIONS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="row">
              <div>
                <label>Name</label>
                <input value={form.person_name} onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))} />
              </div>
              <div>
                <label>Login / E-Mail</label>
                <input value={form.login} onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} />
              </div>
            </div>

            <div className="row">
              <div>
                <label>Passwort</label>
                <input
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label>Notiz</label>
                <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {formError && <p className="error">{formError}</p>}

            <div className="customer-machine-actions">
              <button type="submit" className="customer-action-btn" disabled={saving}>
                {saving ? 'Speichert...' : editingId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p className="note">Lädt...</p>}
      {error && <p className="error">{error}</p>}
      {showEmpty && <p className="note">Kein Treffer für „{query}“.</p>}

      {!loading && !error && activeView === 'customer' && (
        <div className="password-customer-grid">
          {customerGroups.grouped.map((group) => (
            <section key={group.park.id} className="password-park-card">
              <div className="customer-inline-head">
                <div>
                  <strong>{group.park.name}</strong>
                  <small>{group.park.slug}</small>
                </div>
                <Link className="customer-quiet-btn" to={`/staff/kunden-management?customer=${group.park.id}&panel=edit&section=access`}>
                  Öffnen
                </Link>
              </div>

              {group.parkPassword && (
                <div className="password-park-password">
                  <span className="marketing-meta-pill subtle">Park-Passwort</span>
                  {renderCredentialRow(group.parkPassword)}
                </div>
              )}

              {group.dashboardUsers.length > 0 && (
                <div className="password-park-users">
                  <span className="marketing-meta-pill subtle">Dashboard-Zugänge</span>
                  <div className="password-row-list">
                    {group.dashboardUsers.map((credential) => renderCredentialRow(credential))}
                  </div>
                </div>
              )}
            </section>
          ))}

          {customerGroups.unassigned.length > 0 && (
            <section className="password-park-card">
              <div className="customer-inline-head">
                <div>
                  <strong>Nicht zugeordnet</strong>
                  <small>Keinem aktiven Kunden direkt zugewiesen</small>
                </div>
              </div>
              <div className="password-row-list">
                {customerGroups.unassigned.map((credential) => renderCredentialRow(credential))}
              </div>
            </section>
          )}

          {!showEmpty && customerGroups.grouped.length === 0 && customerGroups.unassigned.length === 0 && (
            <p className="note">Noch keine Kunden-Zugänge gespeichert.</p>
          )}
        </div>
      )}

      {!loading && !error && activeView === 'all' && (
        <div className="password-section-stack">
          {parkPasswordCredentials.length > 0 && (
            <section className="marketing-block">
              <div className="marketing-block-head">
                <h3>Park-Passwörter</h3>
              </div>
              <div className="password-row-list">{parkPasswordCredentials.map((credential) => renderCredentialRow(credential))}</div>
            </section>
          )}

          {dashboardCredentials.length > 0 && (
            <section className="marketing-block">
              <div className="marketing-block-head">
                <h3>Dashboard-Zugänge</h3>
              </div>
              <div className="password-row-list">{dashboardCredentials.map((credential) => renderCredentialRow(credential))}</div>
            </section>
          )}

          {toolCredentials.length > 0 && (
            <section className="marketing-block">
              <div className="marketing-block-head">
                <h3>Tools & Social</h3>
              </div>
              <div className="password-row-list">{toolCredentials.map((credential) => renderCredentialRow(credential))}</div>
            </section>
          )}

          {otherCredentials.length > 0 && (
            <section className="marketing-block">
              <div className="marketing-block-head">
                <h3>Weitere Einträge</h3>
              </div>
              <div className="password-row-list">{otherCredentials.map((credential) => renderCredentialRow(credential))}</div>
            </section>
          )}
        </div>
      )}

      {!loading && !error && activeView === 'tools' && (
        <div className="password-section-stack">
          <section className="marketing-block">
            <div className="marketing-block-head">
              <h3>Tools & Social</h3>
            </div>
            <div className="password-row-list">
              {[...toolCredentials, ...otherCredentials].map((credential) => renderCredentialRow(credential))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
