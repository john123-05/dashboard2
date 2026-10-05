import { useEffect, useState } from 'react';
import { Users as UsersIcon, Search, Trash2, Trophy } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { formatDate, formatCurrency } from '../lib/utils';
import { fetchGuestActivity, type GuestActivityRow } from '../lib/guestActivity';
import { fetchGuestOverview, deleteGuest, type GuestOverview, type GuestDeleteAction } from '../lib/guestUsers';
import { accentColorForPark, accentTextColorForPark } from '../lib/parkBrand';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

interface CustomerRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  opted_in_marketing: boolean;
  created_at: string;
  purchase_count: number;
  total_spent: number;
}

export default function Users() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guestActivity, setGuestActivity] = useState<GuestActivityRow[]>([]);
  const [guestActivityLoading, setGuestActivityLoading] = useState(true);
  const [overview, setOverview] = useState<GuestOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ email: string; action: GuestDeleteAction } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, [parkId]);

  useEffect(() => {
    if (!parkId) return;
    setGuestActivityLoading(true);
    fetchGuestActivity(parkId)
      .then(setGuestActivity)
      .catch((err) => console.error('Failed to fetch guest activity:', err))
      .finally(() => setGuestActivityLoading(false));
  }, [parkId]);

  // Registrierte Gaeste + Live-Bestenliste, alle 30 s aktualisiert.
  useEffect(() => {
    if (!parkId) return;
    let cancelled = false;
    const load = () =>
      fetchGuestOverview(parkId)
        .then((data) => {
          if (cancelled) return;
          setOverview(data);
          setOverviewError(null);
        })
        .catch((err) => {
          if (!cancelled) setOverviewError(err instanceof Error ? err.message : 'Fehler beim Laden');
        });
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [parkId]);

  async function confirmDelete() {
    if (!parkId || !pendingDelete) return;
    setDeleting(true);
    try {
      await deleteGuest(parkId, pendingDelete.email, pendingDelete.action);
      setPendingDelete(null);
      setOverview(await fetchGuestOverview(parkId));
      fetchGuestActivity(parkId).then(setGuestActivity).catch(() => {});
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  }

  async function loadData() {
    setLoading(true);
    const { data, error: invokeError } = await invokeEdgeFunction('external-users', {
      query: { park_id: parkId || undefined },
    });

    if (invokeError) {
      console.error('Failed to fetch external users:', invokeError);
      if (isEdgeSourceUnavailable(invokeError)) {
        setCustomers([]);
        setNotice(getOptionalSourceWarning('User feed', invokeError));
        setError(null);
        setLoading(false);
        return;
      }
      setError(invokeError);
      setLoading(false);
      return;
    }

    const customersRes = { data: data?.customers ?? [] } as { data: any[] };
    const purchasesRes = { data: data?.purchases ?? [] } as { data: any[] };

    const purchasesByCustomer = new Map<string, { count: number; total: number }>();
    (purchasesRes.data || [])
      .filter((p) => p.status === 'completed')
      .forEach((p) => {
        const entry = purchasesByCustomer.get(p.customer_id) || { count: 0, total: 0 };
        entry.count += 1;
        entry.total += p.amount_cents;
        purchasesByCustomer.set(p.customer_id, entry);
      });

    const rows: CustomerRow[] = (customersRes.data || []).map((c) => {
      const stats = purchasesByCustomer.get(c.id) || { count: 0, total: 0 };
      return {
        ...c,
        purchase_count: stats.count,
        total_spent: stats.total,
      };
    });

    rows.sort((a, b) => b.total_spent - a.total_spent);
    setCustomers(rows);
    setNotice(null);
    setError(null);
    setLoading(false);
  }

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(s) ||
      c.full_name?.toLowerCase().includes(s) ||
      c.phone?.includes(s)
    );
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="h-96 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('users.title')}</h2>
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Users</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="glass-button-secondary">
            {t('app.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('users.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('users.subtitle')}
        </p>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">User data is currently unavailable.</p>
          <p className="mt-1 text-sm text-amber-700">{notice}</p>
        </div>
      )}

      {parkId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <GlassCard className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Gäste in der Tagesbestenliste
              </h3>
              {overview && <span className="text-xs text-slate-400">{overview.users.length} registriert</span>}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Erscheint hier, sobald ein Gast auf der Fotoseite seinen Namen für die Bestenliste einträgt.
            </p>

            {overviewError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{overviewError}</p>
            )}

            {!overview ? (
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/40" />
            ) : overview.users.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">Noch kein Gast hat sich eingetragen.</p>
            ) : (
              <ul className="mt-3 max-h-[26rem] divide-y divide-slate-100 overflow-y-auto">
                {overview.users.map((u) => {
                  const confirming = pendingDelete?.email === u.email ? pendingDelete : null;
                  return (
                    <li key={u.email} className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-slate-100 text-sm font-semibold text-slate-600">
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (u.displayName[0] || '?').toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {u.displayName}
                            {u.leaderboardOptOut && (
                              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                nicht gelistet
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {u.email}
                            {u.bestSpeedKmh !== null ? ` · Bestwert ${u.bestSpeedKmh.toFixed(1)} km/h` : ''}
                            {u.claimCount > 0 ? ` · ${u.claimCount} Foto${u.claimCount === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                        {!confirming && (
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPendingDelete({ email: u.email, action: 'delete_profile' })}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              Profil löschen
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete({ email: u.email, action: 'delete_user' })}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Benutzer löschen
                            </button>
                          </div>
                        )}
                      </div>
                      {confirming && (
                        <div className="mt-2 rounded-xl border border-red-100 bg-red-50/70 p-3">
                          <p className="text-xs text-red-800">
                            {confirming.action === 'delete_profile'
                              ? `Profil von „${u.displayName}" löschen? Name, Profilbild und Bestenlisten-Eintrag werden entfernt. Freischaltungen und Fotos bleiben.`
                              : `Benutzer „${u.displayName}" löschen? Zusätzlich werden Name, E-Mail, Telefon und Adresse in den Freischaltungen geleert und das Marketing-Opt-in entzogen. Das lässt sich nicht rückgängig machen.`}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={confirmDelete}
                              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                            >
                              {deleting ? 'Lösche…' : 'Ja, löschen'}
                            </button>
                            <button
                              type="button"
                              disabled={deleting}
                              onClick={() => setPendingDelete(null)}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!guestActivityLoading && guestActivity.filter((g) => g.displayName).length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Heute dabei</p>
                <p className="mt-1 text-sm text-slate-600">
                  {guestActivity
                    .filter((g) => g.displayName)
                    .slice(0, 8)
                    .map((g) => g.displayName)
                    .join(', ')}
                  {guestActivity.filter((g) => g.displayName).length > 8
                    ? ` und ${guestActivity.filter((g) => g.displayName).length - 8} weitere`
                    : ''}
                </p>
              </div>
            )}
          </GlassCard>

          <GlassCard className="self-start overflow-hidden p-0">
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ backgroundColor: accentColorForPark(parkId), color: accentTextColorForPark(parkId) }}
            >
              <Trophy className="h-4 w-4" />
              <span className="text-sm font-semibold">Live-Vorschau · Tagesbestenliste</span>
            </div>
            <div className="p-4">
              {!overview ? (
                <div className="h-40 animate-pulse rounded-xl bg-white/40" />
              ) : overview.leaderboard.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">
                  Heute noch keine freigeschalteten Fahrten mit Messung.
                </p>
              ) : (
                <ol className="space-y-1.5">
                  {overview.leaderboard.rows.map((r) => (
                    <li
                      key={`${r.rank}-${r.capturedAt}`}
                      className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-white/60 px-2.5 py-2"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={
                          r.rank <= 3
                            ? { backgroundColor: accentColorForPark(parkId), color: accentTextColorForPark(parkId) }
                            : { backgroundColor: '#f1f5f9', color: '#64748b' }
                        }
                      >
                        {r.rank}
                      </span>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          ((r.displayName || 'G')[0] || 'G').toUpperCase()
                        )}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{r.displayName || 'Gast'}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                        {r.speedKmh.toFixed(1)} <span className="text-xs font-normal text-slate-400">km/h</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {overview && overview.leaderboard.totalToday > 0 && (
                <p className="mt-3 text-center text-xs text-slate-400">
                  {overview.leaderboard.totalToday} gewertete Fahrten heute · aktualisiert sich automatisch
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{customers.length}</p>
              <p className="text-xs text-slate-500">{t('users.total')}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {customers.filter((c) => c.purchase_count > 0).length}
              </p>
              <p className="text-xs text-slate-500">{t('users.paying')}</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-50 p-2.5">
              <UsersIcon className="h-5 w-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">
                {customers.filter((c) => c.opted_in_marketing).length}
              </p>
              <p className="text-xs text-slate-500">{t('users.optins')}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="border-b border-slate-100/80 px-6 py-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('users.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input py-2 pl-9 pr-4 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100/80">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.customer')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.contact')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.purchases')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.total_spent')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.joined')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{t('users.table.marketing')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 20).map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-white/40">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {(c.full_name || 'A')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-slate-800">{c.full_name || t('app.unknown')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-600">{c.email || c.phone || '-'}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-slate-700">{c.purchase_count}</td>
                  <td className="px-6 py-3.5 text-sm font-semibold text-slate-800">
                    {c.total_spent > 0 ? formatCurrency(c.total_spent) : '-'}
                  </td>
                  <td className="px-6 py-3.5 text-sm text-slate-500">{formatDate(c.created_at)}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`status-badge ${
                        c.opted_in_marketing
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-50 text-slate-500 ring-slate-200'
                      }`}
                    >
                      {c.opted_in_marketing ? t('leads.opted_in') : t('leads.opted_out')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 20 && (
          <div className="border-t border-slate-100/80 px-6 py-3 text-center text-xs text-slate-400">
            Showing 20 of {filtered.length} customers
          </div>
        )}
      </GlassCard>
    </div>
  );
}
