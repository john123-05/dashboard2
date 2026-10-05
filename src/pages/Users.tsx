import { useEffect, useState } from 'react';
import { Users as UsersIcon, Search, Trophy, Gauge, TrendingDown, TrendingUp, ExternalLink, Trash2, Upload } from 'lucide-react';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import {
  fetchGuestOverview,
  deleteGuest,
  setGuestAvatar,
  deleteGuestAvatar,
  type GuestOverview,
  type GuestDeleteAction,
} from '../lib/guestUsers';
import { accentColorForPark, accentTextColorForPark } from '../lib/parkBrand';
import { claimSiteBaseFor, fetchTodaysSpeeds } from '../lib/photoBrowser';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';

function formatSpeed(value: number | null): string {
  return value != null ? `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km/h` : '—';
}

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
  const { parkId, kioskTimezone } = usePark();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [speeds, setSpeeds] = useState<number[]>([]);
  const [speedsLoading, setSpeedsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overview, setOverview] = useState<GuestOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ email: string; action: GuestDeleteAction } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [avatarBusyEmail, setAvatarBusyEmail] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  // Tagesbeste/-schlechteste/Durchschnitt - unabhaengig vom Kauf.
  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setSpeedsLoading(true);
    fetchTodaysSpeeds(parkId, kioskTimezone)
      .then((v) => active && setSpeeds(v))
      .catch((err) => console.error('Failed to fetch today\'s speeds:', err))
      .finally(() => active && setSpeedsLoading(false));
    return () => {
      active = false;
    };
  }, [parkId, kioskTimezone]);

  // Registrierte Gaeste (nur fuer die Tagesbestenliste eingetragen) + Live-Bestenliste.
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
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAvatarUpload(email: string, file: File) {
    if (!parkId) return;
    setAvatarBusyEmail(email);
    try {
      await setGuestAvatar(parkId, email, file);
      setOverview(await fetchGuestOverview(parkId));
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Hochladen fehlgeschlagen');
    } finally {
      setAvatarBusyEmail(null);
    }
  }

  async function handleAvatarDelete(email: string) {
    if (!parkId) return;
    setAvatarBusyEmail(email);
    try {
      await deleteGuestAvatar(parkId, email);
      setOverview(await fetchGuestOverview(parkId));
      setOverviewError(null);
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    } finally {
      setAvatarBusyEmail(null);
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

  const schnellster = speeds.length ? Math.max(...speeds) : null;
  const langsamster = speeds.length ? Math.min(...speeds) : null;
  const durchschnitt = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

  const filteredGuests = (overview?.users ?? []).filter((u) => {
    if (!guestSearch) return true;
    const s = guestSearch.toLowerCase();
    return u.displayName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <GlassCard className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-emerald-50 p-2.5">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{speedsLoading ? '…' : formatSpeed(schnellster)}</p>
                  <p className="text-xs text-slate-500">Schnellster heute</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-rose-50 p-2.5">
                  <TrendingDown className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{speedsLoading ? '…' : formatSpeed(langsamster)}</p>
                  <p className="text-xs text-slate-500">Langsamster heute</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-50 p-2.5">
                  <Gauge className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{speedsLoading ? '…' : formatSpeed(durchschnitt)}</p>
                  <p className="text-xs text-slate-500">
                    Durchschnitt heute{!speedsLoading && speeds.length > 0 ? ` · ${speeds.length} Messungen` : ''}
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

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
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Eingetragene Gäste</h3>
                {overview && <span className="text-xs text-slate-400">{overview.users.length} registriert</span>}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Nur Gäste, die sich für die Tagesbestenliste eingetragen haben.
              </p>
              <div className="relative mt-3 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Name oder E-Mail suchen…"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="glass-input py-2 pl-9 pr-4 text-sm"
                />
              </div>
            </div>

            <div className="p-6">
              {overviewError && (
                <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{overviewError}</p>
              )}

              {!overview ? (
                <div className="h-24 animate-pulse rounded-xl bg-white/40" />
              ) : filteredGuests.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {guestSearch ? 'Keine Treffer.' : 'Noch kein Gast hat sich eingetragen.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredGuests.map((u) => {
                    const confirming = pendingDelete?.email === u.email ? pendingDelete : null;
                    const avatarBusy = avatarBusyEmail === u.email;
                    const inputId = `avatar-input-${u.email}`;
                    return (
                      <li key={u.email} className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-slate-100 text-sm font-semibold text-slate-600">
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
                        </div>

                        {!confirming && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <input
                              id={inputId}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void handleAvatarUpload(u.email, file);
                              }}
                            />
                            <button
                              type="button"
                              disabled={avatarBusy}
                              onClick={() => document.getElementById(inputId)?.click()}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              {avatarBusy ? '…' : u.avatarUrl ? 'Bild ersetzen' : 'Bild hochladen'}
                            </button>
                            {u.avatarUrl && (
                              <button
                                type="button"
                                disabled={avatarBusy}
                                onClick={() => void handleAvatarDelete(u.email)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                              >
                                Bild löschen
                              </button>
                            )}
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
            </div>
          </GlassCard>
        </div>

        {parkId && (
          <GlassCard className="flex flex-col overflow-hidden p-0">
            <div
              className="flex flex-col gap-2 px-4 py-3"
              style={{ backgroundColor: accentColorForPark(parkId), color: accentTextColorForPark(parkId) }}
            >
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="text-sm font-semibold">Live-Vorschau · Tagesbestenliste</span>
              </div>
              {claimSiteBaseFor(parkId) && (
                <a
                  href={`${claimSiteBaseFor(parkId)}/ranking`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-black/10 px-3 py-1.5 text-xs font-medium transition hover:bg-black/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Im Browser öffnen
                </a>
              )}
            </div>
            {claimSiteBaseFor(parkId) ? (
              <iframe
                src={`${claimSiteBaseFor(parkId)}/ranking`}
                title="Live-Vorschau der Tagesbestenliste"
                scrolling="yes"
                className="w-full min-h-[1000px] flex-1 border-0"
              />
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">Für diesen Park gibt es noch keine Bestenlisten-Seite.</p>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
