import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AtSign, Check, ClipboardList, Loader2, Share2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import SurveyManager from './SurveyManager';
import SocialManager from './SocialManager';
import ContactSettings from './ContactSettings';
import { fetchSurveyConfig, setUnlockMode, type SurveyConfig, type UnlockMode } from '../../lib/surveyApi';

type TabKey = 'contacts' | 'survey' | 'social';

const MODES: { mode: UnlockMode; tab: TabKey; title: string; sub: string; Icon: typeof AtSign }[] = [
  { mode: 'email', tab: 'contacts', title: 'E-Mail / Telefon', sub: 'Gäste geben Kontaktdaten an', Icon: AtSign },
  { mode: 'survey', tab: 'survey', title: 'Umfrage', sub: 'Gäste beantworten Fragen', Icon: ClipboardList },
  { mode: 'social', tab: 'social', title: 'Social Media', sub: 'Gäste teilen ihr Foto', Icon: Share2 },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'contacts', label: 'Kontakte' },
  { key: 'survey', label: 'Umfrage' },
  { key: 'social', label: 'Social Media' },
];

/**
 * CRM-Kopf: oben wählt man, was Gäste tun, um ihr Foto freizuschalten
 * (wirkt sofort auf der Claim-Seite). Darunter je Weg ein Reiter mit
 * Einstellungen und Auswertung. Der Reiter „Kontakte“ bekommt die Liste
 * als `children`.
 */
export default function UnlockCenter({ parkId, children }: { parkId: string; children: ReactNode }) {
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [tab, setTab] = useState<TabKey>('contacts');
  const [busy, setBusy] = useState<UnlockMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState(true);

  const load = useCallback(async () => {
    try {
      const c = await fetchSurveyConfig(parkId);
      setConfig(c);
      setError(null);
      return c;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Einstellungen konnten nicht geladen werden.');
      return null;
    }
  }, [parkId]);

  useEffect(() => {
    void load().then((c) => {
      if (c && first) {
        setTab(MODES.find((m) => m.mode === c.settings.mode)?.tab ?? 'contacts');
        setFirst(false);
      }
    });
  }, [load, first]);

  async function choose(mode: UnlockMode, target: TabKey) {
    if (!config || busy) return;
    if (config.settings.mode === mode) { setTab(target); return; }
    setBusy(mode);
    setError(null);
    try {
      setConfig(await setUnlockMode(parkId, mode));
      setTab(target);
    } catch (e) {
      // z. B. Umfrage ohne Fragen: dann zum passenden Reiter, damit man es beheben kann.
      setError(e instanceof Error ? e.message : 'Umschalten fehlgeschlagen.');
      setTab(target);
    }
    setBusy(null);
  }

  const active = config?.settings.mode;

  return (
    <div className="space-y-5">
      <GlassCard className="p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-800">Was sollen Gäste tun, um ihr Foto freizuschalten?</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {MODES.map(({ mode, tab: target, title, sub, Icon }) => {
            const on = active === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => void choose(mode, target)}
                disabled={!config || busy !== null}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                  on ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-300' : 'border-slate-200/70 bg-white/60 hover:bg-white'
                }`}
              >
                <span className={`mt-0.5 rounded-lg p-2 ${on ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                  {busy === mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    {title}
                    {on && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <Check className="h-3 w-3" /> Aktiv
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      </GlassCard>

      <div className="inline-flex rounded-xl bg-white/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contacts' && (
        <div className="space-y-5">
          {config && (
            <ContactSettings
              parkId={parkId}
              email={config.settings.email_mode ?? 'required'}
              phone={config.settings.phone_mode ?? 'off'}
              onSaved={() => void load()}
            />
          )}
          {children}
        </div>
      )}
      {tab === 'survey' && <SurveyManager parkId={parkId} />}
      {tab === 'social' && config && (
        <SocialManager parkId={parkId} initial={config.settings.social ?? {}} onSaved={() => void load()} />
      )}
    </div>
  );
}
