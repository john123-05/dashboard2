import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';

const FAQ: { frage: string; antwort: string }[] = [
  {
    frage: 'Was passiert, wenn ich "Jetzt anfragen" klicke?',
    antwort:
      'Wir bekommen eine Benachrichtigung und melden uns bei dir - es wird noch nichts automatisch bestellt oder berechnet.',
  },
  {
    frage: 'Wo sehe ich den Status einer laufenden Bestellung?',
    antwort: 'Über den Button "Meine Bestellungen" auf der Konfigurationsseite - dort siehst du den Fortschritt jeder Bestellung.',
  },
  {
    frage: 'Woher kommen die Umsatz-Schätzungen?',
    antwort: 'Die hinterlegt unser Team individuell für deinen Park, basierend auf deinen Analyse-Daten.',
  },
];

/** Eigene Seite fuer "Fragen und Antworten", erreichbar ueber das i-Symbol auf "Konfiguration". */
export default function ConfigurationFaq() {
  const [offeneFrage, setOffeneFrage] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to="/configuration" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur Konfiguration
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">Fragen und Antworten</h2>
      </div>

      <GlassCard className="p-5 sm:p-6">
        <div className="divide-y divide-slate-200/70">
          {FAQ.map((entry, i) => (
            <div key={entry.frage}>
              <button
                type="button"
                onClick={() => setOffeneFrage(offeneFrage === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-slate-700"
              >
                {entry.frage}
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${offeneFrage === i ? 'rotate-180' : ''}`} />
              </button>
              {offeneFrage === i && <p className="pb-3 text-sm text-slate-500">{entry.antwort}</p>}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
