import { useState, useEffect } from 'react';
import { Save, Loader2, Building2, MapPin, Mountain, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import GlassCard from '../components/ui/GlassCard';
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

export default function Settings() {
  const { profile, currentOrg, memberships, refreshProfile } = useAuth();
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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [parksRes, attractionsRes] = await Promise.all([
      supabase.from('parks').select('*'),
      supabase.from('attractions').select('*'),
    ]);

    const attractionsByPark = new Map<string, Attraction[]>();
    ((attractionsRes.data || []) as Attraction[]).forEach((a) => {
      const list = attractionsByPark.get(a.park_id) || [];
      list.push(a);
      attractionsByPark.set(a.park_id, list);
    });

    setParks(
      ((parksRes.data || []) as Park[]).map((p) => ({
        ...p,
        attractions: attractionsByPark.get(p.id) || [],
      }))
    );
    setLoading(false);
  }

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
        setProductsError(error);
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
      setProductsError(err instanceof Error ? err.message : 'Unknown error');
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
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your profile and view organization details</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Stripe Products</h3>
          <p className="mb-4 text-sm text-slate-600">
            Select which Stripe products to track in your dashboard
          </p>
          <button onClick={handleOpenProductModal} className="glass-button-primary">
            <Package className="h-4 w-4" />
            Select Products
          </button>
        </GlassCard>
        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Profile</h3>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="glass-input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="glass-input cursor-not-allowed opacity-60"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
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
                'Saved!'
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>
          </form>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="mb-4 text-base font-semibold text-slate-800">Organization</h3>
          {currentOrg ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl bg-white/30 p-4">
                <div className="rounded-xl bg-brand-100 p-3">
                  <Building2 className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{currentOrg.name}</p>
                  <p className="text-xs text-slate-500">slug: {currentOrg.slug}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-600">Parks & Attractions</p>
                {parks.map((park) => (
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
            <p className="text-sm text-slate-500">No organization assigned</p>
          )}
        </GlassCard>
      </div>

      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-200 p-6">
              <h3 className="text-xl font-semibold text-slate-800">Select Stripe Products</h3>
              <p className="mt-1 text-sm text-slate-500">
                Choose which products to track in your dashboard
              </p>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6">
              {productsLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
                </div>
              )}

              {productsError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-6">
                  <h4 className="text-lg font-semibold text-red-800 mb-2">Error Loading Products</h4>
                  <p className="text-sm text-red-600 mb-4">{productsError}</p>
                  <button onClick={loadProducts} className="glass-button-secondary">
                    Retry
                  </button>
                </div>
              )}

              {!productsLoading && !productsError && products.length === 0 && (
                <div className="py-12 text-center">
                  <Package className="mx-auto h-12 w-12 text-slate-300" />
                  <p className="mt-4 text-sm text-slate-500">No products available</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Create products in your Stripe dashboard first
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
                          {product.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {product.prices.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-500">Prices:</p>
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
                                      : 'Free'}
                                  </p>
                                  {price.recurring_interval && (
                                    <p className="text-xs text-slate-500">
                                      Billed {price.recurring_interval}
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
                                {price.active ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                      {product.prices.length === 0 && (
                        <p className="text-xs text-slate-400">No prices configured</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  {selectedPriceIds.size} price{selectedPriceIds.size !== 1 ? 's' : ''} selected
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowProductModal(false)}
                    className="glass-button-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProductSelection}
                    className="glass-button-primary"
                    disabled={selectedPriceIds.size === 0}
                  >
                    Save Selection
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
