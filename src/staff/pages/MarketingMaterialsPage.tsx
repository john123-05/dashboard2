import { ArrowUpRight, Copy, MonitorDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  attractionMaterials,
  generalDocs,
  helpfulLinks,
  socialLinks,
  uploaderDocs,
  type MaterialLanguage,
} from '../lib/marketingMaterials';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';

function LangBadge({ language }: { language: MaterialLanguage }) {
  const label = language === 'de' ? '🇩🇪' : '🇬🇧';
  return <span className={`material-lang-badge lang-${language}`}>{label}</span>;
}

function CopyIconButton({
  copyId,
  value,
  copiedId,
  onCopy,
}: {
  copyId: string;
  value: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <button
      type="button"
      className="customer-icon-btn marketing-copy-btn"
      onClick={() => onCopy(copyId, value)}
      aria-label="Link kopieren"
      title={copiedId === copyId ? 'Kopiert' : 'Link kopieren'}
    >
      <Copy size={14} />
    </button>
  );
}

export default function MarketingMaterialsPage() {
  const { copiedId, copy } = useCopyToClipboard();

  return (
    <div className="card customer-directory-shell marketing-page-shell">
      <div className="customer-directory-head marketing-page-head">
        <div>
          <h2>Werbematerialien</h2>
        </div>
        <Link className="customer-open-btn" to="/staff/werbematerialien/uploader-installation">
          <MonitorDown size={14} />
          Uploader
        </Link>
      </div>

      <section className="marketing-block">
        <div className="marketing-block-head">
          <h3>Kataloge</h3>
        </div>
        <div className="marketing-row-list">
          {generalDocs.map((doc) => (
            <article key={doc.id} className="marketing-row">
              <div className="marketing-row-main">
                <span className="marketing-row-title">{doc.title}</span>
                <LangBadge language={doc.language} />
              </div>
              <div className="marketing-row-actions">
                <a className="marketing-link-btn" href={doc.url} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRight size={14} />
                  Öffnen
                </a>
                <CopyIconButton copyId={doc.id} value={doc.url} copiedId={copiedId} onCopy={copy} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-block">
        <div className="marketing-block-head">
          <h3>Attraktions-PDFs</h3>
        </div>
        <div className="marketing-row-list">
          {attractionMaterials.map((item) => (
            <article key={item.id} className="marketing-row marketing-row-multi">
              <div className="marketing-row-main">
                <span className="marketing-row-title">{item.category}</span>
              </div>
              <div className="marketing-variant-list">
                <div className="marketing-variant-chip">
                  <LangBadge language="de" />
                  <a href={item.de} target="_blank" rel="noopener noreferrer">
                    Öffnen
                  </a>
                  <CopyIconButton copyId={`${item.id}-de`} value={item.de} copiedId={copiedId} onCopy={copy} />
                </div>
                <div className="marketing-variant-chip">
                  <LangBadge language="en" />
                  <a href={item.en} target="_blank" rel="noopener noreferrer">
                    Öffnen
                  </a>
                  <CopyIconButton copyId={`${item.id}-en`} value={item.en} copiedId={copiedId} onCopy={copy} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="marketing-split-grid">
        <section className="marketing-block">
          <div className="marketing-block-head">
            <h3>Uploader</h3>
          </div>
          <div className="marketing-row-list">
            {uploaderDocs.map((doc) => (
              <article key={doc.id} className="marketing-row">
                <div className="marketing-row-main">
                  <span className="marketing-row-title">{doc.title}</span>
                  <LangBadge language={doc.language} />
                </div>
                <div className="marketing-row-actions">
                  <a className="marketing-link-btn" href={doc.url} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight size={14} />
                    Öffnen
                  </a>
                  <CopyIconButton copyId={doc.id} value={doc.url} copiedId={copiedId} onCopy={copy} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-block">
          <div className="marketing-block-head">
            <h3>Social Media</h3>
          </div>
          <div className="marketing-row-list">
            {socialLinks.map((link) => (
              <article key={link.id} className="marketing-row">
                <div className="marketing-row-main">
                  <span className="marketing-row-title">{link.label}</span>
                  <span className="marketing-meta-pill">{link.platform}</span>
                </div>
                <div className="marketing-row-actions">
                  <a className="marketing-link-btn" href={link.url} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight size={14} />
                    Öffnen
                  </a>
                  <CopyIconButton copyId={link.id} value={link.url} copiedId={copiedId} onCopy={copy} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="marketing-block">
        <div className="marketing-block-head">
          <h3>Websites & Links</h3>
        </div>
        <div className="marketing-row-list">
          {helpfulLinks.map((link) => (
            <article key={link.id} className="marketing-row">
              <div className="marketing-row-main">
                <span className="marketing-row-title">
                  {link.label}
                  {link.shortLabel ? <span className="marketing-inline-note">({link.shortLabel})</span> : null}
                </span>
                {link.customer && <span className="marketing-meta-pill">{link.customer}</span>}
                {link.copyOnly && <span className="marketing-meta-pill subtle">Vorlage</span>}
              </div>
              <div className="marketing-row-actions">
                {!link.copyOnly && (
                  <a className="marketing-link-btn" href={link.url} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight size={14} />
                    Öffnen
                  </a>
                )}
                <CopyIconButton copyId={link.id} value={link.url} copiedId={copiedId} onCopy={copy} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
