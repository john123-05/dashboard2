import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { supabase } from '../lib/supabase';
import GlassCard from '../components/ui/GlassCard';
import OverlayBuilder from '../components/OverlayBuilder';
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

function toLocalDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalDateTime(value: string) {
  return value ? new Date(value).toISOString() : null;
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
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [builderSaving, setBuilderSaving] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [autoApplyUpload, setAutoApplyUpload] = useState(true);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [savingLayer, setSavingLayer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    starts_at: toLocalDateTimeInputValue(new Date()),
    ends_at: '',
    priority: 100,
    status: 'draft' as OverlayCampaign['status'],
  });
  const [layerForm, setLayerForm] = useState({
    asset_id: '',
    z_index: 10,
    opacity: 1,
    blend_mode: 'normal' as OverlayCampaignLayer['blend_mode'],
    fit: 'contain' as OverlayCampaignLayer['fit'],
    anchor: 'center' as OverlayCampaignLayer['anchor'],
    scale: 1,
  });

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
      await uploadOverlayFile(file);
      await loadOverlayData();
      setMessage('Overlay aus dem Builder gespeichert – du findest es unten in der Overlay-Liste zum Anwenden.');
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
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerate() {
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
        await uploadOverlayFile(file);
      }
      await loadOverlayData();
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

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!parkId) return;
    setCreatingCampaign(true);
    setActionError(null);
    const startsAt = toIsoFromLocalDateTime(campaignForm.starts_at);
    const endsAt = campaignForm.ends_at ? toIsoFromLocalDateTime(campaignForm.ends_at) : null;
    if (!startsAt) {
      setCreatingCampaign(false);
      setActionError('Start date is required.');
      return;
    }

    const { data, error } = await supabase
      .from('overlay_campaigns')
      .insert({
        park_id: parkId,
        name: campaignForm.name.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        priority: Number(campaignForm.priority) || 100,
        status: campaignForm.status,
      })
      .select('id')
      .single();

    if (error) {
      setActionError(error.message);
      setCreatingCampaign(false);
      return;
    }

    setCampaignForm((prev) => ({
      ...prev,
      name: '',
      ends_at: '',
      priority: 100,
      status: 'draft',
    }));
    setCreatingCampaign(false);
    await loadOverlayData();
    setSelectedCampaignId((data as { id: string }).id);
  }

  async function handleAddLayer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCampaign || !layerForm.asset_id) return;
    setSavingLayer(true);
    setActionError(null);
    const { error } = await supabase.from('overlay_campaign_layers').insert({
      campaign_id: selectedCampaign.id,
      asset_id: layerForm.asset_id,
      z_index: Number(layerForm.z_index) || 10,
      opacity: Number(layerForm.opacity) || 1,
      blend_mode: layerForm.blend_mode,
      fit: layerForm.fit,
      anchor: layerForm.anchor,
      scale: Number(layerForm.scale) || 1,
    });

    if (error) {
      setActionError(error.message);
      setSavingLayer(false);
      return;
    }

    setSavingLayer(false);
    await loadOverlayData();
  }

  async function handleRemoveLayer(layerId: string) {
    setActionError(null);
    const { error } = await supabase.from('overlay_campaign_layers').delete().eq('id', layerId);
    if (error) {
      setActionError(error.message);
      return;
    }
    await loadOverlayData();
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

  async function handleUpdateCampaignStatus(
    campaignId: string,
    status: OverlayCampaign['status']
  ) {
    setActionError(null);
    const { error } = await supabase
      .from('overlay_campaigns')
      .update({ status })
      .eq('id', campaignId);
    if (error) {
      setActionError(error.message);
      return;
    }
    await loadOverlayData();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('personalization.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('personalization.subtitle')}</p>
      </div>

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

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <GlassCard className="p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-slate-800">{t('personalization.preview')}</h3>
              <button
                onClick={loadRecent}
                className="glass-button-secondary"
              >
                {t('app.refresh')}
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="relative w-full overflow-hidden rounded-2xl bg-slate-100 aspect-[4/3] xl:aspect-[16/10]">
                {loading ? (
                  <div className="absolute inset-0 animate-pulse bg-white/40" />
                ) : baseImage ? (
                  <img
                    src={baseImage}
                    alt="Recent"
                    className="h-full w-full object-cover"
                  />
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

                {message && (
                  <div className="absolute bottom-4 left-4 rounded-xl bg-black/50 px-3 py-2 text-sm text-white">
                    {message}
                  </div>
                )}

                {generating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/80 px-6 py-5 shadow-lg backdrop-blur">
                      <video
                        src="https://xcrxltiiovpoladpaewd.supabase.co/storage/v1/object/public/test/_users_a6264f06-7d84-48b9-81d1-6a9e29e69b37_generated_c9f8234e-91e9-4185-b15c-f2e2ffe43415_generated_video.mov"
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-24 w-24 rounded-xl object-cover"
                      />
                      <div className="text-sm font-semibold text-slate-700">
                        <span className="inline-block overflow-hidden whitespace-nowrap border-r-2 border-slate-500 pr-1 animate-[typing_2.4s_steps(12)_infinite]">
                          Generating...
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white/30 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Gespeicherte Overlays</h4>
                    <p className="text-xs text-slate-500">Direkt sichtbar nach dem Speichern.</p>
                  </div>
                  <span className="rounded-full bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {assets.length}
                  </span>
                </div>

                {assets.length > 0 ? (
                  <div className="flex gap-3 overflow-x-auto pb-2 xl:grid xl:max-h-[28rem] xl:grid-cols-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0">
                    {assets.map((asset) => {
                      const isDeleting = deletingAssetId === asset.id;
                      const isActive = selectedAssetIds.has(asset.id);

                      return (
                        <div
                          key={asset.id}
                          className="w-36 shrink-0 rounded-2xl border border-white/40 bg-white/70 p-3 shadow-sm sm:w-40 xl:w-auto"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                isActive
                                  ? 'bg-brand-100 text-brand-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {isActive ? 'Aktiv' : 'Overlay'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleDeleteAsset(asset)}
                              disabled={isDeleting}
                              className="rounded-full p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Delete ${pathBasename(asset.path)}`}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
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

                          <div className="mt-2 space-y-1">
                            <p className="truncate text-sm font-medium text-slate-700">
                              {pathBasename(asset.path)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {asset.width && asset.height ? `${asset.width}x${asset.height}` : 'Groesse unbekannt'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Noch keine Overlays gespeichert.</p>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-white/30 pt-6">
              <h3 className="mb-1 text-base font-semibold text-slate-800">Overlay-Builder</h3>
              <p className="mb-4 text-sm text-slate-500">
                Baue dir ein Overlay zusammen: Format wählen, Logo/Bild und Texte hinzufügen, per Drag &amp; Drop
                anordnen und als Overlay speichern. Es erscheint danach direkt oben in der Galerie.
              </p>
              <OverlayBuilder onSave={handleBuilderSave} saving={builderSaving} previewUrl={baseImage} />
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="p-4 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">{t('personalization.overlays')}</h3>
            <div className="space-y-3">
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
                className="glass-button-secondary w-full"
                disabled={!parkId || uploading}
              >
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading...' : t('personalization.upload_overlay')}
              </button>

              <label className="flex items-start gap-2 rounded-xl bg-white/30 px-3 py-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={autoApplyUpload}
                  onChange={(e) => setAutoApplyUpload(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong className="block text-slate-700">Nach Upload sofort verwenden</strong>
                  <span className="text-xs text-slate-500">
                    Erstellt automatisch eine aktive Overlay-Kampagne fuer diesen Park.
                  </span>
                </span>
              </label>

              <div className="rounded-xl border border-dashed border-white/40 bg-white/20 px-3 py-3 text-sm text-slate-500">
                Neue Uploads und Builder-Overlays erscheinen direkt links in der Galerie neben der Vorschau.
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Campaigns</h3>
            <form onSubmit={handleCreateCampaign} className="space-y-3">
              <input
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Campaign name"
                required
                className="glass-input"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="datetime-local"
                  value={campaignForm.starts_at}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, starts_at: e.target.value }))}
                  required
                  className="glass-input"
                />
                <input
                  type="datetime-local"
                  value={campaignForm.ends_at}
                  onChange={(e) => setCampaignForm((prev) => ({ ...prev, ends_at: e.target.value }))}
                  className="glass-input"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  value={campaignForm.priority}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      priority: Number(e.target.value) || 100,
                    }))
                  }
                  className="glass-input"
                />
                <select
                  value={campaignForm.status}
                  onChange={(e) =>
                    setCampaignForm((prev) => ({
                      ...prev,
                      status: e.target.value as OverlayCampaign['status'],
                    }))
                  }
                  className="glass-input"
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </div>
              <button
                type="submit"
                className="glass-button-primary w-full"
                disabled={!parkId || creatingCampaign}
              >
                {creatingCampaign ? 'Creating...' : 'Create Campaign'}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`rounded-xl border px-3 py-2 ${
                    campaign.id === selectedCampaignId
                      ? 'border-brand-300 bg-brand-50/40'
                      : 'border-white/30 bg-white/20'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    className="w-full text-left"
                  >
                    <p className="truncate text-sm font-medium text-slate-700">{campaign.name}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(campaign.starts_at).toLocaleString()} - {campaign.status} - P
                      {campaign.priority}
                    </p>
                  </button>
                  <div className="mt-2 flex gap-2">
                    {campaign.status !== 'active' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateCampaignStatus(campaign.id, 'active')}
                        className="text-xs text-emerald-700 hover:text-emerald-800"
                      >
                        Activate
                      </button>
                    )}
                    {campaign.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateCampaignStatus(campaign.id, 'archived')}
                        className="text-xs text-slate-600 hover:text-slate-800"
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {campaigns.length === 0 && <p className="text-sm text-slate-400">No campaigns yet.</p>}
            </div>
          </GlassCard>

          <GlassCard className="p-4 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">Campaign Layers</h3>
            <form onSubmit={handleAddLayer} className="space-y-3">
              <select
                value={layerForm.asset_id}
                onChange={(e) => setLayerForm((prev) => ({ ...prev, asset_id: e.target.value }))}
                className="glass-input"
                required
              >
                <option value="">Select overlay asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {pathBasename(asset.path)}
                  </option>
                ))}
              </select>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="number"
                  value={layerForm.z_index}
                  onChange={(e) =>
                    setLayerForm((prev) => ({ ...prev, z_index: Number(e.target.value) || 10 }))
                  }
                  className="glass-input"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={layerForm.opacity}
                  onChange={(e) =>
                    setLayerForm((prev) => ({ ...prev, opacity: Number(e.target.value) || 1 }))
                  }
                  className="glass-input"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={layerForm.fit}
                  onChange={(e) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      fit: e.target.value as OverlayCampaignLayer['fit'],
                    }))
                  }
                  className="glass-input"
                >
                  <option value="contain">contain</option>
                  <option value="cover">cover</option>
                  <option value="fill">fill</option>
                </select>
                <select
                  value={layerForm.anchor}
                  onChange={(e) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      anchor: e.target.value as OverlayCampaignLayer['anchor'],
                    }))
                  }
                  className="glass-input"
                >
                  <option value="center">center</option>
                  <option value="top_left">top_left</option>
                  <option value="top">top</option>
                  <option value="top_right">top_right</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                  <option value="bottom_left">bottom_left</option>
                  <option value="bottom">bottom</option>
                  <option value="bottom_right">bottom_right</option>
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={layerForm.blend_mode}
                  onChange={(e) =>
                    setLayerForm((prev) => ({
                      ...prev,
                      blend_mode: e.target.value as OverlayCampaignLayer['blend_mode'],
                    }))
                  }
                  className="glass-input"
                >
                  <option value="normal">normal</option>
                  <option value="multiply">multiply</option>
                  <option value="screen">screen</option>
                  <option value="overlay">overlay</option>
                  <option value="darken">darken</option>
                  <option value="lighten">lighten</option>
                  <option value="color-dodge">color-dodge</option>
                  <option value="color-burn">color-burn</option>
                  <option value="hard-light">hard-light</option>
                  <option value="soft-light">soft-light</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="3"
                  value={layerForm.scale}
                  onChange={(e) =>
                    setLayerForm((prev) => ({ ...prev, scale: Number(e.target.value) || 1 }))
                  }
                  className="glass-input"
                />
              </div>
              <button
                type="submit"
                className="glass-button-primary w-full"
                disabled={!selectedCampaign || !layerForm.asset_id || savingLayer}
              >
                {savingLayer ? 'Saving...' : 'Add Layer to Campaign'}
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {selectedLayers.map((layer) => {
                const asset = assetById.get(layer.asset_id);
                return (
                  <div key={layer.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700">
                        {asset ? pathBasename(asset.path) : layer.asset_id}
                      </p>
                      <p className="text-xs text-slate-400">
                        z{layer.z_index} - {layer.fit} - {layer.anchor}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600"
                      onClick={() => handleRemoveLayer(layer.id)}
                      aria-label="Remove layer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {selectedLayers.length === 0 && (
                <p className="text-sm text-slate-400">No layers in selected campaign.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-4 sm:p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">{t('personalization.message')}</h3>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t('personalization.message')}
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Thanks for riding with us!"
              className="glass-input"
            />
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('personalization.ai_hint')}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="Add colors, themes, event names, or special notes..."
                className="glass-input"
              />
            </div>
            {generateError && (
              <p className="mt-3 text-xs text-rose-600">{generateError}</p>
            )}
            <button
              className="glass-button-primary mt-4 w-full"
              onClick={handleGenerate}
              disabled={generating || (!message && !prompt) || !parkId}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {t('personalization.generate')}
            </button>
          </GlassCard>
        </div>
      </div>

    </div>
  );
}
