import { useState } from 'react';
import { deleteMediaAsset, mediaAssetUrl, updateMediaAsset, type MediaAsset } from '../lib/mediaAssets';

interface MediaDetailModalProps {
  asset: MediaAsset;
  onClose: () => void;
  onUpdated: (asset: MediaAsset) => void;
  onDeleted: (id: string) => void;
}

export default function MediaDetailModal({ asset, onClose, onUpdated, onDeleted }: MediaDetailModalProps) {
  const [title, setTitle] = useState(asset.title);
  const [category, setCategory] = useState(asset.category);
  const [subcategory, setSubcategory] = useState(asset.subcategory ?? '');
  const [keywords, setKeywords] = useState(asset.keywords.join(', '));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMediaAsset({
        id: asset.id,
        title,
        category,
        subcategory,
        keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
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
    <div className="media-lightbox" onClick={onClose}>
      <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
        {asset.media_type === 'image' ? (
          <img src={mediaAssetUrl(asset.storage_path)} alt={asset.title} />
        ) : (
          <video src={mediaAssetUrl(asset.storage_path)} controls autoPlay />
        )}

        <div className="media-lightbox-meta">
          <div className="grid two">
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
              <label>Stichworte (mit Komma trennen)</label>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="material-actions">
            <button type="button" onClick={onSave} disabled={saving || deleting} style={{ width: 'auto' }}>
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
            <a className="btn-link" href={mediaAssetUrl(asset.storage_path)} target="_blank" rel="noopener noreferrer">
              Original öffnen
            </a>
            <button type="button" className="secondary inline" onClick={onClose} disabled={saving || deleting}>
              Schließen
            </button>
            <button type="button" className="danger inline" onClick={onDelete} disabled={saving || deleting}>
              {deleting ? 'Löscht...' : 'Löschen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
