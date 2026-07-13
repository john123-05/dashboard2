import { useEffect, useMemo, useState } from 'react';
import { appendActivityEvent } from '../lib/activity-feed';
import { isTourDisabled, resetTourSessionFlag, setTourDisabled } from '../lib/onboarding-settings';
import {
  getCurrentSubscription,
  isPushSupported,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/pushNotifications';

export default function SettingsPage() {
  const [tourEnabled, setTourEnabled] = useState(() => !isTourDisabled());
  const label = useMemo(
    () => (tourEnabled ? 'Walkthrough beim Login: Aktiv' : 'Walkthrough beim Login: Deaktiviert'),
    [tourEnabled],
  );

  const pushSupported = useMemo(() => isPushSupported(), []);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushChecked, setPushChecked] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!pushSupported) {
      setPushChecked(true);
      return;
    }
    getCurrentSubscription()
      .then((sub) => setPushSubscribed(!!sub))
      .finally(() => setPushChecked(true));
  }, [pushSupported]);

  async function onTogglePush(enabled: boolean) {
    setPushBusy(true);
    setPushError(null);
    setTestResult(null);
    try {
      if (enabled) {
        await subscribeToPush();
        setPushSubscribed(true);
      } else {
        await unsubscribeFromPush();
        setPushSubscribed(false);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setPushBusy(false);
    }
  }

  async function onSendTestPush() {
    setTestBusy(true);
    setTestResult(null);
    try {
      await sendTestPush();
      setTestResult({ ok: true, message: 'Test-Benachrichtigung gesendet — sollte gleich ankommen.' });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Unbekannter Fehler' });
    } finally {
      setTestBusy(false);
    }
  }

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

      <div className="card">
        <h3>Benachrichtigungen</h3>
        <p className="note">
          Erhalte eine Benachrichtigung auf diesem Gerät, sobald eine neue Anfrage bei Interessenten und Anfragen
          eingeht — auch wenn diese Seite gerade nicht geöffnet ist.
        </p>
        <p className="note">
          Auf dem iPhone funktioniert das nur, wenn diese Seite über "Zum Home-Bildschirm hinzufügen" installiert
          wurde (normale Safari-Tabs unterstützt Apple dafür nicht). Auf Mac und Windows reicht die Erlaubnis im
          Browser.
        </p>

        {!pushSupported && (
          <p className="note">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
        )}

        {pushSupported && pushChecked && (
          <div className="setting-row">
            <div>
              <p className="setting-title">
                {pushSubscribed ? 'Benachrichtigungen: Aktiv auf diesem Gerät' : 'Benachrichtigungen: Deaktiviert'}
              </p>
              <p className="note">Gilt nur für dieses Gerät/diesen Browser — andere Geräte separat aktivieren.</p>
            </div>
            <label className="switch" aria-label="Benachrichtigungen aktivieren">
              <input
                type="checkbox"
                checked={pushSubscribed}
                disabled={pushBusy}
                onChange={(e) => onTogglePush(e.target.checked)}
              />
              <span className="switch-slider" />
            </label>
          </div>
        )}

        {pushError && <p className="error">{pushError}</p>}

        {pushSubscribed && (
          <div className="setting-actions">
            <button type="button" className="secondary" disabled={testBusy} onClick={onSendTestPush}>
              {testBusy ? 'Sende...' : 'Test-Benachrichtigung senden'}
            </button>
          </div>
        )}

        {testResult && (
          <p className={testResult.ok ? 'note' : 'error'}>{testResult.message}</p>
        )}
      </div>
    </div>
  );
}
