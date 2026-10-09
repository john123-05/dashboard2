import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Loader2, Trash2, PencilRuler, CheckCircle2, RefreshCw } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { supabase } from '../lib/supabase';
import GlassCard from '../components/ui/GlassCard';
import OverlayBuilder, { type OpenRequest } from '../components/OverlayBuilder';
import { UpgradePageHeader } from '../components/upgrade/UpgradeHero';
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
  const { parkId, parkName } = usePark();
  const { user } = useAuth();
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [assets, setAssets] = useState<OverlayAssetWithPreview[]>([]);
  const [campaigns, setCampaigns] = useState<OverlayCampaignWithLayers[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [openRequest, setOpenRequest] = useState<OpenRequest | null>(null);
  const galleryRef = useRef<HTMLDivElement | null>(null);
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
      galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('perso.save_failed'));
    } finally {
      setBuilderSaving(false);
    }
  }

  async function uploadOverlayFile(file: File) {
    if (!parkId || !user) throw new Error(t('perso.select_park_sign_in'));

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
    if (!parkId) throw new Error(t('perso.select_park'));

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
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('perso.upload_failed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate(message: string, prompt: string) {
    if (!parkId || !user) {
      setGenerateError(t('perso.select_park_sign_in'));
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
      }
    } catch (uploadError) {
      setGenerateError(
        uploadError instanceof Error
          ? uploadError.message
          : t('perso.generated_upload_failed')
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
      setActionError(err instanceof Error ? err.message : t('perso.activate_failed'));
    } finally {
      setActivatingAssetId(null);
    }
  }

  function openInEditor(url: string) {
    setOpenRequest({ url, nonce: Date.now() });
  }

  const checker = 'repeating-conic-gradient(#e5e9f0 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';

  return (
    <div className="space-y-6">
      <UpgradePageHeader title={t('personalization.title')} subtitle={t('personalization.subtitle')} />

      {!parkId && (
        <GlassCard className="p-4">
          <p className="text-sm text-amber-700">{t('perso.no_park_note')}</p>
        </GlassCard>
      )}

      {actionError && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</div>
      )}

      <AutomatBranding onOpenInEditor={openInEditor} />

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('perso.studio_title')}</h3>
          <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('perso.edit_sub')}</p>
        </div>
        <OverlayBuilder
          onSave={handleBuilderSave}
          saving={builderSaving}
          previewUrl={baseImage}
          onGenerate={handleGenerate}
          generating={generating}
          generateError={generateError}
          parkId={parkId}
          brandName={parkName}
          openRequest={openRequest}
        />
      </section>

      <div ref={galleryRef}>
        <GlassCard className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-[color:var(--ink)]">{t('perso.saved_overlays')}</h3>
              <p className="mt-0.5 text-sm text-[color:var(--ink-3)]">{t('perso.gallery_sub')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[color:var(--ink-2)]">
                <input type="checkbox" checked={autoApplyUpload} onChange={(e) => setAutoApplyUpload(e.target.checked)} className="accent-[#c2410c]" />
                {t('perso.use_on_save')}
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleAddOverlay(e.target.files);
                  e.target.value = '';
                }}
              />
              <button onClick={() => fileInputRef.current?.click()} className="glass-button-secondary py-1.5 text-sm" disabled={!parkId || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? t('perso.uploading') : t('perso.upload_ready')}
              </button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[color:var(--ink-2)]">{t('perso.preview')}</p>
                <button onClick={loadRecent} className="inline-flex items-center gap-1 text-xs text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('app.refresh')}
                </button>
              </div>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100">
                {loading ? (
                  <div className="absolute inset-0 animate-pulse bg-slate-100" />
                ) : baseImage ? (
                  <img src={baseImage} alt="" className="h-full w-full object-cover" />
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
                      alt=""
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
              <p className="mt-2 text-xs text-[color:var(--ink-3)]">{t('perso.preview_sub')}</p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[color:var(--ink-2)]">{t('perso.click_to_apply')}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{assets.length}</span>
              </div>
              {assets.length > 0 ? (
                <div className="grid max-h-[34rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {assets.map((asset) => {
                    const isDeleting = deletingAssetId === asset.id;
                    const isActivating = activatingAssetId === asset.id;
                    const isActive = selectedAssetIds.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        className={`group overflow-hidden rounded-lg border bg-white transition ${
                          isActive ? 'border-brand-600 ring-1 ring-brand-600' : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => !isActive && void handleActivateAsset(asset)}
                          disabled={isActivating}
                          className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden"
                          style={{ background: checker }}
                          title={t('perso.click_to_apply')}
                        >
                          {asset.preview_url ? (
                            <img src={asset.preview_url} alt={pathBasename(asset.path)} className="h-full w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-300" />
                          )}
                          {(isActive || isActivating) && (
                            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                              {isActivating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              {isActivating ? t('perso.activating') : t('perso.active')}
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 border-t border-[color:var(--line)] px-2 py-1.5">
                          <p className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--ink-3)]">
                            {new Date(asset.created_at).toLocaleDateString()}
                          </p>
                          {asset.preview_url && (
                            <button
                              type="button"
                              onClick={() => openInEditor(asset.preview_url!)}
                              title={t('branding.open_in_editor')}
                              aria-label={t('branding.open_in_editor')}
                              className="rounded p-1 text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-brand-700"
                            >
                              <PencilRuler className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDeleteAsset(asset)}
                            aria-label={t('perso.delete_asset', { name: pathBasename(asset.path) })}
                            title={t('builder.delete')}
                            className="rounded p-1 text-[color:var(--ink-3)] hover:bg-rose-50 hover:text-rose-600"
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-[color:var(--line-strong)] px-4 py-6 text-center text-sm text-[color:var(--ink-3)]">
                  {t('perso.no_overlays')}
                </p>
              )}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
