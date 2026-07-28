import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hasAccountSeenTour, isTourDisabled, markAccountSeenTour, setTourDisabled } from '../lib/dashboardTourSettings';

type TourStep = {
  id: string;
  route: string;
  title: string;
  benefit: string;
  actions: string;
  kpis: string;
};

type TourMode = 'prompt' | 'tour';

const PROMPT_DURATION_MS = 4000;

const ownerSteps: TourStep[] = [
  {
    id: 'overview',
    route: '/',
    title: 'Übersicht',
    benefit: 'Hier bekommst du den schnellsten Gesamtüberblick über deinen Park, ohne dich erst durch einzelne Bereiche zu klicken.',
    actions: 'Du siehst die wichtigsten Tages- und Monatszahlen, die Umsatzkurve und aktuelle operative Hinweise auf einen Blick.',
    kpis: 'Wichtig sind hier vor allem Umsatz heute, verkaufte Fotos, Fotopapier, Monatswerte und aktuelle Alerts.',
  },
  {
    id: 'revenue',
    route: '/revenue',
    title: 'Umsatz',
    benefit: 'Diese Seite hilft dir, Einnahmen genauer zu verstehen und Trends schneller zu erkennen.',
    actions: 'Du kannst Tagesverläufe, Monatsentwicklung und Verkaufsleistung nach Zeitraum oder Datenbasis prüfen.',
    kpis: 'Hier zählen Umsatzsummen, verkaufte Fotos, Conversion und der Verlauf der Umsatzlinie.',
  },
  {
    id: 'purchases',
    route: '/purchases',
    title: 'Käufe',
    benefit: 'Hier siehst du jede einzelne Transaktion und kannst schnell nachvollziehen, was am Automaten verkauft wurde.',
    actions: 'Du kannst Käufe filtern, durchsuchen, exportieren und einzelne Vorgänge nach Datum, Betrag oder Quelle prüfen.',
    kpis: 'Wichtig sind Kaufzeitpunkt, Zahlungsart, Status, Quelle und der jeweilige Einzelumsatz.',
  },
  {
    id: 'photos',
    route: '/photos',
    title: 'Fotos',
    benefit: 'Diese Seite ist dein operativer Blick auf die erzeugten Bilder und zeigt dir sofort, ob der Fotozufluss passt.',
    actions: 'Du kannst nach Bildnummer, Datum oder Quelle suchen, Vorschauen öffnen und Volumen nach Tagen vergleichen.',
    kpis: 'Wichtig sind hier Fotoanzahl, aktuelle Uploads, Verteilung nach Tagen und die sichtbare Vorschau einzelner Bilder.',
  },
  {
    id: 'leads',
    route: '/leads',
    title: 'E-Mail-Liste',
    benefit: 'Hier erkennst du, welche Gäste ihre Bilder digital freischalten oder nach dem Besuch noch mit dem Bild interagieren.',
    actions: 'Du kannst Kontakte filtern, nach Land segmentieren, einzelne Einträge löschen und die Weltkarte sowie Einlösezeiten auswerten.',
    kpis: 'Wichtig sind Gesamt-Leads, Marketing-Opt-ins, Länder, Zeit zwischen Kauf und Einlösung und die detaillierte Standortkarte.',
  },
  {
    id: 'personalization',
    route: '/personalization',
    title: 'Personalisierung',
    benefit: 'Hier gestaltest du Overlays und Kampagnen, damit Fotos markengerecht und passend zum Park ausgespielt werden.',
    actions: 'Du kannst Overlays hochladen, im Builder anpassen, Kampagnen anlegen und Ebenen mit Vorschau kombinieren.',
    kpis: 'Wichtig sind hier eher die aktiven Overlays, die Kampagnenlogik und die direkte Vorschau auf dem neuesten Bild.',
  },
  {
    id: 'support',
    route: '/tickets',
    title: 'Support',
    benefit: 'Hier laufen technische oder organisatorische Rückfragen zusammen, damit du Probleme schneller lösen kannst.',
    actions: 'Du kannst Tickets lesen, beantworten, archivieren und neue Fälle anlegen, wenn etwas im Betrieb auffällt.',
    kpis: 'Wichtig sind offene Tickets, Prioritäten, Status und die letzten Antworten unseres Support-Teams.',
  },
  {
    id: 'health',
    route: '/health',
    title: 'Systemzustand',
    benefit: 'Diese Seite zeigt dir, ob Kameras, Uploads und Maschinen stabil laufen oder Aufmerksamkeit brauchen.',
    actions: 'Du kannst Maschinenstatus, letzte Signale, Fehlerbilder und Ausfälle prüfen und direkt Auffälligkeiten erkennen.',
    kpis: 'Wichtig sind Online-Status, letzte Aktivität, Warnungen, Upload-Signale und technische Störungen.',
  },
  {
    id: 'settings',
    route: '/settings',
    title: 'Einstellungen',
    benefit: 'Hier steuerst du die wichtigsten Grundparameter deines Dashboards und deines Parkbetriebs.',
    actions: 'Du kannst Sprache, Bildpreis, Benachrichtigungen, Öffnungszeiten, Saisonzeiten und Organisationsdaten verwalten.',
    kpis: 'Besonders wichtig sind hier Bildpreis, Push-Benachrichtigungen sowie Öffnungs- und Saisonzeiten als Basis für Auswertungen.',
  },
];

