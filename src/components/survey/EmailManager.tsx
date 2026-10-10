import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { PlanBadge } from '../upgrade/PlanGate';
import { inputClass } from './SurveyManager';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { usePark } from '../../contexts/ParkContext';
import { blocksToHtml } from '../../lib/emailHtml';
import {
  deleteEmailCampaign,
  fetchEmailCampaign,
  fetchEmailOverview,
  previewAudience,
  saveEmailCampaign,
  saveAutomation,
  saveEmailSettings,
  sendEmailCampaign,
  sendSeasonStart,
  sendTestEmail,
  type AutomationType,
  type EmailAutomation,
  type EmailBlock,
  type EmailDraft,
  type EmailOverview,
  type EmailSettings,
  type EmailStatus,
} from '../../lib/emailCampaigns';

// E-Mail-Marketing im CRM (docs/PRODUKT_PLAN.md, F2): Liste mit Kontingent, Absender-Einstellungen,
// Editor mit Blöcken und Live-Vorschau, Empfänger prüfen, Test-Mail, Senden/Planen.

const LANGS = ['de', 'en', 'es', 'fr', 'it', 'nl', 'lv', 'pl', 'cs', 'pt', 'tr'];
const STATUS_STYLE: Record<EmailStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
  sending: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  sent: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

const NEW_DRAFT: EmailDraft = {
  name: '', subject: '', preheader: '', language: null, segment: {}, html: '',
  body_json: [{ type: 'heading', text: '' }, { type: 'text', text: '' }],
};

function emptyBlock(type: EmailBlock['type']): EmailBlock {
  switch (type) {
    case 'heading': return { type, text: '' };
    case 'text': return { type, text: '' };
    case 'image': return { type, url: '', alt: '' };
    case 'button': return { type, label: '', url: '' };
    default: return { type: 'divider' };
  }
}

