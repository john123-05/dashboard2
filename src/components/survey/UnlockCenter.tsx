import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import SurveyManager from './SurveyManager';
import SocialManager from './SocialManager';
import ContactSettings from './ContactSettings';
import { fetchSurveyConfig, setUnlockMode, type SurveyConfig, type UnlockMode } from '../../lib/surveyApi';

type TabKey = 'contacts' | 'survey' | 'social';

const TABS: { key: TabKey; mode: UnlockMode; label: string }[] = [
  { key: 'contacts', mode: 'email', label: 'E-Mail / Telefon' },
  { key: 'survey', mode: 'survey', label: 'Umfrage' },
  { key: 'social', mode: 'social', label: 'Social Media' },
];

/**
 * CRM-Kopf: eine Leiste mit den drei Wegen zum Freischalten (E-Mail / Telefon,
 * Umfrage, Social Media). Ein Punkt markiert den Weg, den Gäste gerade sehen;
 * „Aktivieren“ stellt den angezeigten Weg live. Der erste Reiter bekommt die
 * Kontaktliste als `children`.
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
        setTab(TABS.find((t) => t.mode === c.settings.mode)?.key ?? 'contacts');
        setFirst(false);
      }
    });
  }, [load, first]);

  async function activate(mode: UnlockMode) {
    if (!config || busy) return;
    setBusy(mode);
    setError(null);
    try {
      setConfig(await setUnlockMode(parkId, mode));
    } catch (e) {
      // z. B. Umfrage ohne Fragen: die Meldung sagt, was fehlt.
      setError(e instanceof Error ? e.message : 'Umschalten fehlgeschlagen.');
    }
    setBusy(null);
  }

  const active = config?.settings.mode;
  const shown = TABS.find((t) => t.key === tab);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-white/50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {active === t.mode && <span className="h-2 w-2 rounded-full bg-emerald-500" title="Für Gäste aktiv" />}
              {t.label}
            </button>
          ))}
        </div>
        {shown && active !== shown.mode && (
          <button
            type="button"
            onClick={() => void activate(shown.mode)}
            disabled={!config || busy !== null}
            className="glass-button-secondary"
          >
            {busy === shown.mode ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Für Gäste aktivieren
          </button>
        )}
      </div>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

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
