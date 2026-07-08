import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isTourDisabled, setTourDisabled, hasAccountSeenTour, markAccountSeenTour } from '../lib/dashboardTourSettings';

type TourStep = {
  id: string;
  route: string;
  title: string;
  text: string;
};

const steps: TourStep[] = [
  {
    id: 'photos',
    route: '/photos',
    title: 'Willkommen im Liftpictures Dashboard!',
    text: 'Hier siehst du alle Fotos deines Parks — mit Suche nach Bildnummer oder nach Datum und Uhrzeit, und einer großen Vorschau per Klick. Dieser Bereich ist bereits voll einsatzbereit.',
  },
  {
    id: 'leads',
    route: '/leads',
    title: 'E-Mail-Liste',
    text: 'Hier landen alle Kontakte, die ein Foto gekauft oder kostenlos freigeschaltet haben — inklusive Marketing-Einwilligung (Opt-in). Auch das ist bereits einsatzbereit.',
  },
  {
    id: 'finish',
    route: '/leads',
    title: 'Alles Weitere kommt bald',
    text: 'Die übrigen Bereiche im Menü (Übersicht, Käufe, Benutzer, Personalisierung, Support, Systemzustand) sind mit „Bald verfügbar“ markiert — sie werden Schritt für Schritt fertiggestellt und live geschaltet.',
  },
];

export default function WelcomeTour() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  const step = useMemo(() => steps[index], [index]);
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!user) return;
    if (isTourDisabled() || hasAccountSeenTour(user.id)) return;

    setVisible(true);
    markAccountSeenTour(user.id);
  }, [user]);

  useEffect(() => {
    if (!visible) return;
    if (location.pathname === step.route) return;
    navigate(step.route, { replace: true });
  }, [location.pathname, navigate, step.route, visible]);

  if (!visible) return null;

  const onClose = () => setVisible(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="glass-panel-strong w-full max-w-md rounded-3xl p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Schritt {index + 1} von {steps.length}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="text-lg font-bold text-slate-800">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.text}</p>

        <div className="mt-6 flex items-center justify-between gap-2">
          {index > 0 && !isLast ? (
            <button
              type="button"
              onClick={() => setIndex((v) => Math.max(0, v - 1))}
              className="glass-button-secondary flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </button>
          ) : (
            <span />
          )}

          {!isLast && (
            <button
              type="button"
              onClick={() => setIndex((v) => Math.min(steps.length - 1, v + 1))}
              className="glass-button-primary flex items-center gap-1.5 text-sm"
            >
              Weiter
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {isLast && (
            <div className="flex flex-1 items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setTourDisabled(true);
                  onClose();
                }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Nicht mehr anzeigen
              </button>
              <button type="button" onClick={onClose} className="glass-button-primary text-sm">
                Fertig
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
