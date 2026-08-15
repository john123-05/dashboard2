import { useEffect, useRef, useState } from 'react';
import { deleteMediaAsset, mediaAssetUrl, updateMediaAsset, type MediaAsset } from '../lib/mediaAssets';

interface MediaDetailModalProps {
  asset: MediaAsset;
  onClose: () => void;
  onUpdated: (asset: MediaAsset) => void;
  onDeleted: (id: string) => void;
}

export default function MediaDetailModal({ asset, onClose, onUpdated, onDeleted }: MediaDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(asset.title);
  const [category, setCategory] = useState(asset.category);
  const [subcategory, setSubcategory] = useState(asset.subcategory ?? '');
  const [keywords, setKeywords] = useState(asset.keywords.join(', '));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keywordItems = keywords
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
      overlayRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      dialogRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMediaAsset({
        id: asset.id,
        title,
        category,
        subcategory,
        keywords: keywordItems,
      });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!window.confirm(`"${asset.title}" wirklich endgültig löschen?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMediaAsset(asset.id);
      onDeleted(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
      setDeleting(false);
    }
  }

  return (
    <div ref={overlayRef} className="media-lightbox" onClick={onClose}>
      <div ref={dialogRef} className="media-detail-dialog" onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        <div className="media-detail-stage">
          {asset.media_type === 'image' ? (
            <img src={mediaAssetUrl(asset.storage_path)} alt={asset.title} />
          ) : (
            <video src={mediaAssetUrl(asset.storage_path)} controls autoPlay />
          )}
        </div>

        <div className="media-detail-panel">
          <div className="media-detail-head">
            <strong>{asset.title}</strong>
          </div>

          <div className="media-detail-meta">
            <span className="marketing-meta-pill subtle">{asset.category}</span>
            {asset.subcategory ? <span className="marketing-meta-pill subtle">{asset.subcategory}</span> : null}
            {keywordItems.map((keyword) => (
              <span key={keyword} className="marketing-meta-pill subtle">
                {keyword}
              </span>
            ))}
          </div>

          <div className="grid two media-detail-form-grid">
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Name</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label>Kategorie</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div>
              <label>Unterkategorie</label>
              <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Keywords</label>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Mit Komma trennen"
              />
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="customer-machine-actions media-detail-actions">
            <button type="button" className="customer-action-btn" onClick={onSave} disabled={saving || deleting}>
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
            <a className="customer-quiet-btn media-detail-link" href={mediaAssetUrl(asset.storage_path)} target="_blank" rel="noopener noreferrer">
              Original öffnen
            </a>
            <button type="button" className="customer-quiet-btn" onClick={onClose} disabled={saving || deleting}>
              Schließen
            </button>
            <button type="button" className="danger inline media-detail-danger-btn" onClick={onDelete} disabled={saving || deleting}>
              {deleting ? 'Löscht...' : 'Löschen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
