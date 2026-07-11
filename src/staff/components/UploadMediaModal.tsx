import { useState } from 'react';
import { uploadMediaAsset, type MediaAsset } from '../lib/mediaAssets';

const KNOWN_CATEGORIES = ['Kunden', 'Hardware', 'Software', 'Attraktionen', 'Unsortiert'];

interface UploadMediaModalProps {
  onClose: () => void;
  onUploaded: (asset: MediaAsset) => void;
}

export default function UploadMediaModal({ onClose, onUploaded }: UploadMediaModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [keywords, setKeywords] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPickFile(f: File | null) {
    setFile(f);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(f));
    const stem = f.name.includes('.') ? f.name.slice(0, f.name.lastIndexOf('.')) : f.name;
    setTitle(stem);
  }

  async function onSubmit() {
    if (!file) return;
    if (!title.trim() || !category.trim()) {
      setError('Name und Kategorie sind Pflichtfelder.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadMediaAsset({
        file,
        title: title.trim(),
        category: category.trim(),
        subcategory: subcategory.trim() || undefined,
        keywords: keywords.trim() || undefined,
      });
      onUploaded(asset);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="media-lightbox" onClick={onClose}>
      <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Medien hinzufügen</h3>

        {!file && (
          <div>
            <label>Datei vom Gerät auswählen</label>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        {file && previewUrl && (
          <>
            {file.type.startsWith('video/') ? (
              <video src={previewUrl} controls style={{ maxHeight: '40vh', borderRadius: 10, alignSelf: 'center' }} />
            ) : (
              <img src={previewUrl} alt="Vorschau" style={{ maxHeight: '40vh', borderRadius: 10, alignSelf: 'center' }} />
            )}

            <div className="grid two">
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Name (vor dem Hochladen noch änderbar)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dateiname" />
              </div>
              <div>
                <label>Kategorie *</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="z. B. Kunden, Hardware ..."
                  list="upload-category-suggestions"
                />
                <datalist id="upload-category-suggestions">
                  {KNOWN_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label>Unterkategorie (optional)</label>
                <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="z. B. Plose, Kameras ..." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Stichworte (optional, mit Komma trennen)</label>
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="z. B. wasserrutsche, sommer" />
              </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="material-actions">
              <button type="button" onClick={onSubmit} disabled={uploading} style={{ width: 'auto' }}>
                {uploading ? 'Lädt hoch...' : 'Hochladen'}
              </button>
              <button type="button" className="secondary inline" onClick={() => onPickFile(null)} disabled={uploading}>
                Andere Datei wählen
              </button>
              <button type="button" className="secondary inline" onClick={onClose} disabled={uploading}>
                Abbrechen
              </button>
            </div>
          </>
        )}

        {!file && (
          <div className="material-actions">
            <button type="button" className="secondary inline" onClick={onClose}>
              Abbrechen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
