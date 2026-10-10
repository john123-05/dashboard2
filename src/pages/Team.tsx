import { useI18n, useLocaleTag } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { UserPlus, Trash2, ShieldCheck, Loader2, Pencil } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import { ASSIGNABLE_PAGES, ROLE_PRESETS, STAFF_DEFAULT_PAGES } from '../lib/permissions';
import { PLAN_LABEL_KEY, useEntitlements, type PlanKey } from '../lib/plans';

// Mitarbeiter je Plan (docs/PRODUKT_PLAN.md, Abschnitt 3.1).
const STAFF_LIMIT: Record<PlanKey, number> = { basis: 3, marketing_starter: 10, marketing_pro: Infinity };

type StaffMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  allowed_pages: string[] | null;
  role_label: string | null;
  disabled_at: string | null;
  last_sign_in_at: string | null;
};

/** Auswahl von Rollenvorlage + Seiten (für Anlegen und Bearbeiten). */
function AccessPicker({
  label,
  pages,
  onChange,
}: {
  label: string | null;
  pages: string[];
  onChange: (label: string | null, pages: string[]) => void;
}) {
  const { t } = useI18n();
  const toggle = (key: string) =>
    onChange(null, pages.includes(key) ? pages.filter((p) => p !== key) : [...pages, key]);
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">{t('team2.role_start')}</p>
        <div className="flex flex-wrap gap-2">
          {ROLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(t(preset.labelKey), [...preset.pages])}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                label === t(preset.labelKey)
                  ? 'border-[color:var(--ink)] bg-[color:var(--ink)] text-white'
                  : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-100'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">{t('team2.choose_pages')}</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ASSIGNABLE_PAGES.map((page) => (
            <label key={page.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-[color:var(--ink-2)] hover:bg-slate-50">
              <input type="checkbox" checked={pages.includes(page.key)} onChange={() => toggle(page.key)} className="h-4 w-4 rounded border-slate-300" />
              {t(page.labelKey)}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Team() {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const { plan } = useEntitlements();
  const limit = STAFF_LIMIT[plan];
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>([...STAFF_DEFAULT_PAGES]);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editLabel, setEditLabel] = useState<string | null>(null);
  const [editPages, setEditPages] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ staff: StaffMember[] }>('manage-staff', {
      method: 'POST',
      body: { action: 'list' },
      useSessionAuth: true,
    });
    if (error) setError(error);
    else setStaff(data?.staff ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    const { error } = await invokeEdgeFunction('manage-staff', {
      method: 'POST',
      body: { action: 'create', full_name: fullName, email, password, role_label: roleLabel, allowed_pages: pages },
      useSessionAuth: true,
    });
    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setNotice(`Mitarbeiter ${email} wurde angelegt.`);
    setFullName('');
    setEmail('');
    setPassword('');
    setRoleLabel(null);
    setPages([...STAFF_DEFAULT_PAGES]);
    load();
  }

  async function mutate(member: StaffMember, body: Record<string, unknown>) {
    setBusyId(member.user_id);
    setError(null);
    const { error } = await invokeEdgeFunction('manage-staff', {
      method: 'POST',
      body: { user_id: member.user_id, ...body },
      useSessionAuth: true,
    });
    setBusyId(null);
    if (error) {
      setError(error);
      return false;
    }
    await load();
    return true;
  }

  function openEdit(member: StaffMember) {
    setEditing(member);
    setEditLabel(member.role_label);
    setEditPages(member.allowed_pages ?? [...STAFF_DEFAULT_PAGES]);
  }

  async function handleDelete(member: StaffMember) {
    if (!confirm(`${t('team2.confirm_remove')} ${member.email ?? member.full_name ?? ''}`)) return;
    setDeletingId(member.user_id);
    const { error } = await invokeEdgeFunction('manage-staff', {
      method: 'POST',
      body: { action: 'delete', user_id: member.user_id },
      useSessionAuth: true,
    });
    setDeletingId(null);
    if (error) {
      setError(error);
      return;
    }
    setStaff((prev) => prev.filter((m) => m.user_id !== member.user_id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">Mitarbeiter</h2>
        <p className="mt-1 text-sm text-slate-500">{t('team2.subtitle')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-[color:var(--line)] bg-slate-50 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-brand-500" />
          <h3 className="text-base font-semibold text-slate-800">{t('team.add_title')}</h3>
        </div>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Max Mustermann"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">E-Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mitarbeiter@park.at"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Passwort (min. 8 Zeichen)
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('team.password_placeholder')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div className="sm:col-span-2">
            <AccessPicker label={roleLabel} pages={pages} onChange={(label, next) => { setRoleLabel(label); setPages(next); }} />
          </div>
          <div className="flex items-end">
            {Number.isFinite(limit) && staff.length >= limit && (
              <p className="mr-3 text-xs text-amber-700">{t('team2.limit_reached', { plan: t(PLAN_LABEL_KEY[plan]), limit })}</p>
            )}
            <button
              type="submit"
              disabled={saving || (Number.isFinite(limit) && staff.length >= limit)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Mitarbeiter anlegen
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-400">
          Der Mitarbeiter meldet sich danach mit dieser E-Mail und dem Passwort auf derselben Login-Seite an.
        </p>
      </div>

      <div className="rounded-2xl border border-[color:var(--line)] bg-slate-50 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h3 className="text-base font-semibold text-slate-800">Mitarbeiter ({staff.length})</h3>
        </div>
        {loading ? (
          <Skeleton lines={3} className="py-3" />
        ) : staff.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">{t('team.none_yet')}</p>
        ) : (
          <ul className="divide-y divide-[color:var(--line)]">
            {staff.map((member) => {
              const disabled = Boolean(member.disabled_at);
              const count = (member.allowed_pages ?? STAFF_DEFAULT_PAGES).length;
              return (
                <li key={member.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>{member.full_name || member.email}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[member.email, member.role_label || (member.allowed_pages ? t('team2.preset_custom') : t('team2.preset_default').split(' (')[0])].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-xs text-[color:var(--ink-3)]">
                      {t('team2.pages_count', { count })} · {t('team2.last_active')}:{' '}
                      {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleDateString(locale) : t('team2.never')}
                    </p>
                  </div>
                  <span className={`status-badge ${disabled ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                    {disabled ? t('team2.status_disabled') : t('team2.status_active')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(member)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100">
                      <Pencil className="h-3.5 w-3.5" /> {t('team2.edit')}
                    </button>
                    <button
                      onClick={() => void mutate(member, { action: disabled ? 'reactivate' : 'deactivate' })}
                      disabled={busyId === member.user_id}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      {disabled ? t('team2.reactivate') : t('team2.deactivate')}
                    </button>
                    <button
                      onClick={() => handleDelete(member)}
                      disabled={deletingId === member.user_id}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      {deletingId === member.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      {t('team2.remove')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)} locked={busyId !== null} panelClassName="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-slate-800">{t('team2.edit_title')}</h3>
          <p className="mb-4 mt-0.5 text-sm text-slate-500">{editing.full_name || editing.email}</p>
          <AccessPicker label={editLabel} pages={editPages} onChange={(label, next) => { setEditLabel(label); setEditPages(next); }} />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="glass-button-secondary" onClick={() => setEditing(null)}>{t('team2.cancel')}</button>
            <button
              type="button"
              className="glass-button-primary"
              disabled={busyId !== null}
              onClick={async () => {
                if (await mutate(editing, { action: 'update', role_label: editLabel, allowed_pages: editPages })) setEditing(null);
              }}
            >
              {busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('team2.save')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
