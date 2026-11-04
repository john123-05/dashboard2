// Personalisierung > "Bildschirm am Automaten": groß die Live-Ansicht (so sieht der Bildschirm gerade
// aus), rechts die Eckdaten und "Design bearbeiten". Erscheint nur für Automaten, für die Liftpictures
// die Presentation freigeschaltet hat.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonitorPlay, PencilRuler } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n } from '../../lib/i18n';
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '../../lib/supabase';
import PresentationDesigner, { mergeDesign, type Design } from './PresentationDesigner';
import PresentationLivePreview, { activeDesign } from './PresentationLivePreview';

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

export function usePresentationMachines(parkId: string | null) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
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
  return { machines, reload: load };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--line)] py-2.5 last:border-0">
      <dt className="text-sm text-[color:var(--ink-3)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-[color:var(--ink)]">{children}</dd>
    </div>
  );
}

export default function PresentationScreenCard({ parkId, parkSlug }: { parkId: string | null; parkSlug?: string | null }) {
  const { t } = useI18n();
  const { machines, reload } = usePresentationMachines(parkId);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const m = machines?.[Math.min(selected, (machines?.length ?? 1) - 1)] ?? null;

  const info = useMemo(() => {
    if (!m) return null;
    const { design: current, plan } = activeDesign(m.design);
    const merged = mergeDesign(m.viewer_settings, current);
    return { merged, plan };
  }, [m]);

  if (!parkId || !machines?.length || !m || !info) return null;

  async function save(design: Design) {
    const res = await fetch(URL_FN, { method: 'POST', headers: await headers(), body: JSON.stringify({ park_id: parkId, machine_config_id: m!.id, design }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || t('pres.save_failed'));
    await reload();
  }

  const live = m.status?.licensed !== false;
  const { merged, plan } = info;
  const layout = String(merged.layout);
  const grid = layout === 'grid' || layout === 'carousel' ? ` · ${merged.columns} × ${merged.rows}` : '';

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--line)] px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[color:var(--ink-2)]"><MonitorPlay className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('pres.card_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('pres.card_sub')}</p>
        </div>
        {machines.length > 1 && (
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))} className="glass-input w-auto py-1.5 text-sm">
            {machines.map((x, i) => <option key={x.id} value={i}>{x.machine_label || x.machine_id}</option>)}
          </select>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${live ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-rose-500'}`} />
          {live ? t('pres.live') : t('pres.locked')}
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-slate-50 p-5 sm:p-6">
          <PresentationLivePreview design={m.design} viewer={m.viewer_settings} defaultLogo={m.logo_url} parkSlug={parkSlug} />
          <p className="mt-4 text-center text-xs text-[color:var(--ink-3)]">{t('pres.live_note')}</p>
        </div>
        <div className="flex flex-col border-t border-[color:var(--line)] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ink-3)]">{m.machine_label || m.machine_id}</p>
          <dl className="mt-2">
            <Row label={t('pres.template')}>{t(`pres.p.${merged.preset}.title`)}</Row>
            <Row label={t('pres.f.layout')}>{t(`pres.o.layout.${layout}`)}{grid}</Row>
            <Row label={t('pres.f.orientation')}>{t(`pres.o.orientation.${merged.orientation}`)}</Row>
            <Row label={t('pres.schedule')}>{plan ? t('pres.schedule_active', { name: plan }) : t('pres.tab_standard')}</Row>
            <Row label={t('pres.photos_on_screen')}>{live ? (m.status?.photos ?? '–') : t('pres.status_locked')}</Row>
          </dl>
          <div className="mt-auto pt-5">
            <button type="button" className="glass-button-primary w-full justify-center py-2.5" onClick={() => setEditing(true)}>
              <PencilRuler className="h-4 w-4" /> {t('pres.edit')}
            </button>
            <p className="mt-2 text-xs text-[color:var(--ink-3)]">{t('pres.edit_hint')}</p>
          </div>
        </div>
      </div>

      {editing && (
        <PresentationDesigner
          title={m.machine_label || m.machine_id}
          initial={m.design}
          viewer={m.viewer_settings}
          defaultLogo={m.logo_url}
          parkSlug={parkSlug}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </GlassCard>
  );
}
