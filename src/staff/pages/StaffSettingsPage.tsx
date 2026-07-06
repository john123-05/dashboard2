import { useMemo, useState } from 'react';
import { appendActivityEvent } from '../lib/activity-feed';
import { isTourDisabled, resetTourSessionFlag, setTourDisabled } from '../lib/onboarding-settings';

export default function SettingsPage() {
  const [tourEnabled, setTourEnabled] = useState(() => !isTourDisabled());
  const label = useMemo(
    () => (tourEnabled ? 'Walkthrough beim Login: Aktiv' : 'Walkthrough beim Login: Deaktiviert'),
    [tourEnabled],
  );

  const onToggleTour = (enabled: boolean) => {
    setTourEnabled(enabled);
    setTourDisabled(!enabled);
    resetTourSessionFlag();
    appendActivityEvent({
      title: 'Einstellung geaendert',
      details: enabled ? 'Walkthrough aktiviert' : 'Walkthrough deaktiviert',
      level: 'info',
    });
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2>Einstellungen</h2>
        <p className="note">Hier kannst du globale Dashboard-Einstellungen verwalten.</p>
      </div>

      <div className="card">
        <h3>Onboarding / Walkthrough</h3>
        <p className="note">
          Wenn aktiviert, wird die Tour nach dem Login angezeigt. Wenn deaktiviert, erscheint sie nicht automatisch.
        </p>
        <div className="setting-row">
          <div>
            <p className="setting-title">{label}</p>
            <p className="note">Aenderungen werden direkt gespeichert.</p>
          </div>
          <label className="switch" aria-label="Walkthrough beim Login anzeigen">
            <input
              type="checkbox"
              checked={tourEnabled}
              onChange={(e) => onToggleTour(e.target.checked)}
            />
            <span className="switch-slider" />
          </label>
        </div>

        <div className="setting-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onToggleTour(true);
              resetTourSessionFlag();
            }}
          >
            Walkthrough beim naechsten Login wieder zeigen
          </button>
        </div>
      </div>
    </div>
  );
}