function SettingsForm({ parkId, initial, onSaved }: { parkId: string; initial: EmailSettings | null; onSaved: (s: EmailSettings) => void }) {
  const { t } = useI18n();
  const [s, setS] = useState<EmailSettings>(initial ?? { sender_name: '', reply_to: '', footer_address: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await saveEmailSettings(parkId, s);
      onSaved(res.settings);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }
  return (
    <GlassCard className="space-y-4 p-5 sm:p-6">
      <p className="text-sm text-[color:var(--ink-3)]">{t('email.settings_intro')}</p>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-600">{t('email.sender_name')}</p>
        <input className={inputClass} value={s.sender_name} onChange={(e) => { setS({ ...s, sender_name: e.target.value }); setDone(false); }} />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-600">{t('email.reply_to')}</p>
        <input type="email" className={inputClass} value={s.reply_to} onChange={(e) => { setS({ ...s, reply_to: e.target.value }); setDone(false); }} />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-slate-600">{t('email.footer_address')}</p>
        <textarea rows={3} className={inputClass} value={s.footer_address} onChange={(e) => { setS({ ...s, footer_address: e.target.value }); setDone(false); }} />
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" className="glass-button-primary" disabled={busy} onClick={() => void save()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.save')}
        </button>
        {done && <span className="flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" /> {t('email.saved')}</span>}
      </div>
    </GlassCard>
  );
}

function Editor({ parkId, initial, locked, onBack }: { parkId: string; initial: EmailDraft; locked: boolean; onBack: () => void }) {
  const isTemplate = Boolean(initial.template_for);
  const { t } = useI18n();
  const { parkName } = usePark();
  const [draft, setDraft] = useState<EmailDraft>(initial);
  const [id, setId] = useState<string | undefined>(initial.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audience, setAudience] = useState<number | null>(null);
  const [scheduled, setScheduled] = useState('');

  const html = useMemo(() => blocksToHtml(draft.body_json), [draft.body_json]);
  const previewHtml = useMemo(
    () => html.split('{{name}}').join('Alex').split('{{park}}').join(parkName ?? ''),
    [html, parkName],
  );
  const patch = (p: Partial<EmailDraft>) => { setDraft((d) => ({ ...d, ...p })); setAudience(null); setNotice(null); };
  const setBlock = (index: number, block: EmailBlock) => patch({ body_json: draft.body_json.map((b, i) => (i === index ? block : b)) });
  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= draft.body_json.length) return;
    const list = [...draft.body_json];
    [list[index], list[to]] = [list[to], list[index]];
    patch({ body_json: list });
  };

  async function run<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      return await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  const persist = async (): Promise<string | null> => {
    const res = await saveEmailCampaign(parkId, { ...draft, id, html, template_for: id ? undefined : initial.template_for });
    setId(res.id);
    return res.id;
  };

  const countries = (draft.segment.countries ?? []).join(', ');

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
          <ArrowLeft className="h-4 w-4" /> {t('email.back')}
        </button>
        {locked && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('email.locked_edit')}</p>}
        {isTemplate && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{t('email.template_note')}</p>}
        <fieldset disabled={locked} className="space-y-5">
          <GlassCard className="space-y-4 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">{t('email.name')}</p>
                <input className={inputClass} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">{t('email.subject')}</p>
                <input className={inputClass} value={draft.subject} onChange={(e) => patch({ subject: e.target.value })} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">{t('email.preheader')}</p>
              <input className={inputClass} value={draft.preheader} onChange={(e) => patch({ preheader: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">{t('email.language')}</p>
                <select className={inputClass} value={draft.language ?? ''} onChange={(e) => patch({ language: e.target.value || null })}>
                  <option value="">{t('email.all_languages')}</option>
                  {LANGS.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">{t('email.since')}</p>
                <input
                  type="date"
                  className={inputClass}
                  value={draft.segment.since ? draft.segment.since.slice(0, 10) : ''}
                  onChange={(e) => patch({ segment: { ...draft.segment, since: e.target.value ? new Date(e.target.value).toISOString() : undefined } })}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">{t('email.countries')}</p>
                <input
                  className={inputClass}
                  value={countries}
                  onChange={(e) => patch({ segment: { ...draft.segment, countries: e.target.value.split(/[ ,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean) } })}
                />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-4 p-5 sm:p-6">
            <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('email.content')}</h3>
            <p className="text-xs text-[color:var(--ink-3)]">{t('email.placeholders_hint')}</p>
            {draft.body_json.map((block, index) => (
              <div key={index} className="rounded-xl border border-[color:var(--line)] bg-slate-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-medium text-[color:var(--ink-3)]">{t(`email.add_${block.type}`)}</span>
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={() => move(index, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="↑"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => move(index, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="↓"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => patch({ body_json: draft.body_json.filter((_, i) => i !== index) })} className="rounded p-1 text-rose-400 hover:bg-rose-50" aria-label={t('email.delete')}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {block.type === 'heading' && <input className={inputClass} value={block.text} onChange={(e) => setBlock(index, { ...block, text: e.target.value })} />}
                {block.type === 'text' && <textarea rows={4} className={inputClass} value={block.text} onChange={(e) => setBlock(index, { ...block, text: e.target.value })} />}
                {block.type === 'image' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={inputClass} placeholder={t('email.image_url')} value={block.url} onChange={(e) => setBlock(index, { ...block, url: e.target.value })} />
                    <input className={inputClass} placeholder="Alt" value={block.alt} onChange={(e) => setBlock(index, { ...block, alt: e.target.value })} />
                  </div>
                )}
                {block.type === 'button' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className={inputClass} placeholder={t('email.button_label')} value={block.label} onChange={(e) => setBlock(index, { ...block, label: e.target.value })} />
                    <input className={inputClass} placeholder={t('email.button_url')} value={block.url} onChange={(e) => setBlock(index, { ...block, url: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {(['heading', 'text', 'image', 'button', 'divider'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => patch({ body_json: [...draft.body_json, emptyBlock(type)] })}
                  className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[color:var(--line-strong)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-2)] hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> {t(`email.add_${type}`)}
                </button>
              ))}
            </div>
          </GlassCard>
        </fieldset>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        {audience !== null && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-[color:var(--ink-2)]">{t('email.audience_result', { count: audience })}</p>}
        <p className="text-xs text-[color:var(--ink-3)]">{t('email.consent_note')}</p>

        <div className="flex flex-wrap items-end gap-3">
          <button type="button" className="glass-button-secondary" disabled={busy !== null || locked || !draft.name.trim()} onClick={() => void run('save', async () => { await persist(); setNotice(t('email.saved')); })}>
            {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.save')}
          </button>
          <button type="button" className="glass-button-secondary" hidden={isTemplate} disabled={busy !== null || !draft.name.trim()} onClick={() => void run('audience', async () => { setAudience((await previewAudience(parkId, draft.language, draft.segment)).count); })}>
            {busy === 'audience' && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.check_audience')}
          </button>
          <button type="button" className="glass-button-secondary" disabled={busy !== null || !draft.name.trim()} onClick={() => void run('test', async () => {
            const saved = await persist();
            if (saved) setNotice(t('email.test_sent', { to: (await sendTestEmail(parkId, saved)).to }));
          })}>
            {busy === 'test' && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.test')}
          </button>
          {!locked && id && !isTemplate && (
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
              disabled={busy !== null}
              onClick={() => void run('delete', async () => {
                if (!window.confirm(t('email.confirm_delete'))) return;
                await deleteEmailCampaign(parkId, id);
                onBack();
              })}
            >
              {t('email.delete')}
            </button>
          )}
          {!locked && !isTemplate && (
            <>
              <label className="text-xs text-[color:var(--ink-3)]">
                {t('email.schedule')}
                <input type="datetime-local" className={`${inputClass} mt-1`} value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
              </label>
              <button type="button" className="glass-button-primary" disabled={busy !== null || !draft.name.trim()} onClick={() => void run('send', async () => {
                const count = (await previewAudience(parkId, draft.language, draft.segment)).count;
                setAudience(count);
                if (!window.confirm(t('email.confirm_send', { count }))) return;
                const saved = await persist();
                if (!saved) return;
                await sendEmailCampaign(parkId, saved, scheduled ? new Date(scheduled).toISOString() : undefined);
                setNotice(t('email.sent_ok'));
                setTimeout(onBack, 1500);
              })}>
                {busy === 'send' && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.send')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
        <p className="text-xs font-medium text-[color:var(--ink-3)]">{t('email.preview')}</p>
        <div className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white">
          <div className="border-b border-[color:var(--line)] px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-[color:var(--ink)]">{draft.subject || '…'}</p>
            {draft.preheader && <p className="truncate text-xs text-[color:var(--ink-3)]">{draft.preheader}</p>}
          </div>
          <iframe title={t('email.preview')} sandbox="" srcDoc={previewHtml} className="h-[560px] w-full border-0" />
        </div>
      </div>
    </div>
  );
}

function AutomationsPanel({ parkId, data, onReload, onEdit, onError }: {
  parkId: string;
  data: EmailOverview;
  onReload: () => Promise<void>;
  onEdit: (type: AutomationType, campaignId: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const allowed = data.automations_allowed === true;
  const find = (type: AutomationType): EmailAutomation | undefined => data.automations?.find((a) => a.type === type);
  const welcome = find('welcome');
  const season = find('season_start');

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    onError(null);
    setNotice(null);
    try {
      await action();
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  }

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('email.auto_title')}</h3>
        <PlanBadge feature="email_automations" />
      </div>
      {!allowed && (
        <p className="text-sm text-[color:var(--ink-3)]">
          {t('email.auto_locked')} <Link to="/plaene" className="font-medium text-brand-700 hover:underline">{t('shop.view_plans')}</Link>
        </p>
      )}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <GlassCard className={`space-y-3 p-4 ${allowed ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{t('email.auto_welcome')}</p>
            <p className="text-xs text-[color:var(--ink-3)]">{t('email.auto_welcome_desc')}</p>
          </div>
          <button type="button" disabled={!allowed || busy !== null} className="glass-button-secondary" onClick={() => onEdit('welcome', welcome?.campaign_id ?? null)}>
            {welcome?.campaign_id ? t('email.auto_edit') : t('email.auto_write')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
            <input
              type="checkbox"
              checked={welcome?.enabled === true}
              disabled={!allowed || busy !== null || !welcome?.campaign_id}
              onChange={(e) => void run('welcome', () => saveAutomation(parkId, 'welcome', e.target.checked, welcome?.delay_hours ?? 0))}
            />
            {welcome?.enabled ? t('email.auto_on') : t('email.auto_off')}
          </label>
          <label className="flex items-center gap-2 text-sm text-[color:var(--ink-2)]">
            {t('email.auto_delay')}
            <select
              className="rounded-lg border border-[color:var(--line-strong)] bg-white px-2 py-1 text-sm"
              disabled={!allowed || busy !== null}
              value={welcome?.delay_hours ?? 0}
              onChange={(e) => void run('welcome', () => saveAutomation(parkId, 'welcome', welcome?.enabled === true, Number(e.target.value)))}
            >
              {[0, 1, 24, 72].map((h) => (
                <option key={h} value={h}>{h === 0 ? t('email.auto_delay_now') : t('email.auto_delay_hours', { n: h })}</option>
              ))}
            </select>
          </label>
        </div>
      </GlassCard>

      <GlassCard className={`space-y-3 p-4 ${allowed ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[color:var(--ink)]">{t('email.auto_season')}</p>
            <p className="text-xs text-[color:var(--ink-3)]">{t('email.auto_season_desc')}</p>
          </div>
          <button type="button" disabled={!allowed || busy !== null} className="glass-button-secondary" onClick={() => onEdit('season_start', season?.campaign_id ?? null)}>
            {season?.campaign_id ? t('email.auto_edit') : t('email.auto_write')}
          </button>
          <button
            type="button"
            disabled={!allowed || busy !== null || !season?.campaign_id}
            className="glass-button-primary"
            onClick={() => {
              if (!window.confirm(t('email.auto_confirm_season'))) return;
              void run('season', async () => {
                const res = await sendSeasonStart(parkId);
                setNotice(t('email.auto_season_ok', { count: res.recipients }));
              });
            }}
          >
            {busy === 'season' && <Loader2 className="h-4 w-4 animate-spin" />} {t('email.auto_send_now')}
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-4 opacity-60">
        <p className="text-sm font-semibold text-[color:var(--ink)]">{t('email.auto_photo')}</p>
        <p className="text-xs text-[color:var(--ink-3)]">{t('email.auto_photo_soon')}</p>
      </GlassCard>
    </div>
  );
}

export default function EmailManager({ parkId }: { parkId: string }) {
  const { t } = useI18n();
  const locale = useLocaleTag();
  const [data, setData] = useState<EmailOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'settings' | 'edit'>('list');
  const [editing, setEditing] = useState<{ draft: EmailDraft; locked: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchEmailOverview(parkId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [parkId]);
  useEffect(() => { void load(); }, [load]);

  async function open(id: string) {
    try {
      const { campaign } = await fetchEmailCampaign(parkId, id);
      setEditing({
        locked: campaign.status !== 'draft',
        draft: {
          id: campaign.id, name: campaign.name, subject: campaign.subject, preheader: campaign.preheader,
          language: campaign.language, body_json: campaign.body_json ?? [], html: campaign.html, segment: campaign.segment ?? {},
        },
      });
      setView('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function editTemplate(type: AutomationType, campaignId: string | null) {
    if (!campaignId) {
      setEditing({ locked: false, draft: { ...NEW_DRAFT, name: t(type === 'welcome' ? 'email.auto_welcome' : 'email.auto_season'), template_for: type } });
      setView('edit');
      return;
    }
    try {
      const { campaign } = await fetchEmailCampaign(parkId, campaignId);
      setEditing({
        locked: false,
        draft: {
          id: campaign.id, template_for: type, name: campaign.name, subject: campaign.subject, preheader: campaign.preheader,
          language: campaign.language, body_json: campaign.body_json ?? [], html: campaign.html, segment: campaign.segment ?? {},
        },
      });
      setView('edit');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (view === 'edit' && editing) {
    return <Editor parkId={parkId} initial={editing.draft} locked={editing.locked} onBack={() => { setView('list'); void load(); }} />;
  }
  if (view === 'settings') {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setView('list')} className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
          <ArrowLeft className="h-4 w-4" /> {t('email.back')}
        </button>
        <SettingsForm parkId={parkId} initial={data?.settings ?? null} onSaved={(settings) => setData((d) => (d ? { ...d, settings } : d))} />
      </div>
    );
  }

  const usage = data?.usage;
  const percent = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.sent / usage.quota) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-semibold text-[color:var(--ink)]">{t('email.title')}</h3>
        <PlanBadge feature="email_marketing" />
        <button type="button" className="ml-auto glass-button-secondary" onClick={() => setView('settings')}>{t('email.settings')}</button>
        <button type="button" className="glass-button-primary" disabled={data?.migration_pending} onClick={() => { setEditing({ draft: NEW_DRAFT, locked: false }); setView('edit'); }}>
          <Plus className="h-4 w-4" /> {t('email.new')}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {data?.migration_pending && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('email.migration_pending')}</p>}
      {!data && !error && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}

      {usage && usage.quota > 0 && (
        <GlassCard className="p-4">
          <p className="text-sm text-[color:var(--ink-2)]">{t('email.usage', { sent: usage.sent.toLocaleString(locale), quota: usage.quota.toLocaleString(locale) })}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full ${percent >= 80 ? 'bg-amber-500' : 'bg-brand-600'}`} style={{ width: `${percent}%` }} />
          </div>
          {percent >= 80 && (
            <p className="mt-2 text-xs text-[color:var(--ink-3)]">
              {t('email.usage_hint')} <Link to="/plaene" className="font-medium text-brand-700 hover:underline">{t('shop.view_plans')}</Link>
            </p>
          )}
        </GlassCard>
      )}

      {data && !data.migration_pending && data.campaigns.length === 0 && (
        <GlassCard className="p-6"><p className="text-sm text-[color:var(--ink-3)]">{t('email.empty')}</p></GlassCard>
      )}
      {data?.campaigns.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => void open(c.id)}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[color:var(--line)] bg-white p-4 text-left transition hover:border-brand-300"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-[color:var(--ink)]">{c.name}</span>
            <span className="block truncate text-xs text-[color:var(--ink-3)]">{c.subject || '…'}</span>
          </span>
          {c.status !== 'draft' && (
            <span className="text-xs text-[color:var(--ink-3)]">
              {t('email.recipients_count', { count: c.recipients })}
              {c.status === 'sent' && c.recipients > 0 && ` · ${t('email.open_rate', { percent: Math.round((c.opened / c.recipients) * 100) })}`}
            </span>
          )}
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}>{t(`email.status_${c.status}`)}</span>
        </button>
      ))}
      {data && !data.migration_pending && (
        <AutomationsPanel parkId={parkId} data={data} onReload={load} onEdit={(type, id) => void editTemplate(type, id)} onError={setError} />
      )}
    </div>
  );
}
