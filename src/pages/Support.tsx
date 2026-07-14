import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, Loader2, MessageSquare, Send, ExternalLink, Archive, ArrowLeft } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { formatRelative, formatDateTime, statusColor } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import type { SupportTicket, SupportTicketMessage } from '../lib/types';
import { useI18n } from '../lib/i18n';

function priorityBadgeClass(priority: SupportTicket['priority']) {
  switch (priority) {
    case 'critical':
      return 'status-badge bg-rose-50 text-rose-700 ring-rose-200';
    case 'high':
      return 'status-badge bg-orange-50 text-orange-700 ring-orange-200';
    case 'medium':
      return 'status-badge bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'status-badge bg-slate-50 text-slate-600 ring-slate-200';
  }
}

export default function Support() {
  const { profile, user } = useAuth();
  const { parkId } = usePark();
  const { t } = useI18n();

  const statusLabel = (status: SupportTicket['status']) => t(`support.status.${status}`);
  const priorityLabel = (priority: SupportTicket['priority']) => t(`support.priority.${priority}`);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [archivedTickets, setArchivedTickets] = useState<SupportTicket[]>([]);
  const [viewingArchived, setViewingArchived] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [menuOpenForTicketId, setMenuOpenForTicketId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupportTicket | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [archivingTicketId, setArchivingTicketId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });

  const detailRef = useRef<HTMLDivElement | null>(null);

  const visibleTickets = useMemo(
    () => (viewingArchived ? archivedTickets : tickets),
    [viewingArchived, archivedTickets, tickets],
  );
  const selectedTicket = useMemo(
    () => visibleTickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [visibleTickets, selectedTicketId],
  );

  const loadAllTickets = useCallback(async () => {
    if (!parkId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [activeRes, archivedRes] = await Promise.all([
      invokeEdgeFunction<{ tickets: SupportTicket[] }>('support-tickets', {
        useSessionAuth: true,
        query: { park_id: parkId },
      }),
      invokeEdgeFunction<{ tickets: SupportTicket[] }>('support-tickets', {
        useSessionAuth: true,
        query: { park_id: parkId, archived: '1' },
      }),
    ]);

    setTickets(activeRes.data?.tickets ?? []);
    setArchivedTickets(archivedRes.data?.tickets ?? []);
    setLoadError(activeRes.error || archivedRes.error || null);
    setLoading(false);
  }, [parkId]);

  useEffect(() => {
    void loadAllTickets();
  }, [loadAllTickets]);

  // Keep the selection valid whenever the visible list changes (load,
  // archive/unarchive/delete, or switching between active and archived).
  useEffect(() => {
    setSelectedTicketId((current) => {
      if (current && visibleTickets.some((ticket) => ticket.id === current)) return current;
      return visibleTickets[0]?.id ?? null;
    });
  }, [visibleTickets]);

  const loadMessages = useCallback(
    async (ticketId: string) => {
      if (!parkId) return;
      setMessagesLoading(true);
      const { data, error } = await invokeEdgeFunction<{ messages: SupportTicketMessage[] }>('support-tickets', {
        useSessionAuth: true,
        query: { park_id: parkId, ticket_id: ticketId },
      });
      if (error) {
        setMessagesError(error);
        setMessages([]);
      } else {
        setMessagesError(null);
        setMessages(data?.messages ?? []);
      }
      setMessagesLoading(false);
    },
    [parkId],
  );

  useEffect(() => {
    setReplyText('');
    setReplyError(null);

    if (!selectedTicketId) {
      setMessages([]);
      setMessagesError(null);
      return;
    }
    void loadMessages(selectedTicketId);
  }, [selectedTicketId, loadMessages]);

  // No cross-project realtime channel is available here (the operator
  // dashboard's Supabase client points at this project, not the shared one
  // support_tickets actually lives in - see support-tickets edge function).
  // Poll instead so replies show up without a manual refresh.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadAllTickets();
      if (selectedTicketId) void loadMessages(selectedTicketId);
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadAllTickets, loadMessages, selectedTicketId]);

  function selectTicket(ticketId: string) {
    setSelectedTicketId(ticketId);
    setMenuOpenForTicketId(null);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleArchiveToggle(ticket: SupportTicket) {
    if (!parkId) return;
    setMenuOpenForTicketId(null);
    setActionError(null);
    setArchivingTicketId(ticket.id);

    const { error } = await invokeEdgeFunction('support-tickets', {
      method: 'PATCH',
      useSessionAuth: true,
      body: { park_id: parkId, ticket_id: ticket.id, archived: !viewingArchived },
    });

    setArchivingTicketId(null);
    if (error) {
      setActionError(error);
      return;
    }
    await loadAllTickets();
  }

  async function confirmDelete() {
    if (!deleteTarget || !parkId) return;
    setActionError(null);
    setDeleting(true);

    const { error } = await invokeEdgeFunction('support-tickets', {
      method: 'DELETE',
      useSessionAuth: true,
      query: { park_id: parkId, ticket_id: deleteTarget.id },
    });

    setDeleting(false);
    if (error) {
      setActionError(error);
      return;
    }
    setDeleteTarget(null);
    await loadAllTickets();
  }

  async function submitReply() {
    if (!selectedTicket || !parkId) return;
    const trimmed = replyText.trim();
    if (!trimmed) return;

    setReplyError(null);
    setReplySending(true);

    const { error } = await invokeEdgeFunction('support-tickets', {
      method: 'POST',
      useSessionAuth: true,
      body: { park_id: parkId, ticket_id: selectedTicket.id, message: trimmed },
    });

    setReplySending(false);
    if (error) {
      setReplyError(error);
      return;
    }
    setReplyText('');
    await Promise.all([loadMessages(selectedTicket.id), loadAllTickets()]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!parkId) return;
    setCreating(true);
    setCreateError(null);

    const { error } = await invokeEdgeFunction('support-tickets', {
      method: 'POST',
      useSessionAuth: true,
      body: {
        park_id: parkId,
        subject: form.subject,
        description: form.description,
        priority: form.priority,
        reporter_email: profile?.email || user?.email || '',
        reporter_name: profile?.full_name || '',
      },
    });

    if (error) {
      setCreateError(error);
      setCreating(false);
      return;
    }

    setForm({ subject: '', description: '', priority: 'medium' });
    setShowCreate(false);
    setCreating(false);
    setViewingArchived(false);
    await loadAllTickets();
  }

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="h-96 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('support.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('support.subtitle')}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="glass-button-primary">
          <Plus className="h-4 w-4" />
          {t('support.new_ticket')}
        </button>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <GlassCard className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">Tickets</h3>
            <span className="text-xs text-slate-400">{visibleTickets.length}</span>
          </div>
          {viewingArchived ? (
            <button
              type="button"
              onClick={() => setViewingArchived(false)}
              className="mb-3 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t('support.archive.back')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setViewingArchived(true)}
              className="mb-3 flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <Archive className="h-3.5 w-3.5" /> {t('support.archive.button')}
              {archivedTickets.length > 0 ? ` (${archivedTickets.length})` : ''}
            </button>
          )}

          {visibleTickets.length === 0 ? (
            <div className="rounded-2xl bg-white/30 p-8 text-center">
              <MessageSquare className="mx-auto mb-3 h-7 w-7 text-slate-300" />
              <p className="text-sm text-slate-500">
                {viewingArchived ? t('support.archive.empty') : t('support.none')}
              </p>
              {!viewingArchived && <p className="mt-1 text-xs text-slate-400">{t('support.none_desc')}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleTickets.map((ticket) => (
                <div key={ticket.id} className="relative">
                  <button
                    type="button"
                    onClick={() => selectTicket(ticket.id)}
                    className={`w-full rounded-2xl p-4 pr-9 text-left transition-colors ${
                      ticket.id === selectedTicketId
                        ? 'bg-white/70 ring-1 ring-brand-200'
                        : 'bg-white/30 hover:bg-white/50'
                    }`}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`status-badge ${statusColor(ticket.status)}`}>
                        {statusLabel(ticket.status)}
                      </span>
                      <span className={priorityBadgeClass(ticket.priority)}>{priorityLabel(ticket.priority)}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">
                        {formatRelative(ticket.updated_at)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-800">{ticket.subject}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{ticket.description}</p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpenForTicketId((current) => (current === ticket.id ? null : ticket.id));
                    }}
                    className="absolute right-2 top-2 rounded-lg p-1 text-slate-300 transition-colors hover:bg-white/60 hover:text-slate-500"
                    aria-label={t('support.menu.archive')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {menuOpenForTicketId === ticket.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpenForTicketId(null)} />
                      <div className="absolute right-2 top-9 z-50 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
                        <button
                          type="button"
                          onClick={() => void handleArchiveToggle(ticket)}
                          disabled={archivingTicketId === ticket.id}
                          className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {viewingArchived ? t('support.menu.unarchive') : t('support.menu.archive')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenForTicketId(null);
                            setDeleteTarget(ticket);
                          }}
                          className="block w-full px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                        >
                          {t('support.menu.delete')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="flex flex-col p-5">
          <div ref={detailRef} />
          {!selectedTicket ? (
            <div className="flex flex-1 items-center justify-center py-16">
              <p className="text-sm text-slate-500">
                {viewingArchived ? t('support.archive.empty') : t('support.none')}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/40 pb-3">
                <div>
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`status-badge ${statusColor(selectedTicket.status)}`}>
                      {statusLabel(selectedTicket.status)}
                    </span>
                    <span className={priorityBadgeClass(selectedTicket.priority)}>
                      {priorityLabel(selectedTicket.priority)}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">{selectedTicket.subject}</h3>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto py-2">
                {threadEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex ${entry.author_role === 'operator' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        entry.author_role === 'operator'
                          ? 'rounded-br-sm bg-brand-500 text-white'
                          : 'rounded-bl-sm bg-white/60 text-slate-700'
                      }`}
                    >
                      <p
                        className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${
                          entry.author_role === 'operator' ? 'text-white/70' : 'text-slate-400'
                        }`}
                      >
                        {entry.author_role === 'operator' ? t('support.thread.you') : t('support.thread.team')}
                      </p>
                      <p className="whitespace-pre-line">{entry.message}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          entry.author_role === 'operator' ? 'text-white/60' : 'text-slate-400'
                        }`}
                      >
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
                {messagesLoading && <p className="text-sm text-slate-500">{t('support.thread.loading')}</p>}
                {!messagesLoading && messagesError && <p className="text-sm text-red-600">{messagesError}</p>}
              </div>

              <div className="mt-3 border-t border-white/40 pt-3">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={t('support.thread.reply_placeholder')}
                  rows={2}
                  disabled={replySending}
                  className="glass-input w-full resize-none"
                />
                {replyError && <p className="mt-1 text-sm text-red-600">{replyError}</p>}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void submitReply()}
                    disabled={replySending || !replyText.trim()}
                    className="glass-button-primary"
                  >
                    <Send className="h-4 w-4" />
                    {replySending ? t('support.thread.sending') : t('support.thread.send')}
                  </button>
                </div>
              </div>
            </>
          )}
        </GlassCard>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="mb-3 text-base font-semibold text-slate-800">{t('support.contact')}</h3>
          <p className="mb-4 text-sm text-slate-500">{t('support.contact_desc')}</p>
          <div className="space-y-3">
            <a
              href="mailto:support@liftpictures.com"
              className="flex items-center gap-3 rounded-xl bg-white/30 p-3 text-sm text-slate-700 transition-colors hover:bg-white/50"
            >
              <Send className="h-4 w-4 text-brand-500" />
              support@liftpictures.com
            </a>
            <a
              href="https://liftpictures.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl bg-white/30 p-3 text-sm text-slate-700 transition-colors hover:bg-white/50"
            >
              <ExternalLink className="h-4 w-4 text-brand-500" />
              Documentation
            </a>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-3 text-base font-semibold text-slate-800">{t('support.summary.title')}</h3>
          <div className="space-y-2">
            {(['open', 'in_progress', 'resolved', 'closed'] as const).map((status) => {
              const count = tickets.filter((ticket) => ticket.status === status).length;
              return (
                <div key={status} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                  <span className="text-slate-600">{statusLabel(status)}</span>
                  <span className="font-semibold text-slate-800">{count}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
              <span className="text-slate-600">{t('support.archive.title')}</span>
              <span className="font-semibold text-slate-800">{archivedTickets.length}</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="glass-panel-strong animate-slide-up w-full max-w-lg rounded-3xl p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">{t('support.form.title')}</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/40 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('support.form.subject')}
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder={t('support.form.subject_placeholder')}
                  required
                  className="glass-input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('support.form.description')}
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={t('support.form.description_placeholder')}
                  rows={4}
                  required
                  className="glass-input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t('support.form.priority')}
                </label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="glass-input"
                >
                  <option value="low">{t('support.priority.low')}</option>
                  <option value="medium">{t('support.priority.medium')}</option>
                  <option value="high">{t('support.priority.high')}</option>
                  <option value="critical">{t('support.priority.critical')}</option>
                </select>
              </div>

              {createError && <p className="text-sm text-red-600">{createError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="glass-button-secondary flex-1">
                  {t('support.form.cancel')}
                </button>
                <button type="submit" disabled={creating} className="glass-button-primary flex-1">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('support.form.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="glass-panel-strong animate-slide-up w-full max-w-sm rounded-3xl p-6">
            <h3 className="mb-2 text-lg font-semibold text-slate-800">{t('support.delete.confirm_title')}</h3>
            <p className="mb-6 text-sm text-slate-500">{t('support.delete.confirm_body')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="glass-button-secondary flex-1"
              >
                {t('support.delete.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t('support.delete.confirm_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
