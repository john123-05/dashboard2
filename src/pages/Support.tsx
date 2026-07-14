import { useEffect, useState } from 'react';
import { Plus, X, Loader2, MessageSquare, Send, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import { formatRelative, formatDateTime, statusColor } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import type { SupportTicket, SupportTicketMessage } from '../lib/types';
import { useI18n } from '../lib/i18n';

export default function Support() {
  const { profile, user } = useAuth();
  const { parkId } = usePark();
  const { t } = useI18n();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });

  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [messagesByTicket, setMessagesByTicket] = useState<Record<string, SupportTicketMessage[]>>({});
  const [messagesLoadingId, setMessagesLoadingId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkId]);

  async function loadTickets() {
    if (!parkId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ tickets: SupportTicket[] }>('support-tickets', {
      useSessionAuth: true,
      query: { park_id: parkId },
    });

    if (error) {
      setLoadError(error);
      setLoading(false);
      return;
    }

    setTickets(data?.tickets ?? []);
    setLoadError(null);
    setLoading(false);
  }

  async function loadMessages(ticketId: string) {
    setMessagesLoadingId(ticketId);
    setMessagesError(null);

    const { data, error } = await invokeEdgeFunction<{ messages: SupportTicketMessage[] }>('support-tickets', {
      useSessionAuth: true,
      query: { ticket_id: ticketId },
    });

    if (error) {
      setMessagesError(error);
      setMessagesLoadingId(null);
      return;
    }

    setMessagesByTicket((prev) => ({ ...prev, [ticketId]: data?.messages ?? [] }));
    setMessagesLoadingId(null);
  }

  function toggleExpand(ticketId: string) {
    if (expandedTicketId === ticketId) {
      setExpandedTicketId(null);
      return;
    }
    setExpandedTicketId(ticketId);
    if (!messagesByTicket[ticketId]) {
      void loadMessages(ticketId);
    }
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
    await loadTickets();
  }

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

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {tickets.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">{t('support.none')}</p>
              <p className="mt-1 text-xs text-slate-400">{t('support.none_desc')}</p>
            </GlassCard>
          ) : (
            tickets.map((ticket) => {
              const isExpanded = expandedTicketId === ticket.id;
              const messages = messagesByTicket[ticket.id] ?? [];

              return (
                <GlassCard key={ticket.id} className="p-5 transition-all hover:shadow-md">
                  <button
                    type="button"
                    onClick={() => toggleExpand(ticket.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`status-badge ${statusColor(ticket.status)}`}>
                          {ticket.status.replace('_', ' ')}
                        </span>
                        <span
                          className={`status-badge ${
                            ticket.priority === 'critical'
                              ? 'bg-rose-50 text-rose-700 ring-rose-200'
                              : ticket.priority === 'high'
                                ? 'bg-orange-50 text-orange-700 ring-orange-200'
                                : ticket.priority === 'medium'
                                  ? 'bg-amber-50 text-amber-700 ring-amber-200'
                                  : 'bg-slate-50 text-slate-600 ring-slate-200'
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-800">{ticket.subject}</h4>
                      <p
                        className={`mt-1 whitespace-pre-line text-sm text-slate-500 ${
                          isExpanded ? '' : 'line-clamp-2'
                        }`}
                      >
                        {ticket.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-slate-400">{formatRelative(ticket.created_at)}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 border-t border-white/40 pt-4">
                      <h5 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Antworten
                      </h5>
                      {messagesLoadingId === ticket.id && (
                        <p className="text-sm text-slate-500">Lädt...</p>
                      )}
                      {messagesLoadingId !== ticket.id && messagesError && (
                        <p className="text-sm text-red-600">{messagesError}</p>
                      )}
                      {messagesLoadingId !== ticket.id && !messagesError && messages.length === 0 && (
                        <p className="text-sm text-slate-500">Noch keine Antworten.</p>
                      )}
                      {messagesLoadingId !== ticket.id && messages.length > 0 && (
                        <div className="space-y-3">
                          {messages.map((message) => (
                            <div
                              key={message.id}
                              className={`rounded-xl p-3 text-sm ${
                                message.author_role === 'support'
                                  ? 'bg-brand-50/60 text-slate-700'
                                  : 'bg-white/30 text-slate-700'
                              }`}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {message.author_role === 'support' ? 'Liftpictures Support' : 'Du'}
                                </span>
                                <span className="text-xs text-slate-400">{formatDateTime(message.created_at)}</span>
                              </div>
                              <p className="whitespace-pre-line">{message.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="mb-3 text-base font-semibold text-slate-800">{t('support.contact')}</h3>
            <p className="mb-4 text-sm text-slate-500">
              {t('support.contact_desc')}
            </p>
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
            <h3 className="mb-3 text-base font-semibold text-slate-800">Ticket Summary</h3>
            <div className="space-y-2">
              {['open', 'in_progress', 'resolved', 'closed'].map((status) => {
                const count = tickets.filter((t) => t.status === status).length;
                return (
                  <div key={status} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                    <span className="capitalize text-slate-600">{status.replace('_', ' ')}</span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="glass-panel-strong animate-slide-up w-full max-w-lg rounded-3xl p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800">Create Support Ticket</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/40 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Brief description of the issue"
                  required
                  className="glass-input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Provide details about your issue..."
                  rows={4}
                  required
                  className="glass-input resize-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="glass-input"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {createError && <p className="text-sm text-red-600">{createError}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="glass-button-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="glass-button-primary flex-1">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
