import { Component, lazy, type ComponentType, type ReactNode } from 'react';

/**
 * Seiten nachladen, ohne dass ein Deploy die offene Seite zerschiesst.
 *
 * Seit die App in einzeln nachgeladene Dateien zerlegt ist, tragen diese
 * Dateien eine Pruefsumme im Namen (`Photos-CskCIJ8c.js`). Jeder neue Deploy
 * vergibt neue Pruefsummen und loescht die alten Dateien.
 *
 * Damit entsteht eine Luecke, die es vorher nicht gab: Wer die Seite geoeffnet
 * hat, BEVOR ausgeliefert wurde, haelt ein `index.html`, das auf Dateien zeigt,
 * die es nicht mehr gibt. Klickt er dann auf eine Seite, die erst jetzt geladen
 * wird, antwortet der Server mit dem `index.html` statt mit JavaScript, und der
 * Browser verweigert die Annahme:
 *
 *   Failed to load module script: Expected a JavaScript module script but the
 *   server responded with a MIME type of text/html.
 *
 * Ohne Auffangnetz beendet React daraufhin den ganzen Baum - weisse Seite. Beim
 * naechsten harten Neuladen geht es wieder, weil frisches HTML kommt. Genau das
 * Muster: "beim ersten Laden geht es, beim zweiten nicht."
 *
 * Die Antwort darauf ist nicht, den Fehler anzuzeigen, sondern ihn zu heilen:
 * ein einziger echter Neuladevorgang holt HTML und Dateien passend zueinander.
 * Der Merker in `sessionStorage` sorgt dafuer, dass daraus keine Schleife wird -
 * scheitert es auch nach dem Neuladen, liegt es an etwas anderem (kein Netz,
 * Server weg), und dann soll der Nutzer das sehen statt endlos neu zu laden.
 */

const MERKER = 'liftpic:nachladefehler-neu-geladen';

// Dieselbe Signatur wie Reacts eigenes `lazy`. Das `any` steht hier bewusst:
// die Seiten haben unterschiedliche Eigenschaften, und ein engerer Typ wuerde
// jede Seite ausschliessen, die welche entgegennimmt (etwa `embedded`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seiteNachladen<T extends ComponentType<any>>(
  laden: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const modul = await laden();
      // Geklappt - der Merker darf weg, sonst hilft der Neuladevorgang beim
      // naechsten Deploy nicht mehr.
      try {
        window.sessionStorage.removeItem(MERKER);
      } catch {
        /* privater Modus: kein sessionStorage, dann eben ohne */
      }
      return modul;
    } catch (fehler) {
      let schonVersucht = false;
      try {
        schonVersucht = window.sessionStorage.getItem(MERKER) === '1';
        if (!schonVersucht) window.sessionStorage.setItem(MERKER, '1');
      } catch {
        /* ohne sessionStorage lieber einmal zu wenig neu laden als endlos */
        schonVersucht = true;
      }

      if (!schonVersucht) {
        window.location.reload();
        // Absichtlich nie erfuellt: der Neustart laeuft bereits, React soll
        // bis dahin weder rendern noch einen Fehler zeigen.
        return new Promise<{ default: T }>(() => {});
      }
      throw fehler;
    }
  });
}

type Props = { children: ReactNode };
type State = { gescheitert: boolean };

/**
 * Letztes Auffangnetz. Greift nur, wenn auch das Neuladen nicht geholfen hat -
 * also bei fehlender Verbindung oder einem echten Fehler in einer Seite. Statt
 * einer weissen Seite bekommt der Nutzer dann einen Satz und einen Knopf.
 */
export class NachladeGrenze extends Component<Props, State> {
  state: State = { gescheitert: false };

  static getDerivedStateFromError(): State {
    return { gescheitert: true };
  }

  componentDidCatch(fehler: unknown) {
    console.error('Seite konnte nicht geladen werden:', fehler);
  }

  render() {
    if (!this.state.gescheitert) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold text-slate-800">
          Diese Seite konnte nicht geladen werden
        </p>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          Meistens liegt es an der Internetverbindung oder daran, dass gerade eine
          neue Version ausgeliefert wurde. Einmal neu laden behebt es in aller Regel.
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.removeItem(MERKER);
            } catch {
              /* egal */
            }
            window.location.reload();
          }}
          className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Neu laden
        </button>
      </div>
    );
  }
}
