import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import { edgeFetch } from '../lib/edge-fetch';
import { getApiErrorMessage } from '../lib/api-error';
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from '../lib/types';

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

function isArchivedStatus(status: SupportTicketStatus): boolean {
  return status === 'resolved' || status === 'closed';
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

export default function SupportTicketKundenPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [parkNameById, setParkNameById] = useState<Record<string, string>>({});
  const [viewingArchived, setViewingArchived] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [replyMessage, setReplyMessage] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const selectedTicketIdRef = useRef<string | null>(null);
  const [initialTicketParam] = useState(() => new URLSearchParams(window.location.search).get('ticket'));
  const appliedDeepLinkRef = useRef(false);

  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => !isArchivedStatus(ticket.status)),
    [tickets],
  );
  const archivedTickets = useMemo(
    () => tickets.filter((ticket) => isArchivedStatus(ticket.status)),
    [tickets],
  );
  const visibleTickets = viewingArchived ? archivedTickets : activeTickets;

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [tickets, selectedTicketId],
  );

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);

    const { data, error } = await supabaseBrowser
      .from('support_tickets')
      .select('id, organization_id, created_by, subject, description, status, priority, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      setTicketsError(error.message);
      setTicketsLoading(false);
      return;
    }

    setTickets((data || []) as SupportTicket[]);
    setTicketsError(null);
    setTicketsLoading(false);
  }, []);

  const loadMessagesForTicket = useCallback(async (ticketId: string) => {
    setMessagesLoading(true);

    const { data, error } = await supabaseBrowser
      .from('support_ticket_messages')
      .select('id, ticket_id, organization_id, author_id, author_role, message, created_at, updated_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      setMessagesError(error.message);
      setMessagesLoading(false);
      return;
    }

    setMessages((data || []) as SupportTicketMessage[]);
    setMessagesError(null);
    setMessagesLoading(false);
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    // organization_id on support_tickets is actually the shared project's
    // real park_id (see support-tickets edge function in dashboard2) —
    // resolve it to a name instead of showing a raw UUID.
    void (async () => {
      const { data } = await supabaseBrowser.from('parks').select('id, name');
      if (!data) return;
      setParkNameById(Object.fromEntries(data.map((park: { id: string; name: string }) => [park.id, park.name])));
    })();
  }, []);

  // Keep the selection valid whenever the visible (active/archived) list
  // changes — after load, after resolving/reopening a ticket (which moves
  // it to the other tab), or after switching tabs.
  useEffect(() => {
    setSelectedTicketId((current) => {
      if (current && visibleTickets.some((ticket) => ticket.id === current)) return current;
      return visibleTickets[0]?.id ?? null;
    });
  }, [visibleTickets]);

  // A push notification for a new reply links here with ?ticket=<id> - jump
  // straight to that ticket (switching tabs if it's archived) the first
  // time the ticket list loads, then drop the param from the URL.
  useEffect(() => {
    if (!initialTicketParam || appliedDeepLinkRef.current) return;
    const match = tickets.find((ticket) => ticket.id === initialTicketParam);
    if (!match) return;

    appliedDeepLinkRef.current = true;
    setViewingArchived(isArchivedStatus(match.status));
    setSelectedTicketId(match.id);
    setMobileDetailOpen(true);

    const url = new URL(window.location.href);
    url.searchParams.delete('ticket');
    window.history.replaceState({}, '', url.toString());
  }, [tickets, initialTicketParam]);

  useEffect(() => {
    setActionError(null);
    setReplyMessage('');
    setReplyError(null);

    if (!selectedTicketId) {
      setMessages([]);
      setMessagesError(null);
      setMessagesLoading(false);
      return;
    }

    void loadMessagesForTicket(selectedTicketId);
  }, [selectedTicketId, loadMessagesForTicket]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel('support-ticket-kunden-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        async () => {
          await loadTickets();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_ticket_messages' },
        async (payload) => {
          const payloadTicketId =
            (payload.new as { ticket_id?: string } | null)?.ticket_id ||
            (payload.old as { ticket_id?: string } | null)?.ticket_id ||
            null;

          const currentTicketId = selectedTicketIdRef.current;
          if (!currentTicketId) return;

          if (!payloadTicketId || payloadTicketId === currentTicketId) {
            await loadMessagesForTicket(currentTicketId);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setTicketsError('Realtime-Verbindung fehlgeschlagen. Bitte Seite neu laden.');
        }
      });

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [loadTickets, loadMessagesForTicket]);

  function selectTicket(ticketId: string) {
    setSelectedTicketId(ticketId);
    setMobileDetailOpen(true);
  }

  const updateTicketStatus = async (nextStatus: 'open' | 'resolved') => {
    if (!selectedTicket) return;

    setActionError(null);
    setUpdatingStatus(true);

    try {
      const res = await edgeFetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: selectedTicket.id, status: nextStatus }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setActionError(getApiErrorMessage(body, 'Ticket-Status konnte nicht aktualisiert werden'));
        return;
      }

      await loadTickets();
    } finally {
      setUpdatingStatus(false);
    }
  };

  const submitReply = async () => {
    if (!selectedTicket) return;
    const trimmed = replyMessage.trim();
    if (!trimmed) return;

    setReplyError(null);
    setReplySending(true);

    try {
      const res = await edgeFetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: selectedTicket.id, message: trimmed }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setReplyError(getApiErrorMessage(body, 'Antwort konnte nicht gesendet werden'));
        return;
      }

      setReplyMessage('');
      await loadMessagesForTicket(selectedTicket.id);
      await loadTickets();
    } finally {
      setReplySending(false);
    }
  };

  const threadEntries = useMemo(() => {
    if (!selectedTicket) return [] as (SupportTicketMessage | { id: string; author_role: 'operator'; message: string; created_at: string })[];
    const descriptionEntry = {
      id: `description-${selectedTicket.id}`,
      author_role: 'operator' as const,
      message: selectedTicket.description,
      created_at: selectedTicket.created_at,
    };
    return [descriptionEntry, ...messages];
  }, [selectedTicket, messages]);

  return (
    <div className="grid">
      <div className="card">
        <h2>Support Ticket Kunden</h2>
        <p className="note">Tickets verwalten und als erledigt markieren.</p>
      </div>

      <div className="support-layout" data-mobile-view={mobileDetailOpen ? 'detail' : 'list'}>
        <div className="card support-list-panel">
          <div className="support-panel-header">
            <h3>Tickets</h3>
            {!ticketsLoading && <span className="note">{visibleTickets.length}</span>}
          </div>

          <div className="support-tabs">
            <button
              type="button"
              className={!viewingArchived ? 'active' : ''}
              onClick={() => setViewingArchived(false)}
            >
              Aktiv ({activeTickets.length})
            </button>
            <button
              type="button"
              className={viewingArchived ? 'active' : ''}
              onClick={() => setViewingArchived(true)}
            >
              Archiviert ({archivedTickets.length})
            </button>
          </div>

          {ticketsLoading && <p className="support-loading">Tickets werden geladen...</p>}
          {!ticketsLoading && ticketsError && <p className="support-error">{ticketsError}</p>}
          {!ticketsLoading && !ticketsError && visibleTickets.length === 0 && (
            <p className="support-empty">
              {viewingArchived ? 'Keine archivierten Tickets.' : 'Keine offenen Tickets.'}
            </p>
          )}

          {!ticketsLoading && !ticketsError && visibleTickets.length > 0 && (
            <ul className="ticket-list">
              {visibleTickets.map((ticket) => (
                <li key={ticket.id} className="ticket-item">
                  <button
                    type="button"
                    className={`ticket-item-btn ${ticket.id === selectedTicketId ? 'active' : ''}`}
                    onClick={() => selectTicket(ticket.id)}
                  >
                    <div className="ticket-item-top">
                      <span className="ticket-item-subject">{ticket.subject}</span>
                    </div>
                    <div className="ticket-item-meta">
                      <span className={`badge status-${ticket.status}`}>{statusLabelMap[ticket.status]}</span>
                      <span className={`badge priority-${ticket.priority}`}>{priorityLabelMap[ticket.priority]}</span>
                      <span className="note">{parkNameById[ticket.organization_id] || '–'}</span>
                      <span className="note">{formatDateTime(ticket.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card support-detail-panel">
          <button type="button" className="mobile-back-button" onClick={() => setMobileDetailOpen(false)}>
            ← Zurück zu Tickets
          </button>
          <h3>Nachrichten-Thread</h3>

          {!selectedTicket && !ticketsLoading && !ticketsError && (
            <p className="support-empty">Bitte ein Ticket auswählen.</p>
          )}

          {selectedTicket && (
            <>
              <div className="ticket-thread-header">
                <h4>{selectedTicket.subject}</h4>
                <div className="ticket-thread-badges">
                  <span className={`badge status-${selectedTicket.status}`}>{statusLabelMap[selectedTicket.status]}</span>
                  <span className={`badge priority-${selectedTicket.priority}`}>{priorityLabelMap[selectedTicket.priority]}</span>
                </div>
              </div>
              <p className="note">
                Park: {parkNameById[selectedTicket.organization_id] || selectedTicket.organization_id}
              </p>

              <div className="support-actions-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void updateTicketStatus(isArchivedStatus(selectedTicket.status) ? 'open' : 'resolved')
                  }
                  disabled={updatingStatus}
                >
                  {updatingStatus
                    ? 'Speichern...'
                    : isArchivedStatus(selectedTicket.status)
                      ? 'Ticket wieder öffnen'
                      : 'Als erledigt markieren'}
                </button>
              </div>
              {actionError && <p className="support-error">{actionError}</p>}

              <div className="chat-thread">
                {threadEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`chat-row ${entry.author_role === 'support' ? 'chat-row-mine' : 'chat-row-theirs'}`}
                  >
                    <div className="chat-bubble">
                      <p className="chat-bubble-author">
                        {entry.author_role === 'support' ? 'Du' : 'Operator'}
                      </p>
                      <p className="chat-bubble-text">{entry.message}</p>
                      <p className="chat-bubble-time">{formatDateTime(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
                {messagesLoading && <p className="support-loading">Nachrichten werden geladen...</p>}
                {!messagesLoading && messagesError && <p className="support-error">{messagesError}</p>}
              </div>

              <div className="support-reply-form">
                <label htmlFor="support-reply-textarea">Antworten im Thread</label>
                <textarea
                  id="support-reply-textarea"
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  placeholder="Antwort schreiben..."
                  rows={3}
                  disabled={replySending}
                />
                {replyError && <p className="support-error">{replyError}</p>}
                <div className="support-actions-row">
                  <button
                    type="button"
                    onClick={() => void submitReply()}
                    disabled={replySending || !replyMessage.trim()}
                  >
                    {replySending ? 'Wird gesendet...' : 'Antwort senden'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
