import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Loader2, Trash2 } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { supabase } from '../lib/supabase';
import GlassCard from '../components/ui/GlassCard';
import OverlayBuilder from '../components/OverlayBuilder';
import AutomatBranding from '../components/AutomatBranding';
import { useI18n } from '../lib/i18n';
import { usePark } from '../contexts/ParkContext';
import { useAuth } from '../contexts/AuthContext';
import type { OverlayAsset, OverlayCampaign, OverlayCampaignLayer } from '../lib/types';

type OverlayAssetWithPreview = OverlayAsset & {
  preview_url: string | null;
};

type OverlayLayerWithAsset = OverlayCampaignLayer & {
  asset: OverlayAsset | null;
};

type OverlayCampaignWithLayers = OverlayCampaign & {
  layers: OverlayLayerWithAsset[];
};

type OverlayCampaignRow = OverlayCampaign & {
  layers: Array<OverlayCampaignLayer & { asset: OverlayAsset[] | OverlayAsset | null }>;
};

function pathBasename(path: string) {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

async function readImageDimensions(file: Blob) {
  if (!file.type.startsWith('image/')) return { width: null, height: null };
  const objectUrl = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = objectUrl;
    });
    return size;
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function anchorToObjectPosition(anchor: string) {
  switch (anchor) {
    case 'top_left':
      return 'left top';
    case 'top':
      return 'center top';
    case 'top_right':
      return 'right top';
    case 'left':
      return 'left center';
    case 'right':
      return 'right center';
    case 'bottom_left':
      return 'left bottom';
    case 'bottom':
      return 'center bottom';
    case 'bottom_right':
      return 'right bottom';
    default:
      return 'center center';
  }
}