const staffSteps: TourStep[] = [
  ownerSteps[3],
  ownerSteps[5],
  ownerSteps[6],
  ownerSteps[7],
];

function PromptCloseButton({
  remainingMs,
  onClose,
}: {
  remainingMs: number;
  onClose: () => void;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, remainingMs / PROMPT_DURATION_MS));
  const dashOffset = circumference * (1 - progress);

  return (
    <button
      type="button"
      onClick={onClose}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      aria-label="Walkthrough schließen"
    >
      <svg className="absolute inset-0 h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="2.5" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="rgb(14 165 233)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <X className="relative z-10 h-4 w-4" />
    </button>
  );
}

export default function WelcomeTour() {
  const { user, isOwner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<TourMode>('prompt');
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(PROMPT_DURATION_MS);

  const steps = useMemo(() => (isOwner ? ownerSteps : staffSteps), [isOwner]);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  useEffect(() => {
    if (!user) return;
    if (isTourDisabled() || hasAccountSeenTour(user.id) || steps.length === 0) return;

    setVisible(true);
    setMode('prompt');
    setIndex(0);
    setRemainingMs(PROMPT_DURATION_MS);
    markAccountSeenTour(user.id);
  }, [steps.length, user]);

  useEffect(() => {
    if (!visible || mode !== 'prompt') return;
    if (location.pathname !== '/') {
      navigate('/', { replace: true });
    }
  }, [location.pathname, mode, navigate, visible]);

  useEffect(() => {
    if (!visible || mode !== 'tour' || !step) return;
    if (location.pathname !== step.route) {
      navigate(step.route, { replace: true });
    }
  }, [location.pathname, mode, navigate, step, visible]);

  useEffect(() => {
    if (!visible || mode !== 'prompt') return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextRemaining = Math.max(0, PROMPT_DURATION_MS - elapsed);
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(timer);
        setVisible(false);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [mode, visible]);

  if (!visible || !step) return null;

  const closeTour = () => setVisible(false);

  if (mode === 'prompt') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/20 p-4 backdrop-blur-[2px] sm:items-center">
        <div className="glass-panel-strong w-full max-w-lg rounded-[32px] p-6 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">Willkommen</p>
                <h3 className="mt-1 text-xl font-bold text-slate-800">Kurz durch dein Dashboard?</h3>
              </div>
            </div>
            <PromptCloseButton remainingMs={remainingMs} onClose={closeTour} />
          </div>

          <p className="mt-5 text-sm leading-7 text-slate-600">
            Wenn du magst, führe ich dich in weniger als einer Minute durch die wichtigsten Seiten und zeige dir
            kurz, was du dort machen kannst und welche Kennzahlen wichtig sind.
          </p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeTour}
              className="inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              <X className="h-4 w-4" />
              Schließen
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('tour');
                setIndex(0);
              }}
              className="glass-button-primary text-sm"
            >
              Ja, kurz zeigen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="glass-panel-strong w-full max-w-xl rounded-[32px] p-6 shadow-2xl sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-500">
              Schritt {index + 1} von {steps.length}
            </p>
            <h3 className="mt-2 text-xl font-bold text-slate-800">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={closeTour}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Walkthrough schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm leading-7 text-slate-600">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Nutzen</p>
            <p className="mt-1">{step.benefit}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Was du hier machst</p>
            <p className="mt-1">{step.actions}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Wichtige KPIs</p>
            <p className="mt-1">{step.kpis}</p>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-between gap-3">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              className="glass-button-secondary flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTourDisabled(true);
                closeTour();
              }}
              className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Nie mehr automatisch zeigen
            </button>
          )}

          {isLast ? (
            <button type="button" onClick={closeTour} className="glass-button-primary text-sm">
              Fertig
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}
              className="glass-button-primary flex items-center gap-1.5 text-sm"
            >
              Weiter
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
