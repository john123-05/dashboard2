import { Link } from 'react-router-dom';
import { uploaderDocs } from '../lib/marketingMaterials';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

const steps = [
  {
    title: '1. PC im Kunden Management anlegen',
    text: 'Im Superadmin Park, Attraktion, PC-ID, Kamera, Modus und Papierwarnung eintragen. Danach erzeugt das Dashboard einen Pairing-Code.',
  },
  {
    title: '2. Liftpic Sync auf den Attraktions-PC kopieren',
    text: 'Der Zielordner ist C:\\liftpic\\liftpic-sync. Kamera, TIScapture und AidaTest bleiben unveraendert und laufen weiter wie bisher.',
  },
  {
    title: '3. Pairing-Code am PC eintragen',
    text: 'Der neue Uploader holt sich damit seine Einstellungen aus Supabase: Ordner, Park, Kamera, QR-Modus, Speed-Modus und Health-Reporting.',
  },
  {
    title: '4. Als Windows-Dienst starten und Health pruefen',
    text: 'Wenn Adminrechte vorhanden sind, laeuft Liftpic Sync als Service. Ohne Adminrechte nutzt die Installation eine geplante Aufgabe als Fallback.',
  },
];

const commonErrors = [
  { problem: 'Pairing-Code ungueltig', fix: 'Im Kunden Management neuen Code erzeugen und am PC erneut eintragen.' },
  { problem: 'Ordner nicht gefunden', fix: 'RAW/OUT/QR/Webout-Pfade im Kunden Management mit dem PC abgleichen.' },
  { problem: 'Keine neuen Fotos', fix: 'Pruefen, ob TIScapture nach C:\\liftpic\\fotos schreibt und AidaTest nach fotos\\out.' },
  { problem: 'Speed fehlt', fix: 'Upload laeuft trotzdem weiter; im Dashboard steht speed_status=missing oder timeout.' },
  { problem: 'Papierzaehler fehlt', fix: 'Pfad zur PrintCount-Datei pruefen. Ohne Datei wird nur Health mit Warnung gesendet.' },
  { problem: 'Internet offline', fix: 'Fotos und Status bleiben lokal in SQLite in der Warteschlange und werden spaeter erneut gesendet.' },
];

export default function UploaderInstallPage() {
  const { copiedId, copy } = useCopyToClipboard();
  const installCommand = 'cd C:\\liftpic\\liftpic-sync && .\\scripts\\install_windows_service.ps1';

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card marketing-hero">
        <Link to="/staff/werbematerialien" className="note">
          Zurueck zu Werbematerialien
        </Link>
        <h2>Liftpic Sync installieren</h2>
        <p className="note">
          Der neue Uploader soll auf jedem Attraktions-PC gleich installiert werden. Unterschiedlich sind nur Park,
          Kamera, Modus und Pairing-Code aus dem Superadmin Dashboard.
        </p>
        <div className="material-actions" style={{ marginTop: 12 }}>
          <Link to="/staff/kunden-management?tab=liftpic" className="btn-link">
            Kunden Management oeffnen
          </Link>
          <button type="button" className="secondary inline" onClick={() => copy('install-command', installCommand)}>
            {copiedId === 'install-command' ? 'Kopiert!' : 'Install-Befehl kopieren'}
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Systemueberblick</h3>
        <p className="material-desc" style={{ marginTop: 0 }}>
          Der neue Prozess sitzt neben den vorhandenen Programmen. Er liest nur die bekannten Ordner und Statusdateien,
          schreibt eine Kontrollkopie nach Webout und laedt je nach Modus Fotos oder nur Zaehldaten hoch.
        </p>
        <div className="help-list" style={{ display: 'grid', gap: 6, paddingLeft: 18 }}>
          <div>TIScapture/CAM schreibt Rohbilder nach C:\\liftpic\\fotos</div>
          <div>AidaTest schreibt fertige Bilder mit Datum/Uhrzeit/Speed nach C:\\liftpic\\fotos\\out</div>
          <div>PhotoViewer kopiert verkaufte QR-Fotos nach C:\\liftpic\\fotos\\qrcode</div>
          <div>Liftpic Sync liest diese Ordner, zaehlt Fahrten, sendet Health und laedt die erlaubten Fotos hoch</div>
        </div>
      </div>

      <div className="card">
        <h3>Installation</h3>
        <div className="grid" style={{ gap: 10, marginTop: 8 }}>
          {steps.map((step) => (
            <div key={step.title} className="material-card">
              <h4 style={{ margin: 0 }}>{step.title}</h4>
              <p className="material-desc">{step.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Haeufige Fehler</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Problem</th>
                <th>Loesung</th>
              </tr>
            </thead>
            <tbody>
              {commonErrors.map((row) => (
                <tr key={row.problem}>
                  <td>{row.problem}</td>
                  <td>{row.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Dokumente &amp; Script</h3>
        <div className="grid two">
          {uploaderDocs.map((doc) => (
            <div key={doc.id} className="material-card">
              <div className="material-card-head">
                <h4>{doc.title}</h4>
              </div>
              <p className="material-desc">{doc.description}</p>
              <div className="material-actions">
                <a className="btn-link" href={doc.url} target="_blank" rel="noopener noreferrer">
                  Herunterladen
                </a>
                <button type="button" className="secondary inline" onClick={() => copy(doc.id, doc.url)}>
                  {copiedId === doc.id ? 'Kopiert!' : 'Link kopieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