export default function Personalization() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const { user } = useAuth();
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [assets, setAssets] = useState<OverlayAssetWithPreview[]>([]);
  const [campaigns, setCampaigns] = useState<OverlayCampaignWithLayers[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('edit');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [builderSaving, setBuilderSaving] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [activatingAssetId, setActivatingAssetId] = useState<string | null>(null);
  const [autoApplyUpload, setAutoApplyUpload] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadRecent();
  }, [parkId]);

  useEffect(() => {
    loadOverlayData();
  }, [parkId]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const assetById = useMemo(() => {
    const map = new Map<string, OverlayAssetWithPreview>();
    for (const asset of assets) map.set(asset.id, asset);
    return map;
  }, [assets]);

  const selectedLayers = useMemo(() => {
    if (!selectedCampaign) return [];
    return [...(selectedCampaign.layers || [])].sort((a, b) => a.z_index - b.z_index);
  }, [selectedCampaign]);

  const selectedAssetIds = useMemo(
    () => new Set(selectedLayers.map((layer) => layer.asset_id)),
    [selectedLayers]
  );

  async function loadRecent() {
    setLoading(true);
    const { data, error } = await invokeEdgeFunction('external-photos', {
      query: { park_id: parkId || undefined },
    });
    if (!error) {
      const recent = data?.recent?.[0];
      setBaseImage(recent?.image_url || recent?.thumbnail_url || null);
    }
    setLoading(false);
  }

  async function loadOverlayData() {
    if (!parkId) {
      setAssets([]);
      setCampaigns([]);
      setSelectedCampaignId(null);
      return;
    }

    setActionError(null);

    const { data: assetRows, error: assetError } = await supabase
      .from('overlay_assets')
      .select('*')
      .eq('park_id', parkId)
      .order('created_at', { ascending: false });

    if (assetError) {
      setActionError(assetError.message);
      return;
    }

    const assetsWithPreview: OverlayAssetWithPreview[] = await Promise.all(
      ((assetRows || []) as OverlayAsset[]).map(async (asset) => {
        const { data: signed } = await supabase.storage
          .from(asset.bucket)
          .createSignedUrl(asset.path, 3600);
        return {
          ...asset,
          preview_url: signed?.signedUrl || null,
        };
      })
    );

    setAssets(assetsWithPreview);

    const { data: campaignRows, error: campaignError } = await supabase
      .from('overlay_campaigns')
      .select(`
        id, park_id, name, starts_at, ends_at, priority, status, created_at,
        layers:overlay_campaign_layers(
          id, campaign_id, asset_id, z_index, opacity, blend_mode, fit, anchor, scale,
          asset:overlay_assets(id, park_id, bucket, path, mime_type, width, height, created_by, created_at)
        )
      `)
      .eq('park_id', parkId)
      .order('starts_at', { ascending: false });

    if (campaignError) {
      setActionError(campaignError.message);
      return;
    }

    const parsedCampaigns = ((campaignRows || []) as unknown as OverlayCampaignRow[]).map((campaign) => ({
      ...campaign,
      layers: (campaign.layers || []).map((layer) => ({
        ...layer,
        asset: Array.isArray(layer.asset) ? layer.asset[0] || null : layer.asset,
      })) as OverlayLayerWithAsset[],
    }));

    setCampaigns(parsedCampaigns);

    if (parsedCampaigns.length === 0) {
      setSelectedCampaignId(null);
    } else if (!selectedCampaignId || !parsedCampaigns.some((c) => c.id === selectedCampaignId)) {
      setSelectedCampaignId(parsedCampaigns[0].id);
    }
  }

  async function handleBuilderSave(file: File) {
    setBuilderSaving(true);
    setActionError(null);
    try {
      const asset = await uploadOverlayFile(file);
      let activatedCampaignId: string | null = null;
      if (autoApplyUpload) {
        activatedCampaignId = await activateUploadedOverlay(asset);
      }
      await loadOverlayData();
      if (activatedCampaignId) {
        setSelectedCampaignId(activatedCampaignId);
      }
      setViewMode('preview');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBuilderSaving(false);
    }
  }

  async function uploadOverlayFile(file: File) {
    if (!parkId || !user) throw new Error('Please select a park and sign in.');

    const normalized = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const extension = normalized.includes('.') ? normalized.split('.').pop() : 'png';
    const path = `${parkId}/${crypto.randomUUID()}.${extension}`;
    const { width, height } = await readImageDimensions(file);

    const { error: uploadError } = await supabase.storage
      .from('overlays')
      .upload(path, file, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data, error: insertError } = await supabase
      .from('overlay_assets')
      .insert({
        park_id: parkId,
        bucket: 'overlays',
        path,
        mime_type: file.type || 'application/octet-stream',
        width,
        height,
        created_by: user.id,
      })
      .select('*')
      .single();

    if (insertError) {
      await supabase.storage.from('overlays').remove([path]);
      throw new Error(insertError.message);
    }

    return data as OverlayAsset;
  }

  async function activateUploadedOverlay(asset: OverlayAsset) {
    if (!parkId) throw new Error('Please select a park first.');

    await supabase
      .from('overlay_campaigns')
      .update({ status: 'archived' })
      .eq('park_id', parkId)
      .eq('status', 'active')
      .like('name', 'Sofort Overlay:%');

    const { data: campaign, error: campaignError } = await supabase
      .from('overlay_campaigns')
      .insert({
        park_id: parkId,
        name: `Sofort Overlay: ${pathBasename(asset.path)}`,
        starts_at: new Date().toISOString(),
        ends_at: null,
        priority: 1000,
        status: 'active',
      })
      .select('id')
      .single();

    if (campaignError) throw new Error(campaignError.message);

    const campaignId = (campaign as { id: string }).id;
    const { error: layerError } = await supabase.from('overlay_campaign_layers').insert({
      campaign_id: campaignId,
      asset_id: asset.id,
      z_index: 10,
      opacity: 1,
      blend_mode: 'normal',
      fit: 'fill',
      anchor: 'center',
      scale: 1,
    });

    if (layerError) throw new Error(layerError.message);
    return campaignId;
  }

  async function handleAddOverlay(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setActionError(null);
    let activatedCampaignId: string | null = null;
    try {
      const uploadedAssets: OverlayAsset[] = [];
      for (const file of Array.from(files)) {
        uploadedAssets.push(await uploadOverlayFile(file));
      }

      const latestAsset = uploadedAssets[uploadedAssets.length - 1];
      if (autoApplyUpload && latestAsset) {
        activatedCampaignId = await activateUploadedOverlay(latestAsset);
      }

      await loadOverlayData();
      if (activatedCampaignId) {
        setSelectedCampaignId(activatedCampaignId);
        setViewMode('preview');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate(message: string, prompt: string) {
    if (!parkId || !user) {
      setGenerateError('Please select a park and sign in.');
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    const { data, error } = await invokeEdgeFunction('generate-overlays', {
      method: 'POST',
      body: { message, prompt, baseImageUrl: baseImage },
    });
    if (error) {
      setGenerateError(error);
      setGenerating(false);
      return;
    }
    try {
      let lastAsset: OverlayAsset | null = null;
      for (const generated of data?.overlays || []) {
        const item = generated as { name: string; url: string };
        if (!item?.url) continue;
        const response = await fetch(item.url);
        if (!response.ok) continue;
        const blob = await response.blob();
        const filename = item.name || `overlay-${crypto.randomUUID()}.png`;
        const file = new File([blob], filename, {
          type: blob.type || 'image/png',
        });
        lastAsset = await uploadOverlayFile(file);
      }

      let activatedCampaignId: string | null = null;
      if (autoApplyUpload && lastAsset) {
        activatedCampaignId = await activateUploadedOverlay(lastAsset);
      }

      await loadOverlayData();
      if (activatedCampaignId) {
        setSelectedCampaignId(activatedCampaignId);
        setViewMode('preview');
      }
    } catch (uploadError) {
      setGenerateError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Overlay generated but upload failed.'
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteAsset(asset: OverlayAssetWithPreview) {
    setDeletingAssetId(asset.id);
    setActionError(null);

    const { error: layerError } = await supabase
      .from('overlay_campaign_layers')
      .delete()
      .eq('asset_id', asset.id);

    if (layerError) {
      setActionError(layerError.message);
      setDeletingAssetId(null);
      return;
    }

    const { error: assetError } = await supabase
      .from('overlay_assets')
      .delete()
      .eq('id', asset.id);

    if (assetError) {
      setActionError(assetError.message);
      setDeletingAssetId(null);
      return;
    }

    const { error: storageError } = await supabase.storage.from(asset.bucket).remove([asset.path]);
    if (storageError) {
      setActionError(storageError.message);
    }

    await loadOverlayData();
    setDeletingAssetId(null);
  }

  async function handleActivateAsset(asset: OverlayAssetWithPreview) {
    setActivatingAssetId(asset.id);
    setActionError(null);
    try {
      const campaignId = await activateUploadedOverlay(asset);
      await loadOverlayData();
      setSelectedCampaignId(campaignId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Konnte Overlay nicht aktivieren.');
    } finally {
      setActivatingAssetId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('personalization.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('personalization.subtitle')}</p>
      </div>

      <AutomatBranding />

      {!parkId && (
        <GlassCard className="p-4">
          <p className="text-sm text-amber-700">
            Please select a park first. Overlay assets and campaigns are park-scoped.
          </p>
        </GlassCard>
      )}

      {actionError && (
        <GlassCard className="p-4">
          <p className="text-sm text-rose-600">{actionError}</p>
        </GlassCard>
      )}

      <GlassCard className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Overlay-Bilder</h3>
            <p className="mt-1 text-sm text-slate-500">
              {viewMode === 'preview'
                ? 'So sieht dein aktuelles Foto mit Overlay aus.'
                : 'Overlay bauen, Element fuer Element - oder von der KI generieren lassen.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-xl bg-white/40 p-1">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === 'edit' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Overlay erstellen
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  viewMode === 'preview' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Vorschau
              </button>
            </div>
            {viewMode === 'preview' && (
              <button onClick={loadRecent} className="glass-button-secondary">
                {t('app.refresh')}
              </button>
            )}
          </div>
        </div>

        {viewMode === 'preview' ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative w-full overflow-hidden rounded-2xl bg-slate-100 aspect-[4/3] xl:aspect-[16/10]">
              {loading ? (
                <div className="absolute inset-0 animate-pulse bg-white/40" />
              ) : baseImage ? (
                <img src={baseImage} alt="Recent" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImageIcon className="h-6 w-6" />
                  <span className="ml-2 text-sm">{t('personalization.no_recent_photo')}</span>
                </div>
              )}

              {selectedLayers.map((layer) => {
                const preview = assetById.get(layer.asset_id)?.preview_url;
                if (!preview) return null;
                return (
                  <img
                    key={layer.id}
                    src={preview}
                    alt="Overlay"
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={{
                      zIndex: layer.z_index,
                      opacity: layer.opacity,
                      mixBlendMode: layer.blend_mode,
                      objectFit: layer.fit === 'fill' ? 'fill' : layer.fit,
                      objectPosition: anchorToObjectPosition(layer.anchor),
                      transform: `scale(${layer.scale})`,
                    }}
                  />
                );
              })}
            </div>

            <div className="rounded-2xl bg-white/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Gespeicherte Overlays</h4>
                  <p className="text-xs text-slate-500">Anklicken zum Anwenden.</p>
                </div>
                <span className="rounded-full bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {assets.length}
                </span>
              </div>

              {assets.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-2 xl:grid xl:max-h-[28rem] xl:grid-cols-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
                  {assets.map((asset) => {
                    const isDeleting = deletingAssetId === asset.id;
                    const isActivating = activatingAssetId === asset.id;
                    const isActive = selectedAssetIds.has(asset.id);

                    return (
                      <button
                        type="button"
                        key={asset.id}
                        onClick={() => !isActive && void handleActivateAsset(asset)}
                        disabled={isActivating}
                        className={`w-36 shrink-0 rounded-2xl border p-3 text-left shadow-sm transition sm:w-40 xl:w-auto ${
                          isActive
                            ? 'border-brand-300 bg-brand-50/60 ring-1 ring-brand-200'
                            : 'border-white/40 bg-white/70 hover:bg-white/90'
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              isActive ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isActivating ? 'Wird aktiv...' : isActive ? 'Aktiv' : 'Overlay'}
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteAsset(asset);
                            }}
                            aria-label={`Delete ${pathBasename(asset.path)}`}
                            className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </span>
                        </div>

                        <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                          {asset.preview_url ? (
                            <img
                              src={asset.preview_url}
                              alt={pathBasename(asset.path)}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <p className="mt-2 truncate text-sm font-medium text-slate-700">
                          {pathBasename(asset.path)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Noch keine Overlays gespeichert. Wechsle zu &bdquo;Overlay erstellen&ldquo;, um eins zu erstellen.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white/20 px-3 py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleAddOverlay(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="glass-button-secondary text-sm"
                disabled={!parkId || uploading}
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Fertige Datei hochladen'}
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={autoApplyUpload}
                  onChange={(e) => setAutoApplyUpload(e.target.checked)}
                />
                Beim Speichern sofort verwenden
              </label>
            </div>

            <OverlayBuilder
              onSave={handleBuilderSave}
              saving={builderSaving}
              previewUrl={baseImage}
              onGenerate={handleGenerate}
              generating={generating}
              generateError={generateError}
            />
          </div>
        )}
      </GlassCard>
    </div>
  );
}
