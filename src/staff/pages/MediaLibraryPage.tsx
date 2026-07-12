import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deleteMediaAsset, fetchCategories, mediaAssetUrl, searchMediaAssets, type MediaAsset } from '../lib/mediaAssets';
import UploadMediaModal from '../components/UploadMediaModal';
import MediaDetailModal from '../components/MediaDetailModal';

export default function MediaLibraryPage() {
  const [searchParams] = useSearchParams();
  // Initial value only (deep link from the Hilfe search) — freely editable after.
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<MediaAsset | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);

  const allSelected = assets.length > 0 && selectedIds.size === assets.length;

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(assets.map((a) => a.id)));
  }

  async function onBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Medien wirklich endgültig löschen?`)) return;

    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => deleteMediaAsset(id)));
    const failed = ids.filter((_, i) => results[i].status === 'rejected');

    const deletedCount = ids.length - failed.length;
    setAssets((prev) => prev.filter((a) => !ids.includes(a.id) || failed.includes(a.id)));
    setTotal((prev) => Math.max(0, prev - deletedCount));
    setSelectedIds(new Set(failed));
    setBulkDeleting(false);

    if (failed.length > 0) {
      window.alert(`${failed.length} von ${ids.length} konnten nicht gelöscht werden.`);
    }
  }

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    searchMediaAssets({ query, category: category || undefined })
      .then(({ items, total: totalCount }) => {
        if (cancelled) return;
        setAssets(items);
        setTotal(totalCount);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fehler beim Laden.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, category]);

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const { items, total: totalCount } = await searchMediaAssets({
        query,
        category: category || undefined,
        offset: assets.length,
      });
      setAssets((prev) => [...prev, ...items]);
      setTotal(totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Nachladen.');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="material-card-head">
          <div>
            <h2>Medien</h2>
            <p className="note">
              Durchsuchbare Bild- und Video-Bibliothek — Kunden, Hardware, Software, Attraktionen. Suche nach
              Stichworten wie Kundennamen, Attraktionstyp oder Produkt.
            </p>
          </div>
          <button type="button" style={{ width: 'auto' }} onClick={() => setShowUpload(true)}>
            + Medien hinzufügen
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid two">
          <div>
            <label>Suche</label>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z. B. wasserrutsche, aida, photopoint ..."
            />
          </div>
          <div>
            <label>Kategorie</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="marketing-section-title">
          <h3>Ergebnisse</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="note">
              {loading ? 'Lädt...' : assets.length < total ? `${assets.length} von ${total} Treffern` : `${total} Treffer`}
            </span>
            {assets.length > 0 && (
              <button type="button" className="secondary inline" onClick={toggleSelectionMode}>
                {selectionMode ? 'Fertig' : 'Auswählen'}
              </button>
            )}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {!loading && !error && assets.length === 0 && (
          <p className="note">Keine Treffer. Andere Suchbegriffe oder Kategorie versuchen.</p>
        )}

        {selectionMode && assets.length > 0 && (
          <div className="media-select-toolbar">
            <label className="media-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              Alle auswählen
            </label>
            <span className="note">{selectedIds.size} ausgewählt</span>
            <button
              type="button"
              className="danger inline"
              disabled={selectedIds.size === 0 || bulkDeleting}
              onClick={onBulkDelete}
              style={{ marginLeft: 'auto' }}
            >
              {bulkDeleting ? 'Löscht...' : `Ausgewählte löschen (${selectedIds.size})`}
            </button>
          </div>
        )}

        <div className="media-grid">
          {assets.map((asset) => (
            <div key={asset.id} className={`media-tile ${selectedIds.has(asset.id) ? 'selected' : ''}`}>
              {selectionMode && (
                <label className="media-tile-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(asset.id)}
                    onChange={() => toggleSelect(asset.id)}
                  />
                </label>
              )}
              <button
                type="button"
                className="media-tile-body"
                onClick={() => (selectionMode ? toggleSelect(asset.id) : setLightbox(asset))}
              >
                {asset.media_type === 'image' ? (
                  <img src={mediaAssetUrl(asset.storage_path)} alt={asset.title} loading="lazy" />
                ) : (
                  <div className="media-tile-video">▶ Video</div>
                )}
                <div className="media-tile-info">
                  <span className="media-tile-title">{asset.title}</span>
                  <span className="material-lang-badge lang-en">{asset.category}</span>
                </div>
              </button>
            </div>
          ))}
        </div>

        {!loading && assets.length < total && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button
              type="button"
              className="secondary"
              style={{ width: 'auto' }}
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Lädt...' : `Mehr laden (${total - assets.length} weitere)`}
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <MediaDetailModal
          asset={lightbox}
          onClose={() => setLightbox(null)}
          onUpdated={(updated) => {
            setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setLightbox(updated);
            if (!categories.includes(updated.category)) {
              setCategories((prev) => [...prev, updated.category].sort());
            }
          }}
          onDeleted={(id) => {
            setAssets((prev) => prev.filter((a) => a.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            setLightbox(null);
          }}
        />
      )}

      {showUpload && (
        <UploadMediaModal
          onClose={() => setShowUpload(false)}
          onUploaded={(asset) => {
            setAssets((prev) => [asset, ...prev]);
            setTotal((prev) => prev + 1);
            if (!categories.includes(asset.category)) {
              setCategories((prev) => [...prev, asset.category].sort());
            }
          }}
        />
      )}
    </div>
  );
}
