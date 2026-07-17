import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Camera, CalendarClock, Euro, ListChecks, Receipt, StickyNote } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase';
import { fetchLeadFollowUps, followUpUrgency } from '../lib/leads';
import { fetchRecentPhotos, type BrowsablePhoto } from '../../lib/photoBrowser';
import { todayInTimezone } from '../../lib/kioskSales';
import { formatCurrency } from '../../lib/utils';

interface StaffNotification {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  dismissed_at: string | null;
}

interface ChecklistItem {
  id: string;
  text: string;
  is_done: boolean;
  created_at: string;
}

interface HandoffNote {
  id: string;
  note: string;
  author_email: string | null;
  created_at: string;
}

interface NextCostPayment {
  item_name: string;
  payer: string | null;
  next_due_date: string;
}

interface ParkOption {
  id: string;
  name: string;
  price_per_photo_cents: number | null;
  timezone: string | null;
}

interface ParkTodayStats {
  soldToday: number;
  revenueCents: number | null;
}

function formatRelative(dateStr: string): string {
  const diffMin = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
}

function notificationAccent(title: string): 'blue' | 'amber' | 'rose' | 'green' {
  const t = title.toLowerCase();
  if (t.includes('keine neuen bilder') || t.includes('inaktiv')) return 'amber';
  if (t.includes('zahlung') || t.includes('fällig')) return 'rose';
  if (t.includes('support') || t.includes('antwort')) return 'blue';
  return 'green';
}

