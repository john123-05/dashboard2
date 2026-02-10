import { useEffect, useState } from 'react';
import { Plus, X, Loader2, MessageSquare, Send, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatRelative, statusColor } from '../lib/utils';
import GlassCard from '../components/ui/GlassCard';
import type { SupportTicket } from '../lib/types';

export default function Support() {
  const { currentOrg, user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium' });

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    setTickets((data || []) as SupportTicket[]);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !user) return;
    setCreating(true);

    await supabase.from('support_tickets').insert({
      organization_id: currentOrg.id,
      created_by: user.id,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
    });

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
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Support</h2>
          <p className="mt-1 text-sm text-slate-500">Manage support tickets and contact Liftpictures</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="glass-button-primary">
          <Plus className="h-4 w-4" />
          New Ticket
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {tickets.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <MessageSquare className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">No support tickets yet</p>
              <p className="mt-1 text-xs text-slate-400">Create one to get help from the Liftpictures team</p>
            </GlassCard>
          ) : (
            tickets.map((ticket) => (
              <GlassCard key={ticket.id} className="p-5 transition-all hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
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
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">{ticket.description}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatRelative(ticket.created_at)}
                  </span>
                </div>
              </GlassCard>
            ))
          )}
        </div>

        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="mb-3 text-base font-semibold text-slate-800">Contact Liftpictures</h3>
            <p className="mb-4 text-sm text-slate-500">
              Need direct support? Reach out to our team.
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
