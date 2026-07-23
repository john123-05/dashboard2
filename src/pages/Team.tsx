import { useEffect, useState } from 'react';
import { UserPlus, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';

type StaffMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

export default function Team() {
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
      body: { action: 'create', full_name: fullName, email, password },
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
    load();
  }

  async function handleDelete(member: StaffMember) {
    if (!confirm(`Mitarbeiter ${member.email ?? member.full_name ?? ''} wirklich entfernen?`)) return;
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
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Mitarbeiter</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lege Mitarbeiter-Zugänge für deinen Park an. Mitarbeiter sehen nur <strong>Fotos</strong>,{' '}
          <strong>Personalisierung</strong>, <strong>Support</strong> und <strong>Systemzustand</strong> — keine
          Umsätze, Käufe oder Einstellungen.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-brand-500" />
          <h3 className="text-base font-semibold text-slate-800">Neuen Mitarbeiter anlegen</h3>
        </div>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Max Mustermann"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">E-Mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mitarbeiter@park.at"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Passwort (min. 8 Zeichen)
            </label>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Passwort vergeben"
              className="w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-400"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
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

      <div className="rounded-2xl border border-white/40 bg-white/40 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-500" />
          <h3 className="text-base font-semibold text-slate-800">Mitarbeiter ({staff.length})</h3>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
          </div>
        ) : staff.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">Noch keine Mitarbeiter angelegt.</p>
        ) : (
          <ul className="divide-y divide-slate-200/60">
            {staff.map((member) => (
              <li key={member.user_id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{member.full_name || member.email}</p>
                  <p className="text-xs text-slate-500">{member.email}</p>
                </div>
                <button
                  onClick={() => handleDelete(member)}
                  disabled={deletingId === member.user_id}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  {deletingId === member.user_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
