import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { inputClass, LocalizedField } from './SurveyManager';
import { accentColorForPark, accentTextColorForPark } from '../../lib/parkBrand';
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
  { days: 7, label: 'survey.period_7' },
  { days: 30, label: 'survey.period_30' },
  { days: 90, label: 'survey.period_90' },
  { days: 365, label: 'survey.period_365' },
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

function Preview({
  s,
  accentColor,
  accentTextColor,
}: {
  s: SocialSettings;
  accentColor: string;
  accentTextColor: string;
}) {
  const { t } = useI18n();
  const tags = [s.handle, s.hashtag].filter(Boolean).join(' ');
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('social.preview_title')}</p>
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">{t('social.share_now')}</p>
          <p className="mt-1 text-sm text-slate-600">
            {s.instructions?.de || (tags ? t('social.default_share_tagged', { tags }) : t('social.default_share'))}
          </p>
          {tags && <p className="mt-2 text-sm font-medium text-brand-700">{tags}</p>}
          <span
            style={{ backgroundColor: accentColor, color: accentTextColor }}
            className="mt-3 inline-block rounded px-4 py-2 text-xs font-black uppercase italic"
          >
            {t('social.share_photo')}
          </span>
        </div>
        {s.giveaway_enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase text-amber-700">{t('social.giveaway')}</p>
            <p className="mt-1 text-sm text-amber-900">{s.giveaway_text?.de || t('social.default_giveaway_text')}</p>
          </div>
        )}
        {(s.post_link ?? 'optional') !== 'off' && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-500">
              {t('social.post_link_label')}{s.post_link === 'required' ? ' *' : ` ${t('social.optional_suffix')}`}
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
  const { t } = useI18n();
  const [tab, setTab] = useState<'settings' | 'results'>('results');
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
      setError(e instanceof Error ? e.message : t('survey.save_failed'));
    }
    setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-xl bg-white/50 p-1">
        {([['results', t('survey.tab_results')], ['settings', t('survey.tab_settings')]] as const).map(([key, label]) => (
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
              <h3 className="text-base font-semibold text-slate-800">{t('social.channels_and_tag')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">{t('social.where_share')}</p>
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
                    <p className="mb-1 text-xs font-medium text-slate-600">{t('social.our_profile')}</p>
                    <input value={s.handle ?? ''} onChange={(e) => patch({ handle: e.target.value })} placeholder="@euer_profil" className={inputClass} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">{t('social.hashtag')}</p>
                    <input value={s.hashtag ?? ''} onChange={(e) => patch({ hashtag: e.target.value })} placeholder="#euerhashtag" className={inputClass} />
                  </div>
                </div>
                <LocalizedField label={t('social.guest_instructions')} value={s.instructions ?? {}} onChange={(instructions) => patch({ instructions })} multiline />
                <LocalizedField label={t('social.suggested_text')} value={s.share_text ?? {}} onChange={(share_text) => patch({ share_text })} multiline />
              </div>
            </GlassCard>

            <GlassCard className="p-5 sm:p-6">
              <h3 className="text-base font-semibold text-slate-800">{t('social.giveaway_and_post')}</h3>
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={s.giveaway_enabled === true} onChange={(e) => patch({ giveaway_enabled: e.target.checked })} />
                  {t('social.offer_giveaway')}
                </label>
                {s.giveaway_enabled && (
                  <LocalizedField label={t('social.giveaway_text')} value={s.giveaway_text ?? {}} onChange={(giveaway_text) => patch({ giveaway_text })} multiline />
                )}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">{t('social.ask_post_link')}</p>
                  <div className="inline-flex rounded-xl bg-white/60 p-1">
                    {([['required', t('social.level_required')], ['optional', t('social.level_optional')], ['off', t('social.level_off')]] as [FieldLevel, string][]).map(([v, l]) => (
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
                    {t('social.post_link_note')}
                  </p>
                </div>
              </div>
            </GlassCard>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !dirty} className="glass-button-primary disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('survey.save')}
              </button>
              {saved && !dirty && (
                <span className="flex items-center gap-1 text-sm text-emerald-700">
                  <Check className="h-4 w-4" /> {t('survey.saved_live')}
                </span>
              )}
              {dirty && <span className="text-sm text-amber-700">{t('survey.unsaved')}</span>}
            </div>
          </div>

          <div className="xl:sticky xl:top-4 xl:self-start">
            <Preview
              s={s}
              accentColor={accentColorForPark(parkId)}
              accentTextColor={accentTextColorForPark(parkId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SocialResultsView({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const localeTag = useLocaleTag();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SocialResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSocialResults(parkId, days)
      .then((r) => { if (active) { setData(r); setError(null); } })
      .catch((e) => active && setError(e instanceof Error ? e.message : t('survey.load_failed')))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [parkId, days]);

  const maxDay = Math.max(1, ...(data?.timeline ?? []).map((d) => d.unlocked));
  const quote = data && data.unlocked > 0 ? Math.round((data.posted / data.unlocked) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{t('social.results_intro')}</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-200/70 bg-white/70 px-2.5 py-1 text-sm text-slate-700">
          {PERIODS.map((p) => <option key={p.days} value={p.days}>{t(p.label)}</option>)}
        </select>
      </div>

      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {t('survey.loading')}</p>}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {data && data.unlocked === 0 && !loading && (
        <GlassCard className="p-6"><p className="text-sm text-slate-500">{t('social.no_unlocks_period')}</p></GlassCard>
      )}

      {data && data.unlocked > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t('social.kpi_unlocks')} value={String(data.unlocked)} />
            <Kpi label={t('social.kpi_posted')} value={String(data.posted)} sub={t('social.kpi_posted_sub', { percent: quote })} />
            <Kpi label={t('social.kpi_with_link')} value={String(data.with_link)} />
            <Kpi label={t('social.kpi_giveaway')} value={String(data.giveaway)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">{t('social.per_day')}</h4>
              <div className="mt-3 flex h-32 items-end gap-1">
                {data.timeline.map((d) => (
                  <div key={d.day} className="relative flex-1 rounded-t bg-brand-500/25" style={{ height: `${Math.max(6, (d.unlocked / maxDay) * 100)}%` }}
                    title={t('social.day_tooltip', { date: new Date(d.day).toLocaleDateString(localeTag), unlocked: d.unlocked, posted: d.posted })}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand-500" style={{ height: `${d.unlocked > 0 ? (d.posted / d.unlocked) * 100 : 0}%` }} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">{t('social.legend')}</p>
            </GlassCard>
            <GlassCard className="p-5">
              <h4 className="text-sm font-semibold text-slate-800">{t('social.channels')}</h4>
              <div className="mt-3 space-y-1.5">
                {data.platforms.length === 0 && <p className="text-sm text-slate-400">{t('social.no_post_yet')}</p>}
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
            <h4 className="text-sm font-semibold text-slate-800">{t('social.entries')}</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-4">{t('social.col_date')}</th><th className="py-2 pr-4">{t('social.col_name')}</th><th className="py-2 pr-4">{t('social.col_contact')}</th>
                    <th className="py-2 pr-4">{t('social.col_channel')}</th><th className="py-2 pr-4">{t('social.col_post')}</th><th className="py-2">{t('social.col_giveaway')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 text-slate-700">
                      <td className="whitespace-nowrap py-2 pr-4 text-slate-500">{new Date(e.created_at).toLocaleDateString(localeTag)}</td>
                      <td className="py-2 pr-4">{e.name || '–'}</td>
                      <td className="py-2 pr-4">{e.email || e.phone || '–'}</td>
                      <td className="py-2 pr-4">{e.platform ? <span className="capitalize">{e.platform}</span> : '–'}{e.handle ? ` · ${e.handle}` : ''}</td>
                      <td className="py-2 pr-4">
                        {e.post_url ? (
                          <a href={e.post_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                            {t('social.open')} <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : e.posted_at ? t('social.reported') : '–'}
                      </td>
                      <td className="py-2">{e.giveaway_opt_in ? t('social.yes') : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.truncated && <p className="mt-2 text-xs text-slate-400">{t('social.latest_3000')}</p>}
          </GlassCard>
        </>
      )}
    </div>
  );
}
