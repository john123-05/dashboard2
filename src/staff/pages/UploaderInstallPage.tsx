import { Link } from 'react-router-dom';
import { uploaderDocs } from '../lib/marketingMaterials';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

const steps = [
  {
    title: '1. Kamera-Software starten (CAMware.exe)',
    text: 'Steuert die Kamera und speichert die Originalbilder im OUT-Ordner. Prüfen: Ist die Kamera verbunden? Erscheinen Bilder im OUT-Ordner?',
  },
  {
    title: '2. Bildverarbeitung starten (jpeg4web.exe)',
    text: 'Nimmt die Bilder aus dem OUT-Ordner und legt die fertigen JPGs im WEBOUT-Ordner ab. Konfiguration (u. a. der Kamera-Code) liegt in jpeg4web.ini.',
  },
  {
    title: '3. Uploader starten',
    text: 'PowerShell öffnen → cd C:\\liftpic\\uploader → python uploader.py. Der Uploader überwacht den WEBOUT-Ordner und lädt neue Bilder automatisch zu Supabase hoch.',
  },
  {
    title: '4. Erfolg prüfen',
    text: 'Wenn "Uploader läuft. Überwache Ordner: C:\\liftpic\\fotos\\webout" erscheint, ist alles korrekt eingerichtet. PowerShell-Fenster offen lassen — schließen stoppt den Uploader.',
  },
];

const commonErrors = [
  { problem: "No module named 'supabase'", fix: 'pip install supabase python-dotenv ausführen.' },
  { problem: '403 Invalid Compact JWS', fix: 'Falscher Secret Key in der .env-Datei.' },
  { problem: '400 Bad Request', fix: 'Bucket-Name in der .env-Datei ist falsch.' },
  { problem: 'Bild verschwunden, aber nicht im Bucket', fix: 'Upload ist fehlgeschlagen — Internetverbindung und Supabase-Projekt prüfen.' },
];

export default function UploaderInstallPage() {
  const { copiedId, copy } = useCopyToClipboard();

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card marketing-hero">
        <Link to="/staff/werbematerialien" className="note">
          ← Zurück zu Werbematerialien
        </Link>
        <h2>Uploader installieren</h2>
        <p className="note">
          So wird der Foto-Uploader auf einem neuen PC eingerichtet. Gedacht zum Mitlesen während der Installation
          oder zum Weitergeben an jemanden, der es selbst einrichtet.
        </p>
      </div>

      <div className="card">
        <h3>Systemüberblick</h3>
        <p className="material-desc" style={{ marginTop: 0 }}>
          Drei Programme laufen nacheinander: die Kamera-Software speichert Bilder, eine zweite Software bereitet sie
          fürs Web auf, und der Python-Uploader lädt sie automatisch zu Supabase hoch.
        </p>
        <div className="help-list" style={{ display: 'grid', gap: 6, paddingLeft: 18 }}>
          <div>CAMware.exe → speichert Originalbilder im OUT-Ordner</div>
          <div>jpeg4web.exe → verarbeitet sie in den WEBOUT-Ordner</div>
          <div>Python-Uploader → lädt WEBOUT automatisch zu Supabase hoch</div>
        </div>
      </div>

      <div className="card">
        <h3>Start-Reihenfolge</h3>
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
        <h3>Häufige Fehler</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fehlermeldung</th>
                <th>Lösung</th>
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
