import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';

interface OverlayItem {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export default function Personalization() {
  const { t } = useI18n();
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [message, setMessage] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    setLoading(true);
    const { data, error } = await invokeEdgeFunction('external-photos');
    if (!error) {
      const recent = data?.recent?.[0];
      setBaseImage(recent?.image_url || recent?.thumbnail_url || null);
    }
    setLoading(false);
  }

  function handleAddOverlay(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setOverlays((prev) => [
        {
          id: crypto.randomUUID(),
          name: file.name,
          url,
          enabled: true,
        },
        ...prev,
      ]);
    };
    reader.readAsDataURL(file);
  }

  const enabledOverlays = useMemo(
    () => overlays.filter((o) => o.enabled),
    [overlays]
  );

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setOverlays([]);
    const { data, error } = await invokeEdgeFunction('generate-overlays', {
      method: 'POST',
      body: { message, prompt, baseImageUrl: baseImage },
    });
    if (error) {
      setGenerateError(error);
      setGenerating(false);
      return;
    }
    const newOverlays = (data?.overlays || []).map((o: { name: string; url: string }) => ({
      id: crypto.randomUUID(),
      name: o.name,
      url: o.url,
      enabled: true,
    }));
    setOverlays((prev) => [...newOverlays, ...prev]);
    setGenerating(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('personalization.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('personalization.subtitle')}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <GlassCard className="p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-800">{t('personalization.preview')}</h3>
            <button
              onClick={loadRecent}
              className="glass-button-secondary"
            >
              {t('app.refresh')}
            </button>
          </div>

          <div className="relative w-full overflow-hidden rounded-2xl bg-slate-100 aspect-[4/3]">
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

            {enabledOverlays.map((overlay) => (
              <img
                key={overlay.id}
                src={overlay.url}
                alt={overlay.name}
                className="absolute inset-0 h-full w-full object-contain"
              />
            ))}

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
        </GlassCard>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="mb-4 text-base font-semibold text-slate-800">{t('personalization.overlays')}</h3>
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAddOverlay(e.target.files)}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="glass-button-secondary w-full"
              >
                <Upload className="h-4 w-4" />
                {t('personalization.upload_overlay')}
              </button>

              <div className="space-y-2">
                {overlays.map((overlay) => (
                  <div
                    key={overlay.id}
                    className="flex items-center justify-between rounded-xl bg-white/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700">{overlay.name}</p>
                      <p className="text-xs text-slate-400">{overlay.enabled ? 'Visible' : 'Hidden'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-slate-500 hover:text-slate-700"
                        onClick={() =>
                          setOverlays((prev) =>
                            prev.map((o) =>
                              o.id === overlay.id ? { ...o, enabled: !o.enabled } : o
                            )
                          )
                        }
                      >
                        {overlay.enabled ? 'Hide' : 'Show'}
                      </button>
                      <button
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() =>
                          setOverlays((prev) => prev.filter((o) => o.id !== overlay.id))
                        }
                        aria-label="Remove overlay"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {overlays.length === 0 && (
                  <p className="text-sm text-slate-400">{t('app.none')}</p>
                )}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
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
              disabled={generating || (!message && !prompt)}
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
