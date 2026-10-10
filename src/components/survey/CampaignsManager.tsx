import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Loader2, Lock, Plus, Trophy } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { PlanBadge } from '../upgrade/PlanGate';
import { LocalizedField, inputClass } from './SurveyManager';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { PLAN_LABEL_KEY, useEntitlements } from '../../lib/plans';
import { accentColorForPark, accentTextColorForPark } from '../../lib/parkBrand';
import {
  approveEntry,
  drawWinner,
  fetchCampaign,
  fetchCampaigns,
  saveCampaign,
  verifyEntry,
  type Campaign,
  type CampaignDetail,
  type CampaignDraft,
  type CampaignList,
  type CampaignStatus,
  type CampaignType,
} from '../../lib/socialCampaigns';

// Kampagnen im Social-Media-Reiter (docs/PRODUKT_PLAN.md, E1–E3): Liste, 3-Schritt-Assistent,
// Teilnehmer prüfen, Rechte-Freigabe, Rangliste und Ziehung.

const TYPES: { type: CampaignType; label: string; desc: string; pro: boolean }[] = [
  { type: 'share_unlock', label: 'camp.type_share_unlock', desc: 'camp.type_share_unlock_desc', pro: false },
  { type: 'giveaway', label: 'camp.type_giveaway', desc: 'camp.type_giveaway_desc', pro: true },
  { type: 'record', label: 'camp.type_record', desc: 'camp.type_record_desc', pro: true },
];

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  ended: 'bg-slate-100 text-slate-500',
};

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusChip({ status }: { status: CampaignStatus }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {t(`camp.status_${status}`)}
    </span>
  );
}

const EMPTY: CampaignDraft = {
  name: '',
  type: 'share_unlock',
  status: 'draft',
  hashtag: '',
  mention: '',
  prize: '',
  rules_text: {},
  starts_at: null,
  ends_at: null,
};

function pick(value: Record<string, string> | undefined, lang: string): string {
  if (!value) return '';
  return value[lang] || value.de || value.en || Object.values(value)[0] || '';
}

