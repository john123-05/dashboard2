import { Film, Image as ImageIcon, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  deleteMediaAsset,
  fetchCategories,
  fetchSubcategories,
  mediaAssetUrl,
  searchMediaAssets,
  type MediaAsset,
} from '../lib/mediaAssets';
import MediaDetailModal from '../components/MediaDetailModal';
import UploadMediaModal from '../components/UploadMediaModal';

type MediaView = 'all' | 'image' | 'video';

export default function MediaLibraryPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [category, setCategory] = useState<string>('');
  const [subcategory, setSubcategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
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
  const [activeView, setActiveView] = useState<MediaView>('all');

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return assets;

    return assets.filter((asset) =>
      [asset.title, asset.category, asset.subcategory, ...(asset.keywords || [])]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [assets, query]);

  const visibleAssets = useMemo(() => {
    if (activeView === 'all') return filteredAssets;
    return filteredAssets.filter((asset) => asset.media_type === activeView);
  }, [filteredAssets, activeView]);

  const allSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selectedIds.has(asset.id));

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
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (allSelected) {
        visibleAssets.forEach((asset) => next.delete(asset.id));
      } else {
        visibleAssets.forEach((asset) => next.add(asset.id));
      }

      return next;
    });
  }

  async function onBulkDelete() {
    const ids = visibleAssets.filter((asset) => selectedIds.has(asset.id)).map((asset) => asset.id);
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} Medien wirklich endgültig löschen?`)) return;

    setBulkDeleting(true);
    const results = await Promise.allSettled(ids.map((id) => deleteMediaAsset(id)));
    const failed = ids.filter((_, i) => results[i].status === 'rejected');

    const deletedCount = ids.length - failed.length;
    setAssets((prev) => prev.filter((asset) => !ids.includes(asset.id) || failed.includes(asset.id)));
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

    fetchSubcategories(category || undefined)
      .then((items) => {
        if (cancelled) return;
        setSubcategories(items);
        setSubcategory((current) => (current && !items.includes(current) ? '' : current));
      })
      .catch(() => {
        if (!cancelled) setSubcategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());

    searchMediaAssets({
      category: category || undefined,
      subcategory: subcategory || undefined,
    })
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
  }, [category, subcategory]);

  async function loadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      const { items, total: totalCount } = await searchMediaAssets({
        category: category || undefined,
        subcategory: subcategory || undefined,
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
    <div className="card customer-directory-shell media-page-shell">
      <div className="customer-directory-head media-page-head">
        <div>
          <h2>Medien</h2>
        </div>
        <button type="button" className="customer-open-btn" onClick={() => setShowUpload(true)}>
          <Plus size={14} />
          Medien
        </button>
      </div>

      <div className="customer-directory-toolbar media-toolbar">
        <label className="customer-directory-search">
          <Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Titel, Kategorie oder Stichwort..."
          />
        </label>

        <select className="media-filter-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          className="media-filter-select media-filter-select-subcategory"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
        >
          <option value="">Alle Unterkategorien</option>
          {subcategories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="customer-detail-tabs" role="tablist" aria-label="Medien-Typen">
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'all' ? 'active' : ''}`}
          onClick={() => setActiveView('all')}
          aria-pressed={activeView === 'all'}
        >
          <span className="customer-detail-tab-icon">
            <ImageIcon size={15} />
          </span>
          <span className="customer-detail-tab-label">Alle</span>
        </button>
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'image' ? 'active' : ''}`}
          onClick={() => setActiveView('image')}
          aria-pressed={activeView === 'image'}
        >
          <span className="customer-detail-tab-icon">
            <ImageIcon size={15} />
          </span>
          <span className="customer-detail-tab-label">Bilder</span>
        </button>
        <button
          type="button"
          className={`customer-detail-tab ${activeView === 'video' ? 'active' : ''}`}
          onClick={() => setActiveView('video')}
          aria-pressed={activeView === 'video'}
        >
          <span className="customer-detail-tab-icon">
            <Film size={15} />
          </span>
          <span className="customer-detail-tab-label">Videos</span>
        </button>
      </div>

      <section className="marketing-block media-library-block">
        <div className="marketing-block-head media-library-head">
          <h3>Bibliothek</h3>
          <div className="media-library-actions">
            {!loading && (
              <span className="note">
                {query.trim()
                  ? `${visibleAssets.length} Treffer`
                  : visibleAssets.length < total && activeView === 'all'
                    ? `${visibleAssets.length} von ${total}`
                    : `${visibleAssets.length} Einträge`}
              </span>
            )}
            {visibleAssets.length > 0 && (
              <button type="button" className="customer-quiet-btn" onClick={toggleSelectionMode}>
                {selectionMode ? 'Fertig' : 'Auswählen'}
              </button>
            )}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p className="note">Lädt...</p>}
        {!loading && !error && visibleAssets.length === 0 && (
          <p className="note">Keine Treffer. Andere Suche oder Kategorie versuchen.</p>
        )}

        {selectionMode && visibleAssets.length > 0 && (
          <div className="media-select-toolbar media-select-toolbar-clean">
            <label className="media-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              Auswahl
            </label>
            <span className="note">{visibleAssets.filter((asset) => selectedIds.has(asset.id)).length} markiert</span>
            <button
              type="button"
              className="customer-icon-btn media-delete-btn"
              disabled={visibleAssets.filter((asset) => selectedIds.has(asset.id)).length === 0 || bulkDeleting}
              onClick={onBulkDelete}
              aria-label="Ausgewählte Medien löschen"
              title={bulkDeleting ? 'Löscht...' : 'Ausgewählte Medien löschen'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        <div className="media-grid media-grid-clean">
          {visibleAssets.map((asset) => (
            <div key={asset.id} className={`media-tile ${selectedIds.has(asset.id) ? 'selected' : ''}`}>
              {selectionMode && (
                <label className="media-tile-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(asset.id)} onChange={() => toggleSelect(asset.id)} />
                </label>
              )}
              <button
                type="button"
                className="media-tile-body media-tile-body-clean"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectionMode) {
                    toggleSelect(asset.id);
                    return;
                  }
                  requestAnimationFrame(() => setLightbox(asset));
                }}
              >
                {asset.media_type === 'image' ? (
                  <img src={mediaAssetUrl(asset.storage_path)} alt={asset.title} loading="lazy" />
                ) : (
                  <div className="media-tile-video">▶ Video</div>
                )}
                <div className="media-tile-info media-tile-info-clean">
                  <span className="media-tile-title">{asset.title}</span>
                </div>
              </button>
            </div>
          ))}
        </div>

        {!loading && activeView === 'all' && assets.length < total && (
          <div className="media-load-more">
            <button type="button" className="customer-quiet-btn" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Lädt...' : `Mehr laden (${total - assets.length})`}
            </button>
          </div>
        )}
      </section>

      {lightbox && (
        <MediaDetailModal
          asset={lightbox}
          onClose={() => setLightbox(null)}
          onUpdated={(updated) => {
            setAssets((prev) => prev.map((asset) => (asset.id === updated.id ? updated : asset)));
            setLightbox(updated);
            if (!categories.includes(updated.category)) {
              setCategories((prev) => [...prev, updated.category].sort());
            }
            if (updated.subcategory && !subcategories.includes(updated.subcategory)) {
              setSubcategories((prev) => [...prev, updated.subcategory!].sort());
            }
          }}
          onDeleted={(id) => {
            setAssets((prev) => prev.filter((asset) => asset.id !== id));
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
            if (asset.subcategory && !subcategories.includes(asset.subcategory)) {
              setSubcategories((prev) => [...prev, asset.subcategory!].sort());
            }
          }}
        />
      )}
    </div>
  );
}
