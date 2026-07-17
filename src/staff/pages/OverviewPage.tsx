import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import { fetchLeadFollowUps, followUpUrgency } from '../lib/leads';

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

function formatRelative(dateStr: string): string {
  const diffMin = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
}

export default function OverviewPage() {
  const [notifications, setNotifications] = useState<StaffNotification[] | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [notes, setNotes] = useState<HandoffNote[] | null>(null);
  const [followUpsToday, setFollowUpsToday] = useState<number | null>(null);
  const [nextCost, setNextCost] = useState<NextCostPayment | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

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

  useEffect(() => {
    void loadNotifications();
    void loadChecklist();
    void loadNotes();
    void loadFollowUpsToday();
    void loadNextCost();
    void (async () => {
      const { data } = await supabaseBrowser.auth.getUser();
      setAdminEmail(data.user?.email ?? null);
    })();
  }, [loadNotifications, loadChecklist, loadNotes, loadFollowUpsToday, loadNextCost]);

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

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Übersicht</h2>
        <p className="note">Benachrichtigungen, Checkliste und Notizen fürs Team an einem Ort.</p>
      </div>

      <div className="grid two" style={{ gap: 16 }}>
        <div className="card">
          <div className="marketing-section-title">
            <h3>Benachrichtigungen</h3>
            {notifications !== null && <span className="note">{notifications.length}</span>}
          </div>

          {notifications === null && <p className="note">Lädt...</p>}
          {notifications !== null && notifications.length === 0 && (
            <p className="note">Keine offenen Benachrichtigungen.</p>
          )}
          {notifications !== null && notifications.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 8 }}>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="row"
                  style={{ alignItems: 'flex-start', gap: 8, borderBottom: '1px solid var(--hairline)', paddingBottom: 8 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                    {n.body && <div className="note" style={{ fontSize: 12 }}>{n.body}</div>}
                    <div className="note" style={{ fontSize: 11 }}>{formatRelative(n.created_at)}</div>
                  </div>
                  <button
                    type="button"
                    className="danger inline"
                    style={{ flex: 'none' }}
                    title="Erledigt"
                    onClick={() => void dismissNotification(n.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Checkliste</h3>
          <form onSubmit={addChecklistItem} className="row" style={{ gap: 8, marginTop: 8 }}>
            <input
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.target.value)}
              placeholder="Neuer Punkt..."
              style={{ flex: 1 }}
            />
            <button type="submit" style={{ flex: 'none', width: 'auto' }}>
              Hinzufügen
            </button>
          </form>

          {checklist === null && <p className="note">Lädt...</p>}
          {checklist !== null && checklist.length === 0 && <p className="note">Noch keine Punkte.</p>}
          {checklist !== null && checklist.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 6, marginTop: 10 }}>
              {checklist.map((item) => (
                <div key={item.id} className="row" style={{ alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={item.is_done} onChange={() => void toggleChecklistItem(item)} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      textDecoration: item.is_done ? 'line-through' : 'none',
                      opacity: item.is_done ? 0.55 : 1,
                    }}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    className="danger inline"
                    style={{ flex: 'none' }}
                    onClick={() => void deleteChecklistItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Notizen (für die nächste Person, die sich einloggt)</h3>
        <form onSubmit={addNote} className="row" style={{ gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Notiz hinterlassen..."
            rows={2}
            style={{ flex: 1 }}
          />
          <button type="submit" style={{ flex: 'none', width: 'auto' }}>
            Speichern
          </button>
        </form>

        {notes === null && <p className="note">Lädt...</p>}
        {notes !== null && notes.length === 0 && <p className="note">Noch keine Notizen.</p>}
        {notes !== null && notes.length > 0 && (
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8, marginTop: 10 }}>
            {notes.map((n) => (
              <div
                key={n.id}
                className="row"
                style={{ alignItems: 'flex-start', gap: 8, borderBottom: '1px solid var(--hairline)', paddingBottom: 8 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: 0 }}>{n.note}</p>
                  <div className="note" style={{ fontSize: 11 }}>
                    {n.author_email || 'Unbekannt'} · {formatRelative(n.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="danger inline"
                  style={{ flex: 'none' }}
                  onClick={() => void deleteNote(n.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 24, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <span>
          Follow-up heute notwendig bei: <strong>{followUpsToday === null ? '…' : followUpsToday}</strong>
        </span>
        <span>
          Nächste Kostenabrechnung für:{' '}
          <strong>{nextCost ? `${nextCost.item_name}${nextCost.payer ? ` (${nextCost.payer})` : ''}` : '–'}</strong>
        </span>
      </div>
    </div>
  );
}
