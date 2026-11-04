// Personalisierung > "Bildschirm am Automaten": zeigt die Automaten, für die Liftpictures die
// Presentation freigeschaltet hat, und öffnet den Baukasten. Ohne Freischaltung erscheint die Karte nicht.
import { useCallback, useEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n } from '../../lib/i18n';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../../lib/supabase';
import PresentationDesigner, { type Design } from './PresentationDesigner';

const URL_FN = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-presentation`;

type Machine = {
  id: string;
  machine_id: string;
  machine_label: string | null;
  design: Design | null;
  logo_url: string | null;
  viewer_settings: Record<string, string> | null;
  status: { licensed?: boolean; reason?: string | null; photos?: number } | null;
};

async function headers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('not signed in');
  return { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
}

export default function PresentationScreenCard({ parkId, parkSlug }: { parkId: string | null; parkSlug?: string | null }) {
  const { t } = useI18n();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [open, setOpen] = useState<Machine | null>(null);

  const load = useCallback(async () => {
    if (!parkId) { setMachines([]); return; }
    try {
      const res = await fetch(`${URL_FN}?park_id=${encodeURIComponent(parkId)}`, { headers: await headers() });
      const body = await res.json().catch(() => null);
      setMachines(res.ok && Array.isArray(body?.data) ? body.data : []);
    } catch {
      setMachines([]);
    }
  }, [parkId]);
  useEffect(() => { void load(); }, [load]);

  if (!parkId || !machines.length) return null;

  async function save(m: Machine, design: Design) {
    const res = await fetch(URL_FN, { method: 'POST', headers: await headers(), body: JSON.stringify({ park_id: parkId, machine_config_id: m.id, design }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || t('pres.save_failed'));
    await load();
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]"><MonitorPlay className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pres.card_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('pres.card_sub')}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-[color:var(--line)] rounded-lg border border-[color:var(--line)]">
        {machines.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[color:var(--ink)]">{m.machine_label || m.machine_id}</p>
              <p className="text-xs text-[color:var(--ink-3)]">
                {m.status
                  ? m.status.licensed
                    ? t('pres.status_running', { n: m.status.photos ?? 0 })
                    : t('pres.status_locked')
                  : t('pres.status_unknown')}
              </p>
            </div>
            <button type="button" className="glass-button-primary px-4 py-2 text-sm" onClick={() => setOpen(m)}>{t('pres.edit')}</button>
          </li>
        ))}
      </ul>
      {open && (
        <PresentationDesigner
          title={open.machine_label || open.machine_id}
          initial={open.design}
          viewer={open.viewer_settings}
          defaultLogo={open.logo_url}
          parkSlug={parkSlug}
          onClose={() => setOpen(null)}
          onSave={(d) => save(open, d)}
        />
      )}
    </GlassCard>
  );
}