export default function OverviewPage() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<StaffNotification[] | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [notes, setNotes] = useState<HandoffNote[] | null>(null);
  const [followUpsToday, setFollowUpsToday] = useState<number | null>(null);
  const [nextCost, setNextCost] = useState<NextCostPayment | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  const [parks, setParks] = useState<ParkOption[] | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [parkPhotos, setParkPhotos] = useState<BrowsablePhoto[] | null>(null);
  const [parkStats, setParkStats] = useState<ParkTodayStats | null>(null);

  const [newChecklistText, setNewChecklistText] = useState('');
  const [newNoteText, setNewNoteText] = useState('');

  const loadNotifications = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from('staff_notifications')
      .select('id, title, body, url, created_at, dismissed_at')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications((data || []) as StaffNotification[]);
  }, []);

  const loadChecklist = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from('staff_checklist_items')
      .select('id, text, is_done, created_at')
      .order('created_at', { ascending: true });
    setChecklist((data || []) as ChecklistItem[]);
  }, []);

  const loadNotes = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from('staff_handoff_notes')
      .select('id, note, author_email, created_at')
      .order('created_at', { ascending: false });
    setNotes((data || []) as HandoffNote[]);
  }, []);

  const loadFollowUpsToday = useCallback(async () => {
    try {
      const followUps = await fetchLeadFollowUps();
      const dueCount = followUps.filter((f) => {
        const urgency = followUpUrgency(f.next_due_at);
        return urgency === 'today' || urgency === 'overdue';
      }).length;
      setFollowUpsToday(dueCount);
    } catch {
      setFollowUpsToday(null);
    }
  }, []);

  const loadNextCost = useCallback(async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseBrowser
      .from('cost_items')
      .select('item_name, payer, next_due_date')
      .not('next_due_date', 'is', null)
      .gte('next_due_date', todayStr)
      .order('next_due_date', { ascending: true })
      .limit(1);
    setNextCost((data && (data[0] as NextCostPayment)) || null);
  }, []);

  const loadParks = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from('parks')
      .select('id, name, price_per_photo_cents, timezone, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    const list = (data || []) as ParkOption[];
    list.sort((a, b) => {
      const aImst = a.name.toLowerCase().includes('imst') ? 0 : 1;
      const bImst = b.name.toLowerCase().includes('imst') ? 0 : 1;
      if (aImst !== bImst) return aImst - bImst;
      return a.name.localeCompare(b.name);
    });

    setParks(list);
    setSelectedParkId((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  const loadParkSnapshot = useCallback(async (park: ParkOption) => {
    const [photos, salesResult] = await Promise.all([
      fetchRecentPhotos(park.id, 12).catch(() => []),
      supabaseBrowser
        .from('park_photo_sales_daily')
        .select('business_date, photos_sold_count')
        .eq('park_id', park.id),
    ]);
    setParkPhotos(photos);

    const salesRows = (salesResult.data || []) as { business_date: string; photos_sold_count: number }[];
    if (park.timezone) {
      const today = todayInTimezone(park.timezone);
      const soldToday = salesRows
        .filter((r) => r.business_date === today)
        .reduce((sum, r) => sum + r.photos_sold_count, 0);
      setParkStats({
        soldToday,
        revenueCents: park.price_per_photo_cents != null ? soldToday * park.price_per_photo_cents : null,
      });
    } else {
      setParkStats(null);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadChecklist();
    void loadNotes();
    void loadFollowUpsToday();
    void loadNextCost();
    void loadParks();
    void (async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      setAdminEmail(data.user?.email ?? null);
    })();
  }, [loadNotifications, loadChecklist, loadNotes, loadFollowUpsToday, loadNextCost, loadParks]);

  useEffect(() => {
    if (!selectedParkId || !parks) return;
    const park = parks.find((p) => p.id === selectedParkId);
    if (park) void loadParkSnapshot(park);
  }, [selectedParkId, parks, loadParkSnapshot]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel('overview-notifications-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_notifications' }, () => {
        void loadNotifications();
      })
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadNotifications]);

  async function dismissNotification(id: string) {
    setNotifications((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    await supabaseBrowser.from('staff_notifications').update({ dismissed_at: new Date().toISOString() }).eq('id', id);
  }

  async function addChecklistItem(e: FormEvent) {
    e.preventDefault();
    const trimmed = newChecklistText.trim();
    if (!trimmed) return;
    setNewChecklistText('');
    await supabaseBrowser.from('staff_checklist_items').insert({ text: trimmed, created_by: adminEmail });
    await loadChecklist();
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    setChecklist((prev) => (prev ? prev.map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i)) : prev));
    await supabaseBrowser.from('staff_checklist_items').update({ is_done: !item.is_done }).eq('id', item.id);
  }

  async function deleteChecklistItem(id: string) {
    setChecklist((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    await supabaseBrowser.from('staff_checklist_items').delete().eq('id', id);
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const trimmed = newNoteText.trim();
    if (!trimmed) return;
    setNewNoteText('');
    await supabaseBrowser.from('staff_handoff_notes').insert({ note: trimmed, author_email: adminEmail });
    await loadNotes();
  }

  async function deleteNote(id: string) {
    setNotes((prev) => (prev ? prev.filter((n) => n.id !== id) : prev));
    await supabaseBrowser.from('staff_handoff_notes').delete().eq('id', id);
  }

  const selectedPark = parks?.find((p) => p.id === selectedParkId) ?? null;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid three">
        <div className="card">
          <div className="marketing-section-title">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <Bell size={17} /> Benachrichtigungen
            </h3>
            {notifications !== null && <span className="note">{notifications.length}</span>}
          </div>

          {notifications === null && <p className="note">Lädt...</p>}
          {notifications !== null && notifications.length === 0 && (
            <p className="note">Keine offenen Benachrichtigungen.</p>
          )}
          {notifications !== null && notifications.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 6, marginTop: 8 }}>
              {notifications.map((n) => {
                const accent = notificationAccent(n.title);
                return (
                  <div key={n.id} className="feed-row" onClick={() => n.url && navigate(n.url)}>
                    <div className={`metric-icon sm ${accent}`}>
                      <Bell size={15} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="feed-row-title">{n.title}</p>
                      {n.body && <p className="feed-row-body">{n.body}</p>}
                      <p className="feed-row-time">{formatRelative(n.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      className="feed-dismiss"
                      title="Erledigt"
                      onClick={(e) => {
                        e.stopPropagation();
                        void dismissNotification(n.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="marketing-section-title">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <ListChecks size={17} /> Checkliste
            </h3>
          </div>
          <form onSubmit={addChecklistItem} className="row" style={{ gap: 8, marginTop: 8 }}>
            <input
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              placeholder="Neuer Punkt..."
              style={{ flex: 1 }}
            />
            <button type="submit" style={{ flex: 'none', width: 'auto' }}>
              +
            </button>
          </form>

          {checklist === null && <p className="note">Lädt...</p>}
          {checklist !== null && checklist.length === 0 && <p className="note">Noch keine Punkte.</p>}
          {checklist !== null && checklist.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 10 }}>
              {checklist.map((item) => (
                <div key={item.id} className="checklist-row">
                  <input type="checkbox" checked={item.is_done} onChange={() => void toggleChecklistItem(item)} />
                  <span className={`checklist-row-text ${item.is_done ? 'done' : ''}`}>{item.text}</span>
                  <button
                    type="button"
                    className="feed-dismiss"
                    style={{ flexShrink: 0 }}
                    onClick={() => void deleteChecklistItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="postit">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 0 }}>
            <StickyNote size={17} /> Notizen
          </h3>
          <form onSubmit={addNote} style={{ marginTop: 8 }}>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Notiz für die nächste Schicht..."
              rows={2}
            />
            <button type="submit" style={{ width: 'auto', marginTop: 8, flexShrink: 0 }}>
              Anheften
            </button>
          </form>

          {notes !== null && notes.length > 0 && (
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 14 }}>
              {notes.map((n) => (
                <div key={n.id} className="postit-entry">
                  <p className="postit-entry-text">{n.note}</p>
                  <div className="postit-entry-meta">
                    <span>
                      {n.author_email || 'Unbekannt'} · {formatRelative(n.created_at)}
                    </span>
                    <button type="button" className="postit-entry-delete" onClick={() => void deleteNote(n.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card mini-card">
          <div className="metric-icon sm blue">
            <CalendarClock size={16} />
          </div>
          <div>
            <p className="mini-card-label">Follow-up heute notwendig bei</p>
            <p className="mini-card-value">{followUpsToday === null ? '…' : followUpsToday}</p>
          </div>
        </div>
        <div className="card mini-card">
          <div className="metric-icon sm purple">
            <Receipt size={16} />
          </div>
          <div>
            <p className="mini-card-label">Nächste Kostenabrechnung für</p>
            <p className="mini-card-value">
              {nextCost ? `${nextCost.item_name}${nextCost.payer ? ` (${nextCost.payer})` : ''}` : '–'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Camera size={17} /> Kundenfotos &amp; Umsatz
          </h3>
        </div>

        {parks !== null && parks.length > 0 && (
          <select
            value={selectedParkId ?? ''}
            onChange={(e) => setSelectedParkId(e.target.value)}
            style={{ maxWidth: 320, marginTop: 8 }}
          >
            {parks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <div className="grid two" style={{ marginTop: 14 }}>
          <div className="card metric-card">
            <div>
              <p className="metric-card-label">Umsatz heute{selectedPark ? ` · ${selectedPark.name}` : ''}</p>
              <p className="metric-card-value">
                {parkStats?.revenueCents != null ? formatCurrency(parkStats.revenueCents, 'eur') : '–'}
              </p>
            </div>
            <div className="metric-icon green">
              <Euro size={18} />
            </div>
          </div>
          <div className="card metric-card">
            <div>
              <p className="metric-card-label">Fotos verkauft heute</p>
              <p className="metric-card-value">{parkStats ? parkStats.soldToday : '–'}</p>
            </div>
            <div className="metric-icon blue">
              <Camera size={18} />
            </div>
          </div>
        </div>

        {parkPhotos !== null && parkPhotos.length > 0 && (
          <div className="park-photo-grid">
            {parkPhotos.map((photo) =>
              photo.imageUrl ? (
                <a key={photo.id} className="park-photo-thumb" href={photo.imageUrl} target="_blank" rel="noreferrer">
                  <img src={photo.imageUrl} alt={photo.externalCode ?? 'Foto'} loading="lazy" />
                </a>
              ) : null,
            )}
          </div>
        )}
        {parkPhotos !== null && parkPhotos.length === 0 && (
          <p className="note" style={{ marginTop: 12 }}>
            Keine aktuellen Fotos für diesen Park.
          </p>
        )}
      </div>
    </div>
  );
}
