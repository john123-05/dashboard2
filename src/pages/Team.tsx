import { useI18n, useLocaleTag } from '../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { UserPlus, Trash2, Loader2, Pencil, MoreHorizontal, Power, Users } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
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

function initials(member: StaffMember): string {
  const source = (member.full_name || member.email || '?').trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

/** Zeilenmenü: schließt bei Klick daneben und mit Esc. */
function RowMenu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-md p-1.5 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-lg border border-[color:var(--line)] bg-white py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);

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
    setNotice(t('team3.created', { email }));
    setInviteOpen(false);
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
    setDeletingId(member.user_id);
    const { error } = await invokeEdgeFunction('manage-staff', {
      method: 'POST',
      body: { action: 'delete', user_id: member.user_id },
      useSessionAuth: true,
    });
    setDeletingId(null);
    setRemoveTarget(null);
    if (error) {
      setError(error);
      return;
    }
    setStaff((prev) => prev.filter((m) => m.user_id !== member.user_id));
  }

  const atLimit = Number.isFinite(limit) && staff.length >= limit;
  const field = 'w-full rounded-lg border border-[color:var(--line-strong)] bg-white px-3 py-2 text-sm text-[color:var(--ink)] outline-none focus:border-brand-500';
  const pageLabel = (key: string) => {
    const page = ASSIGNABLE_PAGES.find((p) => p.key === key);
    return page ? t(page.labelKey) : key;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[28px] font-light tracking-tight text-[color:var(--ink)] sm:text-[32px]">Mitarbeiter</h2>
          <p className="mt-1 text-sm text-[color:var(--ink-3)]">{t('team2.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-[color:var(--ink)]">
              {Number.isFinite(limit) ? t('team3.counter', { count: staff.length, limit }) : t('team3.counter_unlimited', { count: staff.length })}
            </p>
            <p className="text-xs text-[color:var(--ink-3)]">{t(PLAN_LABEL_KEY[plan])}</p>
          </div>
          <button type="button" onClick={() => setInviteOpen(true)} disabled={atLimit} className="glass-button-primary disabled:opacity-50">
            <UserPlus className="h-4 w-4" />
            {t('team3.invite')}
          </button>
        </div>
      </div>

      {atLimit && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('team2.limit_reached', { plan: t(PLAN_LABEL_KEY[plan]), limit })}
        </p>
      )}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {loading ? (
        <Skeleton lines={4} className="py-3" />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          text={t('team3.empty')}
          action={
            <button type="button" onClick={() => setInviteOpen(true)} className="glass-button-primary">
              <UserPlus className="h-4 w-4" /> {t('team3.invite')}
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[color:var(--line)] bg-white">
          <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_90px_40px] gap-4 border-b border-[color:var(--line)] bg-slate-50 px-4 py-2.5 text-xs font-medium text-[color:var(--ink-3)] md:grid">
            <span>{t('team3.col_person')}</span>
            <span>{t('team3.col_role')}</span>
            <span>{t('team3.col_access')}</span>
            <span>{t('team3.col_active')}</span>
            <span>{t('team3.col_status')}</span>
            <span />
          </div>
          <ul className="divide-y divide-[color:var(--line)]">
            {staff.map((member) => {
              const disabled = Boolean(member.disabled_at);
              const pageKeys = member.allowed_pages ?? [...STAFF_DEFAULT_PAGES];
              const role = member.role_label || (member.allowed_pages ? t('team2.preset_custom') : t('team2.preset_default').split(' (')[0]);
              const shown = pageKeys.slice(0, 3);
              const busy = busyId === member.user_id || deletingId === member.user_id;
              return (
                <li
                  key={member.user_id}
                  className="grid items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_90px_40px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-700'}`}>
                      {initials(member)}
                    </span>
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-medium ${disabled ? 'text-slate-400' : 'text-[color:var(--ink)]'}`}>{member.full_name || member.email}</p>
                      <p className="truncate text-xs text-[color:var(--ink-3)]">{member.email}</p>
                    </div>
                    <div className="ml-auto md:hidden">
                      <span className={`status-badge ${disabled ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                        {disabled ? t('team2.status_disabled') : t('team2.status_active')}
                      </span>
                    </div>
                  </div>
                  <p className="truncate text-sm text-[color:var(--ink-2)]">{role}</p>
                  <div className="flex flex-wrap gap-1">
                    {pageKeys.length === 0 && <span className="text-xs text-[color:var(--ink-3)]">{t('team3.no_pages')}</span>}
                    {shown.map((key) => (
                      <span key={key} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-[color:var(--ink-2)]">{pageLabel(key)}</span>
                    ))}
                    {pageKeys.length > shown.length && (
                      <span
                        title={pageKeys.slice(3).map(pageLabel).join(', ')}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-[color:var(--ink-3)]"
                      >
                        +{pageKeys.length - shown.length}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[color:var(--ink-2)]">
                    <span className="text-xs text-[color:var(--ink-3)] md:hidden">{t('team2.last_active')}: </span>
                    {member.last_sign_in_at ? new Date(member.last_sign_in_at).toLocaleDateString(locale) : t('team2.never')}
                  </p>
                  <span className="hidden md:block">
                    <span className={`status-badge ${disabled ? 'bg-slate-50 text-slate-500 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                      {disabled ? t('team2.status_disabled') : t('team2.status_active')}
                    </span>
                  </span>
                  <div className="flex justify-end">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[color:var(--ink-3)]" />
                    ) : (
                      <RowMenu label={t('team3.more')}>
                        {(close) => (
                          <>
                            <button role="menuitem" onClick={() => { close(); openEdit(member); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--ink-2)] hover:bg-slate-50">
                              <Pencil className="h-3.5 w-3.5" /> {t('team2.edit')}
                            </button>
                            <button
                              role="menuitem"
                              onClick={() => { close(); void mutate(member, { action: disabled ? 'reactivate' : 'deactivate' }); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[color:var(--ink-2)] hover:bg-slate-50"
                            >
                              <Power className="h-3.5 w-3.5" /> {disabled ? t('team2.reactivate') : t('team2.deactivate')}
                            </button>
                            <button role="menuitem" onClick={() => { close(); setRemoveTarget(member); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
                              <Trash2 className="h-3.5 w-3.5" /> {t('team2.remove')}
                            </button>
                          </>
                        )}
                      </RowMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {inviteOpen && (
        <Modal onClose={() => setInviteOpen(false)} locked={saving} labelledBy="team-invite" panelClassName="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <h3 id="team-invite" className="text-lg font-semibold text-[color:var(--ink)]">{t('team3.invite')}</h3>
          <p className="mb-4 mt-0.5 text-sm text-[color:var(--ink-3)]">{t('team3.invite_sub')}</p>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              {t('team3.name')}
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Max Mustermann" className={`mt-1 ${field}`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t('team3.email')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mitarbeiter@park.at" className={`mt-1 ${field}`} />
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              {t('team3.password')}
              <input type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('team.password_placeholder')} className={`mt-1 ${field}`} />
            </label>
            <div className="sm:col-span-2">
              <AccessPicker label={roleLabel} pages={pages} onChange={(label, next) => { setRoleLabel(label); setPages(next); }} />
            </div>
            <p className="text-xs text-[color:var(--ink-3)] sm:col-span-2">{t('team3.login_note')}</p>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="glass-button-secondary" onClick={() => setInviteOpen(false)} disabled={saving}>{t('team2.cancel')}</button>
              <button type="submit" disabled={saving || atLimit} className="glass-button-primary disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {t('team3.create')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {removeTarget && (
        <Modal onClose={() => setRemoveTarget(null)} locked={deletingId !== null} labelledBy="team-remove" panelClassName="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h3 id="team-remove" className="text-lg font-semibold text-[color:var(--ink)]">{t('team3.remove_title')}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-2)]">
            {t('team3.remove_text', { name: removeTarget.full_name || removeTarget.email || '' })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="glass-button-secondary" onClick={() => setRemoveTarget(null)} disabled={deletingId !== null}>{t('team2.cancel')}</button>
            <button
              type="button"
              disabled={deletingId !== null}
              onClick={() => void handleDelete(removeTarget)}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('team2.remove')}
            </button>
          </div>
        </Modal>
      )}

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