/** Vorschau der Abholseite nach der Freischaltung (wie die Claim-Seite, mit Beispielzahlen). */
function CampaignPreview({ draft, parkId }: { draft: CampaignDraft; parkId: string }) {
  const { t, language } = useI18n();
  const accent = accentColorForPark(parkId);
  const accentText = accentTextColorForPark(parkId);
  const tags = [draft.mention, draft.hashtag].filter(Boolean) as string[];
  const rules = pick(draft.rules_text, language);
  const giveaway = draft.type === 'giveaway';
  return (
    <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
      <p className="text-xs font-medium text-[color:var(--ink-3)]">{t('social.preview_title')}</p>
      <div className="mx-auto max-w-sm space-y-3 rounded-2xl border border-[color:var(--line)] bg-slate-50 p-4">
        <div className="space-y-3 rounded-lg border border-[color:var(--line)] bg-white p-4">
          <p className="text-sm font-semibold text-[color:var(--ink)]">{draft.name || t('social.share_now')}</p>
          <p className="text-sm text-[color:var(--ink-2)]">
            {tags.length > 0 ? t('social.default_share_tagged', { tags: tags.join(' ') }) : t('social.default_share')}
          </p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="rounded border border-[color:var(--line-strong)] px-2.5 py-1 text-xs font-semibold text-[color:var(--ink)]">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <span
            style={{ backgroundColor: accent, color: accentText }}
            className="inline-block rounded px-4 py-2 text-xs font-black uppercase italic"
          >
            {t('social.share_photo')}
          </span>
          <p className="text-sm font-semibold text-[color:var(--ink)]">{t('camp.preview_friends', { n: 3 })}</p>
        </div>

        {giveaway && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">{t('social.giveaway')}</p>
            <p className="mt-1 text-sm text-amber-900">{draft.prize || t('social.default_giveaway_text')}</p>
          </div>
        )}

        {rules && (
          <div className="rounded-lg border border-[color:var(--line)] bg-white p-3">
            <p className="text-xs font-semibold text-[color:var(--ink-3)]">{t('camp.rules')}</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-[color:var(--ink-3)]">{rules}</p>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-[color:var(--line)] bg-white p-3">
          <p className="text-xs font-medium text-slate-500">{t('social.post_link_label')} {t('social.optional_suffix')}</p>
          <div className="h-8 rounded border border-[color:var(--line)] bg-slate-50" />
          <label className="flex items-start gap-2 text-xs text-[color:var(--ink-2)]">
            <input type="checkbox" disabled className="mt-0.5 h-3.5 w-3.5" />
            {t('camp.preview_rights')}
          </label>
        </div>
      </div>
      <p className="text-center text-xs text-[color:var(--ink-3)]">{t('camp.preview_hint')}</p>
    </div>
  );
}

function Editor({
  parkId,
  initial,
  proUnlocked,
  busy,
  onSave,
  onCancel,
}: {
  parkId: string;
  initial: CampaignDraft;
  proUnlocked: boolean;
  busy: boolean;
  onSave: (draft: CampaignDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(initial.id ? 2 : 1);
  const [draft, setDraft] = useState<CampaignDraft>(initial);
  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));

  const example = () =>
    setDraft((d) => ({
      ...d,
      name: 'Sommer-Gewinnspiel',
      type: proUnlocked ? 'giveaway' : 'share_unlock',
      hashtag: '#alpinecoaster',
      mention: '@imster_bergbahnen',
      prize: 'Eine Freifahrt für die ganze Familie',
      rules_text: {
        de: 'Teilnahme ab 18 Jahren. Unter allen geprüften Beiträgen verlosen wir eine Freifahrt für bis zu vier Personen. Der Rechtsweg ist ausgeschlossen.',
        en: 'Open to adults. Among all verified posts we raffle a free ride for up to four people. No recourse to legal action.',
      },
      ends_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([1, 2, 3] as const).map((n) => (
          <span
            key={n}
            className={`rounded-full px-3 py-1 ${step === n ? 'bg-[color:var(--ink)] text-white' : 'bg-slate-100 text-[color:var(--ink-3)]'}`}
          >
            {t(n === 1 ? 'camp.step_type' : n === 2 ? 'camp.step_details' : 'camp.step_review')}
          </span>
        ))}
        {!draft.id && (
          <button type="button" onClick={example} className="ml-auto text-xs font-medium text-brand-700 hover:underline">
            {t('camp.example')}
          </button>
        )}
      </div>

      {step === 1 && (
        <div className="mt-5 space-y-3">
          {!proUnlocked && (
            <p className="text-sm text-[color:var(--ink-3)]">
              {t('camp.locked_types', { plan: t(PLAN_LABEL_KEY.marketing_pro) })}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {TYPES.map((item) => {
              const locked = item.pro && !proUnlocked;
              const selected = draft.type === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  disabled={locked}
                  onClick={() => patch({ type: item.type })}
                  className={`rounded-xl border p-4 text-left transition ${
                    selected ? 'border-brand-600 bg-brand-50' : 'border-[color:var(--line-strong)] hover:bg-slate-50'
                  } ${locked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ink)]">
                    {t(item.label)}
                    {locked && <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden />}
                  </span>
                  <span className="mt-1 block text-xs text-[color:var(--ink-3)]">{t(item.desc)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.name')}</p>
            <input className={inputClass} value={draft.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.hashtag')}</p>
              <input className={inputClass} value={draft.hashtag ?? ''} placeholder="#" onChange={(e) => patch({ hashtag: e.target.value })} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.mention')}</p>
              <input className={inputClass} value={draft.mention ?? ''} placeholder="@" onChange={(e) => patch({ mention: e.target.value })} />
            </div>
          </div>
          {draft.type === 'giveaway' && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.prize')}</p>
              <input className={inputClass} value={draft.prize ?? ''} maxLength={200} onChange={(e) => patch({ prize: e.target.value })} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.starts')}</p>
              <input
                type="datetime-local"
                className={inputClass}
                value={toLocalInput(draft.starts_at)}
                onChange={(e) => patch({ starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('camp.ends')}</p>
              <input
                type="datetime-local"
                className={inputClass}
                value={toLocalInput(draft.ends_at)}
                onChange={(e) => patch({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
          </div>
          <LocalizedField label={t('camp.rules')} value={draft.rules_text} onChange={(rules_text) => patch({ rules_text })} multiline />
        </div>
      )}

      {step === 3 && (
        <div className="mt-5 space-y-2 text-sm text-[color:var(--ink-2)]">
          <p className="text-base font-semibold text-[color:var(--ink)]">{draft.name || '–'}</p>
          <p>{t(`camp.type_${draft.type}`)}</p>
          {draft.prize && <p>{t('camp.prize')}: {draft.prize}</p>}
          <p className="pt-2 text-xs text-[color:var(--ink-3)]">{t('camp.one_active_hint')}</p>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {step > 1 && (
          <button type="button" className="glass-button-secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2)}>
            {t('camp.back')}
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="glass-button-primary"
            disabled={step === 2 && !draft.name.trim()}
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
          >
            {t('camp.next')}
          </button>
        ) : (
          <>
            <button type="button" className="glass-button-secondary" disabled={busy} onClick={() => onSave({ ...draft, status: draft.status === 'ended' ? 'ended' : 'draft' })}>
              {t('camp.save_draft')}
            </button>
            <button type="button" className="glass-button-primary" disabled={busy} onClick={() => onSave({ ...draft, status: 'active' })}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('camp.save_activate')}
            </button>
          </>
        )}
        <button type="button" className="ml-auto text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]" onClick={onCancel}>
          {t('camp.cancel')}
        </button>
      </div>
    </GlassCard>
    <CampaignPreview draft={draft} parkId={parkId} />
    </div>
  );
}

function Detail({
  parkId,
  campaignId,
  onBack,
  onEdit,
  proUnlocked,
}: {
  parkId: string;
  campaignId: string;
  onBack: () => void;
  onEdit: (campaign: Campaign) => void;
  proUnlocked: boolean;
}) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [weighted, setWeighted] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchCampaign(parkId, campaignId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [parkId, campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  if (!data) {
    return error ? (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
    ) : (
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
    );
  }
  const { campaign, entries, leaderboard } = data;
  const winner = entries.find((e) => e.id === campaign.winner_entry_id);
  const canDraw = campaign.type === 'giveaway' && proUnlocked;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
        <ArrowLeft className="h-4 w-4" /> {t('camp.all')}
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-light text-[color:var(--ink)]">{campaign.name}</h3>
        <StatusChip status={campaign.status} />
        <button type="button" className="ml-auto glass-button-secondary" onClick={() => onEdit(campaign)}>
          {t('camp.edit')}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {canDraw && (
        <GlassCard className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Trophy className="h-5 w-5 text-brand-600" aria-hidden />
            {winner ? (
              <p className="text-sm text-[color:var(--ink)]">
                <span className="font-semibold">{t('camp.winner')}: {winner.name || winner.handle || winner.email_masked || '–'}</span>
                {campaign.drawn_at && (
                  <span className="ml-2 text-[color:var(--ink-3)]">
                    {t('camp.drawn_at', { date: new Date(campaign.drawn_at).toLocaleDateString(locale) })}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm text-[color:var(--ink-3)]">{t('camp.draw_hint')}</p>
            )}
            <label className="ml-auto flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
              <input type="checkbox" checked={weighted} onChange={(e) => setWeighted(e.target.checked)} />
              {t('camp.weighted')}
            </label>
            <button
              type="button"
              className="glass-button-primary"
              disabled={busy}
              onClick={() => void run(() => drawWinner(parkId, campaignId, { redraw: Boolean(winner), weighted }))}
            >
              {winner ? t('camp.redraw') : t('camp.draw')}
            </button>
          </div>
        </GlassCard>
      )}

      {leaderboard.length > 0 && (
        <GlassCard className="p-5">
          <h4 className="text-sm font-semibold text-[color:var(--ink)]">{t('camp.leaderboard')}</h4>
          <ol className="mt-3 space-y-1.5">
            {leaderboard.slice(0, 10).map((entry, index) => (
              <li key={entry.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right text-[color:var(--ink-3)]">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[color:var(--ink)]">{entry.name || entry.handle || entry.email_masked || '–'}</span>
                <span className="tabular-nums text-[color:var(--ink-2)]">{entry.visitors} {t('camp.visitors')}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      )}

      <GlassCard className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--line)] px-5 py-4">
          <h4 className="text-sm font-semibold text-[color:var(--ink)]">{t('camp.participants')} ({entries.length})</h4>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-[color:var(--ink-3)]">{t('camp.no_entries')}</p>
        ) : (
          <ul className="divide-y divide-[color:var(--line)]">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[color:var(--ink)]">
                    {entry.name || entry.handle || entry.email_masked || '–'}
                    {entry.handle && entry.name && <span className="ml-2 font-normal text-[color:var(--ink-3)]">{entry.handle}</span>}
                  </p>
                  <p className="text-xs text-[color:var(--ink-3)]">
                    {[entry.platform, entry.email_masked, new Date(entry.created_at).toLocaleDateString(locale)].filter(Boolean).join(' · ')}
                    {entry.giveaway_opt_in && ` · ${t('camp.giveaway_yes')}`}
                    {entry.visitors > 0 && ` · ${entry.visitors} ${t('camp.visitors')}`}
                  </p>
                </div>
                {entry.post_url && (
                  <a href={entry.post_url} target="_blank" rel="noreferrer" className="text-[color:var(--ink-3)] hover:text-brand-700" aria-label={entry.post_url}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <label className="flex items-center gap-1.5 text-sm text-[color:var(--ink-2)]">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.verified_at)}
                    disabled={busy}
                    onChange={(e) => void run(() => verifyEntry(parkId, entry.id, e.target.checked))}
                  />
                  {t('camp.verified')}
                </label>
                {entry.photo_rights && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => approveEntry(parkId, entry.id, !entry.approved_at))}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      entry.approved_at
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-100'
                    }`}
                  >
                    {entry.approved_at ? <><Check className="mr-1 inline h-3 w-3" />{t('camp.approved')}</> : t('camp.approve')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

export default function CampaignsManager({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const entitlements = useEntitlements();
  const proUnlocked = entitlements.loading || entitlements.has('social_campaigns');
  const [list, setList] = useState<CampaignList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CampaignDraft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await fetchCampaigns(parkId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [parkId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(draft: CampaignDraft) {
    setBusy(true);
    try {
      setList(await saveCampaign(parkId, draft));
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  const asDraft = (c: Campaign): CampaignDraft => ({
    id: c.id, name: c.name, type: c.type, status: c.status, hashtag: c.hashtag, mention: c.mention,
    prize: c.prize, rules_text: c.rules_text ?? {}, starts_at: c.starts_at, ends_at: c.ends_at,
  });

  if (editing) {
    return (
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Editor parkId={parkId} initial={editing} proUnlocked={proUnlocked} busy={busy} onSave={(d) => void save(d)} onCancel={() => setEditing(null)} />
      </div>
    );
  }

  if (openId) {
    return (
      <Detail
        parkId={parkId}
        campaignId={openId}
        proUnlocked={proUnlocked}
        onBack={() => { setOpenId(null); void load(); }}
        onEdit={(c) => { setOpenId(null); setEditing(asDraft(c)); }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-[color:var(--ink)]">{t('camp.title')}</h3>
        <PlanBadge feature="social_campaigns" />
        <button type="button" className="ml-auto glass-button-primary" onClick={() => setEditing(EMPTY)} disabled={list?.migration_pending}>
          <Plus className="h-4 w-4" /> {t('camp.new')}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {list?.migration_pending && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('camp.migration_pending')}</p>
      )}
      {!list && !error && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
      {list && !list.migration_pending && list.campaigns.length === 0 && (
        <GlassCard className="p-6">
          <p className="text-sm text-[color:var(--ink-3)]">{t('camp.empty')}</p>
        </GlassCard>
      )}
      {list?.campaigns.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => setOpenId(c.id)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[color:var(--line)] bg-white p-4 text-left transition hover:border-brand-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[color:var(--ink)]">{c.name}</span>
            <span className="block text-xs text-[color:var(--ink-3)]">
              {t(`camp.type_${c.type}`)}
              {c.ends_at && ` · ${t('camp.ends')} ${new Date(c.ends_at).toLocaleDateString(locale)}`}
            </span>
          </span>
          <span className="text-xs text-[color:var(--ink-3)]">
            {t('camp.entries_count', { count: c.entries_total ?? 0, verified: c.entries_verified ?? 0 })}
          </span>
          <StatusChip status={c.status} />
        </button>
      ))}
    </div>
  );
}
