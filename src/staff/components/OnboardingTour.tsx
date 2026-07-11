import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOUR_SESSION_KEY, isTourDisabled, setTourDisabled } from '../lib/onboarding-settings';

type TourStep = {
  id: string;
  title: string;
  text: string;
  route?: string;
  selector?: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const steps: TourStep[] = [
  {
    id: 'welcome',
    route: '/staff/parks',
    selector: '.tour-panel',
    title: 'Willkommen im Liftpictures Operator Dashboard',
    text: 'Willkommen. Ich zeige dir in einer kurzen Tour die wichtigsten Funktionen, damit du sofort produktiv starten kannst.',
  },
  {
    id: 'parks',
    route: '/staff/parks',
    selector: '#tour-park-create',
    title: 'Park anlegen',
    text: 'Hier legst du neue Parks an. Name + Slug werden fuer Routing und Datenzuordnung verwendet.',
  },
  {
    id: 'attraction',
    route: '/staff/parks',
    selector: '#tour-attraction-create',
    title: 'Attraktion anlegen',
    text: 'Hier legst du eine Attraktion (z. B. Sommerrodelbahn) innerhalb eines Parks an.',
  },
  {
    id: 'prefix',
    route: '/staff/parks',
    selector: '#tour-prefix-map',
    title: 'Fotos automatisch zuordnen',
    text: 'Jeder Park bekommt ein Kuerzel. Fotos, deren Dateiname mit diesem Kuerzel beginnt, landen automatisch im richtigen Park.',
  },
  {
    id: 'support',
    route: '/staff/parks',
    selector: '#tour-support-preview',
    title: 'Support-Tickets',
    text: 'Hier siehst du, wie viele offene Support-Anfragen es gibt. Von hier springst du direkt zur Detailansicht.',
  },
  {
    id: 'cam-park',
    route: '/staff/cameras',
    selector: '#tour-cam-park-select',
    title: 'Kamera-Seite: Park Auswahl',
    text: 'Hier waehlt man den Park. Alle Zuordnungen und Vorschauen darunter beziehen sich zuerst auf diese Auswahl.',
  },
  {
    id: 'cam-map',
    route: '/staff/cameras',
    selector: '#tour-cam-create',
    title: 'Kamera-Zuordnung',
    text: 'Hier verknuepfst du Customer/Camera Code mit Kamera-Name und optional Attraktion. Das steuert die operative Zuordnung.',
  },
  {
    id: 'cam-dropdown',
    route: '/staff/cameras',
    selector: '#tour-cam-preview-select',
    title: 'Dropdown fuer Bildvorschau',
    text: 'Waehle im Dropdown eine Kamera. Danach zeigt die Vorschau die neuesten Bilder fuer den Code, inklusive Fallback wenn noetig.',
  },
  {
    id: 'cam-images',
    route: '/staff/cameras',
    selector: '#tour-cam-images',
    title: 'Aktuelle Kamera-Bilder',
    text: 'Hier siehst du die letzten Bilder und erkennst sofort, ob Zuordnung und Ingestion korrekt laufen.',
  },
  {
    id: 'help',
    route: '/staff/parks',
    selector: '[data-tour=\"nav-help\"]',
    title: 'Hilfe Bereich',
    text: 'In der Navigation findest du unter Hilfe die FAQ mit Suche und Loesungswegen zu den wichtigsten Themen.',
  },
  {
    id: 'finish',
    route: '/staff/parks',
    selector: '.tour-panel',
    title: 'Fertig',
    text: 'Das war die Kurz-Tour. Fuer alle Details gehe in der Navigation auf Hilfe. Wenn du diese Tour nicht mehr sehen willst: "Nicht mehr anzeigen".',
  },
];

function getStepRect(selector?: string): Rect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const r = element.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function getStepElement(selector?: string): Element | null {
  if (!selector) return null;
  return document.querySelector(selector);
}

export default function OnboardingTour() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = useMemo(() => steps[index], [index]);
  const isLast = index === steps.length - 1;

  useEffect(() => {
    const disabled = isTourDisabled();
    const shownInSession = window.sessionStorage.getItem(TOUR_SESSION_KEY) === 'true';
    if (disabled || shownInSession) return;
    if (location.pathname === '/login') return;

    setVisible(true);
    window.sessionStorage.setItem(TOUR_SESSION_KEY, 'true');
  }, [location.pathname]);

  useEffect(() => {
    if (!visible) return;
    const route = step.route;
    if (!route || location.pathname === route) return;
    navigate(route, { replace: true });
  }, [location.pathname, navigate, step.route, visible]);

  useEffect(() => {
    if (!visible) return;

    const update = () => setRect(getStepRect(step.selector));
    let retries = 0;
    const maxRetries = 20;
    let timer: number | null = null;

    const retryUntilFound = () => {
      const element = getStepElement(step.selector);
      const nextRect = getStepRect(step.selector);
      setRect(nextRect);
      if (element && step.selector !== '.tour-panel') {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      if (!nextRect && retries < maxRetries) {
        retries += 1;
        timer = window.setTimeout(retryUntilFound, 150);
      }
    };

    update();
    retryUntilFound();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.selector, visible, location.pathname]);

  if (!visible) return null;

  const onClose = () => setVisible(false);

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Dashboard Walkthrough">
      {rect && (
        <div
          className="tour-spotlight"
          style={{
            top: Math.max(rect.top - 8, 8),
            left: Math.max(rect.left - 8, 8),
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      <div className="tour-panel card">
        <p className="tour-step-indicator">
          Schritt {index + 1} von {steps.length}
        </p>
        <p className="eyebrow">Walkthrough</p>
        <h3>{step.title}</h3>
        <p className="tour-text">{step.text}</p>

        <div className="tour-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Schliessen
          </button>

          {index > 0 && !isLast && (
            <button type="button" className="secondary" onClick={() => setIndex((v) => Math.max(0, v - 1))}>
              Zurueck
            </button>
          )}

          {!isLast && (
            <button type="button" onClick={() => setIndex((v) => Math.min(steps.length - 1, v + 1))}>
              Weiter
            </button>
          )}

          {isLast && (
            <>
              <button type="button" onClick={onClose}>
                Tour beenden
              </button>
              <button
                type="button"
                className="tour-optout-btn"
                onClick={() => {
                  setTourDisabled(true);
                  onClose();
                }}
              >
                Nicht mehr anzeigen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
