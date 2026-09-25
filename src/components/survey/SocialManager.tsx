import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { inputClass, LocalizedField } from './SurveyManager';
import {
  fetchSocialResults,
  saveSocialSettings,
  type FieldLevel,
  type SocialPlatform,
  type SocialResults,
  type SocialSettings,
} from '../../lib/surveyApi';

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const PERIODS = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
  { days: 365, label: '12 Monate' },
] as const;

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function Preview({ s }: { s: SocialSettings }) {
  const tags = [s.handle, s.hashtag].filter(Boolean).join(' ');
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Nach der Freischaltung (Gast)</p>
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">Jetzt teilen</p>
          <p className="mt-1 text-sm text-slate-600">
            {s.instructions?.de || (tags ? `Teile dein Foto und markiere ${tags}.` : 'Teile dein Foto mit deinen Freunden.')}
          </p>
          {tags && <p className="mt-2 text-sm font-medium text-brand-700">{tags}</p>}
          <span className="mt-3 inline-block rounded bg-amber-400 px-4 py-2 text-xs font-black uppercase italic text-slate-900">
            Foto teilen
          </span>
        </div>
        {s.giveaway_enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase text-amber-700">Gewinnspiel</p>
            <p className="mt-1 text-sm text-amber-900">{s.giveaway_text?.de || 'Wer teilt, nimmt an der Verlosung teil.'}</p>
          </div>
        )}
        {(s.post_link ?? 'optional') !== 'off' && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">
              Link zu deinem Beitrag{s.post_link === 'required' ? ' *' : ' (freiwillig)'}
            </p>
            <div className="mt-1 h-8 rounded border border-slate-200 bg-slate-50" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SocialManager({ parkId, initial, onSaved }: {
  parkId: string;
  initial: SocialSettings;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<'settings' | 'results'>('settings');
  const [s, setS] = useState<SocialSettings>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setS(initial); setDirty(false); }, [initial]);

  const patch = (p: Partial<SocialSettings>) => {
    setS((cur) => ({ ...cur, ...p }));
    setDirty(true);
    setSaved(false);
  };

  function togglePlatform(p: SocialPlatform) {
    const cur = s.platforms ?? [];
    patch({ platforms: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveSocialSettings(parkId, s);
      setDirty(false);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-white/50 p-1">
        {([['settings', 'Einstellungen'], ['results', 'Auswertung']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'results' && <SocialResultsView parkId={parkId} />}

      {tab === 'settings' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <GlassCard className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-slate-800">Kanäle und Markierung</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Wo sollen Gäste teilen?</p>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => {
                      const on = (s.platforms ?? []).includes(p.value);
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => togglePlatform(p.value)}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            on ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white/60 text-slate-500 hover:bg-white'
                          }`}
                        >
                          {on && <Check className="mr-1 inline h-3.5 w-3.5" />}
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">Unser Profil zum Markieren</p>
                    <input value={s.handle ?? ''} onChange={(e) => patch({ handle: e.target.value })} placeholder="@imster_bergbahnen" className={inputClass} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">Hashtag</p>
                    <input value={s.hashtag ?? ''} onChange={(e) => patch({ hashtag: e.target.value })} placeholder="#alpinecoaster" className={inputClass} />
                  </div>
                </div>
                <LocalizedField label="Anleitung für den Gast" value={s.instructions ?? {}} onChange={(instructions) => patch({ instructions })} multiline />
                <LocalizedField label="Vorgeschlagener Text zum Foto (optional)" value={s.share_text ?? {}} onChange={(share_text) => patch({ share_text })} multiline />
              </div>
            </GlassCard>

            <GlassCard className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-slate-800">Gewinnspiel und Beitrag</h3>
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={s.giveaway_enabled === true} onChange={(e) => patch({ giveaway_enabled: e.target.checked })} />
                  Gewinnspiel anbieten (Gäste nehmen mit ihrem Beitrag teil)
                </label>
                {s.giveaway_enabled && (
                  <LocalizedField label="Gewinnspiel-Text" value={s.giveaway_text ?? {}} onChange={(giveaway_text) => patch({ giveaway_text })} multiline />
                )}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Link zum Beitrag abfragen</p>
                  <div className="inline-flex rounded-xl bg-white/60 p-1">
                    {([['required', 'Pflicht'], ['optional', 'Freiwillig'], ['off', 'Aus']] as [FieldLevel, string][]).map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patch({ post_link: v })}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                          (s.post_link ?? 'optional') === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Das Foto ist schon frei, der Link ist nur die Angabe des Gastes. Ob der Beitrag wirklich online ist,
                    prüft das System nicht.
                  </p>
                </div>
              </div>
            </GlassCard>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Speichern
              </button>
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" /> Gespeichert – gilt sofort auf der Claim-Seite
                </span>
              )}
              {dirty && <span className="text-sm text-amber-700">Nicht gespeicherte Änderungen</span>}
            </div>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <Preview s={s} />
          </div>
        </div>
      )}
    </div>
  );
}

function SocialResultsView({ parkId }: { parkId: string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SocialResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSocialResults(parkId, days)
      .then((r) => { if (active) { setData(r); setError(null); } })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [parkId, days]);

  const maxDay = Math.max(1, ...(data?.timeline ?? []).map((d) => d.unlocked));
  const quote = data && data.unlocked > 0 ? Math.round((data.posted / data.unlocked) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Gäste, die per Social Media freigeschaltet haben</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-1 text-sm text-slate-700">
          {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> wird geladen…</p>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {data && data.unlocked === 0 && !loading && (
        <GlassCard className="p-6"><p className="text-sm text-slate-500">Im gewählten Zeitraum gibt es noch keine Freischaltungen.</p></GlassCard>
      )}

      {data && data.unlocked > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Freischaltungen" value={String(data.unlocked)} />
            <Kpi label="Beitrag gemeldet" value={String(data.posted)} sub={`${quote} % der Freischaltungen`} />
            <Kpi label="Mit Link" value={String(data.with_link)} />
            <Kpi label="Gewinnspiel-Teilnehmer" value={String(data.giveaway)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">Pro Tag</h4>
              <div className="mt-3 flex h-32 items-end gap-1">
                {data.timeline.map((d) => (
                  <div key={d.day} className="relative flex-1 rounded-t bg-brand-500/25" style={{ height: `${Math.max(6, (d.unlocked / maxDay) * 100)}%` }}
                    title={`${new Date(d.day).toLocaleDateString('de-DE')}: ${d.unlocked} Freischaltungen, ${d.posted} mit Beitrag`}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand-500" style={{ height: `${d.unlocked > 0 ? (d.posted / d.unlocked) * 100 : 0}%` }} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">Hell: Freischaltungen · Dunkel: davon mit gemeldetem Beitrag</p>
            </GlassCard>
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">Kanäle</h4>
              <div className="mt-3 space-y-1.5">
                {data.platforms.length === 0 && <p className="text-sm text-slate-400">Noch kein Beitrag gemeldet.</p>}
                {data.platforms.map((p) => (
                  <div key={p.platform} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-right capitalize text-slate-500">{p.platform}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(p.count / data.platforms[0].count) * 100}%` }} />
                    </span>
                    <span className="w-8 tabular-nums text-slate-600">{p.count}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <GlassCard className="p-5">
            <h4 className="text-sm font-semibold text-slate-800">Einträge</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4">Datum</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Kontakt</th>
                    <th className="py-2 pr-4">Kanal / Profil</th><th className="py-2 pr-4">Beitrag</th><th className="py-2">Gewinnspiel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 text-slate-700">
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{new Date(e.created_at).toLocaleDateString('de-DE')}</td>
                      <td className="py-2 pr-4">{e.name || '–'}</td>
                      <td className="py-2 pr-4">{e.email || e.phone || '–'}</td>
                      <td className="py-2 pr-4">{e.platform ? <span className="capitalize">{e.platform}</span> : '–'}{e.handle ? ` · ${e.handle}` : ''}</td>
                      <td className="py-2 pr-4">
                        {e.post_url ? (
                          <a href={e.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                            Öffnen <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : e.posted_at ? 'gemeldet' : '–'}
                      </td>
                      <td className="py-2">{e.giveaway_opt_in ? 'ja' : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.truncated && <p className="mt-2 text-xs text-slate-400">Es werden die neuesten 3.000 Einträge ausgewertet.</p>}
          </GlassCard>
        </>
      )}
    </div>
  );
}
