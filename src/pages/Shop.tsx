import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Mail, Shirt } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { usePark } from '../contexts/ParkContext';
import { claimSiteBaseFor } from '../lib/photoBrowser';
import { fetchShopOverview, saveShopSettings, uploadShopLogo, type ShopSettings, type ShopRevenue } from '../lib/shop';

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </GlassCard>
  );
}

export default function Shop() {
  const { parkId, isKioskPark } = usePark();
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [revenue, setRevenue] = useState<ShopRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [colorInput, setColorInput] = useState('#C6A233');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const shopUrl = parkId ? claimSiteBaseFor(parkId) && `${claimSiteBaseFor(parkId)}/shop` : null;

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    fetchShopOverview(parkId)
      .then(({ settings: s, revenue: r }) => {
        if (!active) return;
        setSettings(s);
        setRevenue(r);
        setPriceInput((s.price_cents / 100).toString());
        setColorInput(s.accent_color);
        setError(null);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  async function handleSave() {
    if (!parkId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const priceCents = Math.round(Number(priceInput.replace(',', '.')) * 100);
      const updated = await saveShopSettings(parkId, { price_cents: priceCents, accent_color: colorInput });
      setSettings(updated);
      setStatus('Gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(file: File) {
    if (!parkId) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const updated = await uploadShopLogo(parkId, file);
      setSettings(updated);
      setStatus('Logo gespeichert.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo-Upload fehlgeschlagen.');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  if (!isKioskPark) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Shop</h2>
        <GlassCard className="p-6">
          <p className="text-sm text-slate-500">Diese Seite gilt aktuell nur für Selbstbedienungs-Automaten.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Shop</h2>
        <p className="mt-1 text-sm text-slate-500">
          Second Chance Sales - dein Online-Shop für nicht abgeholte Fotos (Prototyp, Stripe im Test-Modus).
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {status && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p>}

      <SectionCard title="Vorschau">
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : shopUrl ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/60 p-4">
            <p className="truncate text-sm text-slate-600">{shopUrl}</p>
            <a
              href={shopUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Im Browser öffnen
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">Für diesen Park gibt es noch keine Shop-Seite.</p>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Preis" subtitle="Preis pro Foto im Shop">
          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
          ) : (
            <div className="mt-4 flex items-center gap-2">
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="w-28 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
              />
              <span className="text-sm text-slate-500">€</span>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Branding" subtitle="Akzentfarbe und Logo für den Shop">
          {loading ? (
            <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colorInput}
                  onChange={(e) => setColorInput(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-slate-200 bg-white"
                />
                <span className="text-sm text-slate-500">{colorInput}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white/60">
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-slate-300" />
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoChange(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  {uploadingLogo ? 'Wird hochgeladen…' : 'Logo hochladen'}
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {saving ? 'Speichert…' : 'Preis & Farbe speichern'}
        </button>
      </div>

      <SectionCard title="Umsatz aus dem Shop">
        {loading ? (
          <p className="mt-4 text-sm text-slate-400">Wird geladen…</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/60 p-4">
              <p className="text-2xl font-bold text-slate-800">
                {((revenue?.totalCents ?? 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </p>
              <p className="text-xs text-slate-500">Gesamtumsatz</p>
            </div>
            <div className="rounded-xl bg-white/60 p-4">
              <p className="text-2xl font-bold text-slate-800">{revenue?.salesCount ?? 0}</p>
              <p className="text-xs text-slate-500">Verkäufe</p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Print-on-Demand" subtitle="Noch kein Anbieter angebunden">
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl bg-white/60 p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Postkarte</span>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
              Bald verfügbar
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-white/60 p-4">
            <div className="flex items-center gap-3">
              <Shirt className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">T-Shirt</span>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
              Bald verfügbar
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
