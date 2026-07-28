import { useState, useEffect } from 'react';
import { Save, Loader2, Building2, MapPin, Mountain, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';
import type { Park, Attraction } from '../lib/types';

interface StripePrice {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring_interval: string | null;
  active: boolean;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  images: string[];
  metadata: Record<string, string>;
  prices: StripePrice[];
}

function formatEuroInputFromCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

function parseEuroInputToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export default function Settings() {
  const { profile, currentOrg, memberships, refreshProfile } = useAuth();
  const { parkId, parkName, refreshKioskState } = usePark();
  const { language, setLanguage, t } = useI18n();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [parks, setParks] = useState<(Park & { attractions: Attraction[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedPriceIds, setSelectedPriceIds] = useState<Set<string>>(new Set());
  const [photoPriceInput, setPhotoPriceInput] = useState('');
  const [priceSavingMode, setPriceSavingMode] = useState<'future' | 'retroactive' | null>(null);
  const [priceMessage, setPriceMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [parkId]);

  async function loadData() {
    setLoading(true);
    const [parksResult, attractionsResult] = await Promise.all([
      invokeEdgeFunction('external-parks', {
        query: { park_id: parkId || undefined },
      }),
      invokeEdgeFunction('external-attractions', {
        query: { park_id: parkId || undefined },
      }),
    ]);

    const attractionsByPark = new Map<string, Attraction[]>();
    (((attractionsResult.data?.attractions || []) as any[]) || []).forEach((a) => {
      const list = attractionsByPark.get(a.park_id) || [];
      list.push({
        id: a.id,
        park_id: a.park_id,
        name: a.name,
        type: a.slug || 'attraction',
        status: a.is_active ? 'active' : 'inactive',
        created_at: a.created_at || new Date().toISOString(),
        updated_at: a.updated_at || new Date().toISOString(),
      } as Attraction);
      attractionsByPark.set(a.park_id, list);
    });

    setParks(
      (((parksResult.data?.parks || []) as any[]) || []).map((p) => ({
        id: p.id,
        organization_id: currentOrg?.id || '',
        name: p.name,
        slug: p.slug,
        location: null,
        timezone: 'UTC',
        price_per_photo_cents: p.price_per_photo_cents ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attractions: attractionsByPark.get(p.id) || [],
      }))
    );
    setLoading(false);
  }

  const selectedPark = parkId ? parks.find((p) => p.id === parkId) : parks[0];
  const parksToRender = selectedPark ? [selectedPark] : parks;

  useEffect(() => {
    setPhotoPriceInput(formatEuroInputFromCents(selectedPark?.price_per_photo_cents ?? null));
    setPriceMessage(null);
  }, [selectedPark?.id, selectedPark?.price_per_photo_cents]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from('operator_profiles').update({ full_name: fullName }).eq('id', profile.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const { data, error } = await invokeEdgeFunction('stripe-products');

      if (error) {
        console.error('Error loading Stripe products:', error);
        setProductsError(
          isEdgeSourceUnavailable(error)
            ? getOptionalSourceWarning('Stripe products', error)
            : error,
        );
        setProducts([]);
        setProductsLoading(false);
        return;
      }

      console.log('Stripe products response:', data);

      setProducts(data.products || []);
      setProductsError(null);

      setProductsLoading(false);
    } catch (err) {
      console.error('Exception loading products:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setProductsError(
        isEdgeSourceUnavailable(message)
          ? getOptionalSourceWarning('Stripe products', message)
          : message,
      );
      setProducts([]);
      setProductsLoading(false);
    }
  }

  async function handleOpenProductModal() {
    setShowProductModal(true);
    loadProducts();
    loadExistingSelections();
  }

  async function loadExistingSelections() {
    if (!currentOrg) return;

    const { data } = await supabase
      .from('stripe_product_selections')
      .select('price_id')
      .eq('organization_id', currentOrg.id);

    if (data) {
      setSelectedPriceIds(new Set(data.map(s => s.price_id)));
    }
  }

  function handleTogglePrice(priceId: string) {
    const newSet = new Set(selectedPriceIds);
    if (newSet.has(priceId)) {
      newSet.delete(priceId);
    } else {
      newSet.add(priceId);
    }
    setSelectedPriceIds(newSet);
  }

  async function handleSaveProductSelection() {
    if (!currentOrg) {
      alert('No organization selected');
      return;
    }

    try {
      const priceIds = Array.from(selectedPriceIds);

      await supabase.from('stripe_product_selections').delete().eq('organization_id', currentOrg.id);

      const productsByPrice = new Map<string, string>();
      products.forEach(product => {
        product.prices.forEach(price => {
          productsByPrice.set(price.id, product.id);
        });
      });

      const selections = priceIds.map(priceId => ({
        organization_id: currentOrg.id,
        price_id: priceId,
        product_id: productsByPrice.get(priceId) || '',
        created_by: profile?.id || null,
      }));

      if (selections.length > 0) {
        await supabase.from('stripe_product_selections').insert(selections);
      }

      console.log('Saved product selections:', selections);
      setShowProductModal(false);
    } catch (error) {
      console.error('Error saving selections:', error);
      alert('Failed to save selections');
    }
  }

  async function handleSaveKioskPrice(mode: 'future' | 'retroactive') {
    if (!selectedPark) return;

    const nextPriceCents = parseEuroInputToCents(photoPriceInput);
    if (nextPriceCents === null) {
      setPriceMessage('Bitte einen gültigen Bildpreis eingeben, z. B. 4,50');
      return;
    }

    setPriceSavingMode(mode);
    setPriceMessage(null);

    const { error } = await invokeEdgeFunction('update-kiosk-price', {
      method: 'POST',
      useSessionAuth: true,
      body: {
        park_id: selectedPark.id,
        price_cents: nextPriceCents,
        mode,
      },
    });

    if (error) {
      setPriceMessage(error);
      setPriceSavingMode(null);
      return;
    }

    await loadData();
    refreshKioskState();
    setPriceSavingMode(null);
    setPriceMessage(
      mode === 'retroactive'
        ? 'Bildpreis gespeichert. Frühere Umsatzwerte werden jetzt ebenfalls mit dem neuen Preis gerechnet.'
        : 'Bildpreis gespeichert. Neue Verkäufe laufen jetzt mit dem neuen Preis weiter.',
    );
  }

  const currentRole = memberships.find((m) => m.organization_id === currentOrg?.id)?.role || 'unknown';

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-white/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-white/30" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">{t('settings.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('settings.subtitle')}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('settings.language')}</h3>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            {t('settings.language')}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="glass-input"
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
            <option value="nl">Nederlands</option>
            <option value="lv">Latviešu</option>
          </select>
        </GlassCard>
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('settings.stripe_products')}</h3>
          <p className="mb-4 text-sm text-slate-600">
            {t('settings.stripe_products_desc')}
          </p>
          <button onClick={handleOpenProductModal} className="glass-button-primary">
            <Package className="h-4 w-4" />
            {t('settings.select_products')}
          </button>
        </GlassCard>
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('settings.profile')}</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('settings.full_name')}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="glass-input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('settings.email')}</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="glass-input cursor-not-allowed opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t('settings.role')}</label>
              <input
                type="text"
                value={currentRole.replace('_', ' ')}
                disabled
                className="glass-input cursor-not-allowed capitalize opacity-60"
              />
            </div>
            <button type="submit" disabled={saving} className="glass-button-primary">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                t('settings.saved')
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t('settings.save')}
                </>
              )}
            </button>
          </form>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">{t('settings.organization')}</h3>
          {parksToRender.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-white/30 p-4">
                <div className="rounded-xl bg-brand-100 p-3">
                  <Building2 className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{selectedPark?.name || t('app.none')}</p>
                  <p className="text-xs text-slate-500">{t('settings.slug')}: {selectedPark?.slug || '-'}</p>
                  {parkName && (
                    <p className="text-xs text-slate-500">{t('settings.active_park')}: {parkName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-600">{t('settings.parks_attractions')}</p>
                {parksToRender.map((park) => (
                  <div key={park.id} className="rounded-xl bg-white/30 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-brand-500" />
                      <p className="text-sm font-semibold text-slate-800">{park.name}</p>
                    </div>
                    {park.location && (
                      <p className="mb-2 text-xs text-slate-500">{park.location}</p>
                    )}
                    <div className="ml-6 space-y-1.5">
                      {park.attractions.map((attr) => (
                        <div key={attr.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Mountain className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-700">{attr.name}</span>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              attr.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : attr.status === 'maintenance'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-50 text-slate-500'
                            }`}
                          >
                            {attr.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('app.none')}</p>
          )}
        </GlassCard>

        <GlassCard className="p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{t('settings.kiosk_price.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('settings.kiosk_price.desc')}
              </p>
            </div>
            <div className="rounded-xl bg-white/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('settings.kiosk_price.current')}</p>
              <p className="mt-1 text-lg font-semibold text-slate-800">
                {selectedPark?.price_per_photo_cents != null
                  ? `${formatEuroInputFromCents(selectedPark.price_per_photo_cents)} €`
                  : t('settings.kiosk_price.not_set')}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,280px)_1fr]">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('settings.kiosk_price.label')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={photoPriceInput}
                  onChange={(e) => setPhotoPriceInput(e.target.value)}
                  placeholder="5,00"
                  className="glass-input pr-12"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                  EUR
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-white/30 p-4">
              <p className="text-sm font-medium text-slate-700">{t('settings.kiosk_price.scope')}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveKioskPrice('future')}
                  disabled={!selectedPark || priceSavingMode !== null}
                  className="glass-button-primary"
                >
                  {priceSavingMode === 'future' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('settings.kiosk_price.future')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveKioskPrice('retroactive')}
                  disabled={!selectedPark || priceSavingMode !== null}
                  className="glass-button-secondary"
                >
                  {priceSavingMode === 'retroactive' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('settings.kiosk_price.retroactive')}
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">{t('settings.kiosk_price.future')}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {t('settings.kiosk_price.future_desc')}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900">{t('settings.kiosk_price.retroactive')}</p>
                  <p className="mt-1 text-sm text-amber-700">
                    {t('settings.kiosk_price.retroactive_desc')}
                  </p>
                </div>
              </div>
              {priceMessage && (
                <p className="mt-4 text-sm text-slate-600">{priceMessage}</p>
              )}
            </div>
          </div>
        </GlassCard>
      </div>

      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-6">
              <h3 className="text-xl font-semibold text-slate-800">{t('settings.product_modal.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {t('settings.product_modal.subtitle')}
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {productsLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                </div>
              )}

              {productsError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                  <h4 className="mb-2 text-lg font-semibold text-amber-900">{t('settings.product_modal.unavailable')}</h4>
                  <p className="mb-4 text-sm text-amber-700">{productsError}</p>
                  <button onClick={loadProducts} className="glass-button-secondary">
                    {t('app.retry')}
                  </button>
                </div>
              )}

              {!productsLoading && !productsError && products.length === 0 && (
                <div className="py-12 text-center">
                  <Package className="mx-auto h-12 w-12 text-slate-300" />
                  <p className="mt-4 text-sm text-slate-500">{t('settings.product_modal.no_products')}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {t('settings.product_modal.no_products_desc')}
                  </p>
                </div>
              )}

              {!productsLoading && !productsError && products.length > 0 && (
                <div className="space-y-4">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-800">{product.name}</h4>
                          {product.description && (
                            <p className="mt-1 text-sm text-slate-600">{product.description}</p>
                          )}
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            product.active
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {product.active ? t('settings.product_modal.active') : t('settings.product_modal.inactive')}
                        </span>
                      </div>

                      {product.prices.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-500">{t('settings.product_modal.prices')}:</p>
                          {product.prices.map((price) => (
                            <label
                              key={price.id}
                              className="flex cursor-pointer items-center justify-between rounded-lg bg-white p-3 hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedPriceIds.has(price.id)}
                                  onChange={() => handleTogglePrice(price.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                />
                                <div>
                                  <p className="text-sm font-medium text-slate-700">
                                    {price.unit_amount
                                      ? `${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`
                                      : t('settings.product_modal.free')}
                                  </p>
                                  {price.recurring_interval && (
                                    <p className="text-xs text-slate-500">
                                      {t('settings.product_modal.billed')} {price.recurring_interval}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  price.active
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {price.active ? t('settings.product_modal.active') : t('settings.product_modal.inactive')}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                      {product.prices.length === 0 && (
                        <p className="text-xs text-slate-400">{t('settings.product_modal.no_prices')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  {selectedPriceIds.size} {t(
                    selectedPriceIds.size === 1
                      ? 'settings.product_modal.selected_one'
                      : 'settings.product_modal.selected_many'
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowProductModal(false)}
                    className="glass-button-secondary"
                  >
                    {t('settings.product_modal.cancel')}
                  </button>
                  <button
                    onClick={handleSaveProductSelection}
                    className="glass-button-primary"
                    disabled={selectedPriceIds.size === 0}
                  >
                    {t('settings.product_modal.save_selection')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
