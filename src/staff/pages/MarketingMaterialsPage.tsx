import { Link } from 'react-router-dom';
import {
  attractionMaterials,
  generalDocs,
  helpfulLinks,
  socialLinks,
  type MaterialLanguage,
} from '../lib/marketingMaterials';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

function LangBadge({ language }: { language: MaterialLanguage }) {
  return (
    <span className={`material-lang-badge lang-${language}`}>{language === 'de' ? 'Deutsch' : 'English'}</span>
  );
}

export default function MarketingMaterialsPage() {
  const { copiedId, copy } = useCopyToClipboard();

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card marketing-hero">
        <h2>Werbematerialien</h2>
        <p className="note">
          Alle Broschüren, Anleitungen und Links an einem Ort — herunterladen oder als Link kopieren, um sie schnell
          weiterzugeben, z. B. an Interessenten oder für Social Media.
        </p>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Broschüren &amp; Kataloge</h3>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          Allgemeine Dokumente, nicht auf eine bestimmte Attraktion bezogen.
        </p>
        <div className="grid two">
          {generalDocs.map((doc) => (
            <div key={doc.id} className="material-card">
              <div className="material-card-head">
                <h4>{doc.title}</h4>
                <LangBadge language={doc.language} />
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

      <div className="card">
        <div className="marketing-section-title">
          <h3>Attraktions-PDFs</h3>
        </div>
        <p className="note" style={{ marginTop: 0 }}>
          Für jede Attraktion gibt es ein PDF auf Deutsch und eins auf Englisch — je nachdem, wer fragt.
        </p>
        <div className="grid two">
          {attractionMaterials.map((item) => (
            <div key={item.id} className="attraction-group">
              <h4>{item.category}</h4>
              <p className="material-desc">{item.description}</p>
              <div className="attraction-group-variants">
                <a className="btn-link" href={item.de} target="_blank" rel="noopener noreferrer">
                  🇩🇪 Deutsch
                </a>
                <a className="btn-link" href={item.en} target="_blank" rel="noopener noreferrer">
                  🇬🇧 English
                </a>
                <button type="button" className="secondary inline" onClick={() => copy(`${item.id}-de`, item.de)}>
                  {copiedId === `${item.id}-de` ? 'Kopiert!' : 'DE-Link kopieren'}
                </button>
                <button type="button" className="secondary inline" onClick={() => copy(`${item.id}-en`, item.en)}>
                  {copiedId === `${item.id}-en` ? 'Kopiert!' : 'EN-Link kopieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Uploader installieren</h3>
        </div>
        <p className="material-desc" style={{ marginTop: 0 }}>
          Schritt-für-Schritt-Anleitung, wie der Foto-Uploader auf einem neuen PC eingerichtet wird, plus alle drei
          zugehörigen Dokumente zum Download.
        </p>
        <Link className="btn-link" to="/staff/werbematerialien/uploader-installation">
          Zur Uploader-Installation →
        </Link>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Social Media</h3>
        </div>
        <div className="social-list">
          {socialLinks.map((link) => (
            <div key={link.id} className="social-item">
              <div className="social-item-label">
                <span className="social-item-platform">{link.platform}</span>
                <span>{link.label}</span>
              </div>
              <div className="social-item-actions">
                <a className="btn-link" href={link.url} target="_blank" rel="noopener noreferrer">
                  Öffnen
                </a>
                <button type="button" className="secondary inline" onClick={() => copy(link.id, link.url)}>
                  {copiedId === link.id ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Hilfreiche Links</h3>
        </div>
        <div className="link-list">
          {helpfulLinks.map((link) => (
            <div key={link.id} className="link-item">
              <div className="link-item-body">
                <div className="link-item-label">
                  {link.label}
                  {link.customer && <span className="material-lang-badge lang-en">{link.customer}</span>}
                </div>
                <p className="link-item-desc">{link.description}</p>
              </div>
              <div className="link-item-actions">
                {!link.copyOnly && (
                  <a className="btn-link" href={link.url} target="_blank" rel="noopener noreferrer">
                    Öffnen
                  </a>
                )}
                <button type="button" className="secondary inline" onClick={() => copy(link.id, link.url)}>
                  {copiedId === link.id ? 'Kopiert!' : 'Kopieren'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
