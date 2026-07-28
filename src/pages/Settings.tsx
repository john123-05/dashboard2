import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Building2, MapPin, Mountain, Package, Bell, BellRing, Smartphone, AlertTriangle, LifeBuoy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';
import type { Park, Attraction } from '../lib/types';
import { invokeSharedEdgeFunction } from '../lib/sharedEdgeFunctions';
import {
  getCurrentOperatorPushSubscription,
  isOperatorPushSupported,
  sendOperatorTestPush,
  subscribeOperatorPush,
  unsubscribeOperatorPush,
} from '../lib/operatorPushNotifications';

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

interface OperatorNotificationSettings {
  push_enabled: boolean;
  photo_inactivity_enabled: boolean;
  photo_inactivity_minutes: number;
  paper_low_enabled: boolean;
  paper_low_threshold: number;
  support_enabled: boolean;
  system_health_enabled: boolean;
}

const DEFAULT_OPERATOR_NOTIFICATION_SETTINGS: OperatorNotificationSettings = {
  push_enabled: false,
  photo_inactivity_enabled: true,
  photo_inactivity_minutes: 30,
  paper_low_enabled: true,
  paper_low_threshold: 20,
  support_enabled: true,
  system_health_enabled: true,
};
export default function Settings() {
  const { profile, currentOrg, memberships, refreshProfile } = useAuth();
  const { parkId, parkName } = usePark();
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
  const pushSupported = useMemo(() => isOperatorPushSupported(), []);
  const [notificationSettings, setNotificationSettings] = useState<OperatorNotificationSettings>(
    DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
  );
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushChecking, setPushChecking] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);

  useEffect(() => {
    loadData();
  }, [parkId]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSettings() {
      if (!selectedPark?.id) {
        if (!cancelled) {
          setNotificationSettings(DEFAULT_OPERATOR_NOTIFICATION_SETTINGS);
          setNotificationLoading(false);
        }
        return;
      }

      setNotificationLoading(true);
      const { data, error } = await invokeSharedEdgeFunction<{ settings: OperatorNotificationSettings }>(
        'operator-notification-settings',
        { query: { park_id: selectedPark.id } },
      );

      if (cancelled) return;

      if (error || !data?.settings) {
        setNotificationMessage(error || t('settings.notifications.load_error'));
        setNotificationSettings(DEFAULT_OPERATOR_NOTIFICATION_SETTINGS);
      } else {
        setNotificationMessage(null);
        setNotificationSettings({
          ...DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
          ...data.settings,
        });
      }
      setNotificationLoading(false);
    }

    void loadNotificationSettings();

    return () => {
      cancelled = true;
    };
  }, [selectedPark?.id, t]);

  useEffect(() => {
    let cancelled = false;

    async function checkPushState() {
      if (!pushSupported) {
        if (!cancelled) {
          setPushSubscribed(false);
          setPushChecking(false);
        }
        return;
      }

      setPushChecking(true);
      const subscription = await getCurrentOperatorPushSubscription().catch(() => null);
      if (!cancelled) {
        setPushSubscribed(Boolean(subscription));
        setPushChecking(false);
      }
    }

    void checkPushState();

    return () => {
      cancelled = true;
    };
  }, [pushSupported, selectedPark?.id]);

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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attractions: attractionsByPark.get(p.id) || [],
      }))
    );
    setLoading(false);
  }

  const selectedPark = parkId ? parks.find((p) => p.id === parkId) : parks[0];
  const parksToRender = selectedPark ? [selectedPark] : parks;

  function patchNotificationSettings(patch: Partial<OperatorNotificationSettings>) {
    setNotificationSettings((current) => ({
      ...current,
      ...patch,
    }));
  }

  async function handleSaveNotificationSettings() {
    if (!selectedPark?.id) return;

    setNotificationSaving(true);
    setNotificationMessage(null);

    const payload = {
      park_id: selectedPark.id,
      ...notificationSettings,
      photo_inactivity_minutes: Math.min(240, Math.max(5, Math.round(notificationSettings.photo_inactivity_minutes))),
      paper_low_threshold: Math.min(500, Math.max(1, Math.round(notificationSettings.paper_low_threshold))),
    };

    const { data, error } = await invokeSharedEdgeFunction<{ settings: OperatorNotificationSettings }>(
      'operator-notification-settings',
      {
        method: 'POST',
        body: payload,
      },
    );

    if (error) {
      setNotificationMessage(error);
      setNotificationSaving(false);
      return;
    }

    setNotificationSettings({
      ...DEFAULT_OPERATOR_NOTIFICATION_SETTINGS,
      ...(data?.settings ?? payload),
    });
    setNotificationSaving(false);
    setNotificationMessage(t('settings.notifications.saved'));
  }

  async function handleTogglePushDevice(enabled: boolean) {
    if (!selectedPark?.id) return;

    setPushBusy(true);
    setPushError(null);

    try {
      if (enabled) {
        await subscribeOperatorPush(selectedPark.id);
        setPushSubscribed(true);
      } else {
        await unsubscribeOperatorPush(selectedPark.id);
        setPushSubscribed(false);
      }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : t('settings.notifications.device_error'));
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSendTestPush() {
    if (!selectedPark?.id) return;
    setPushTestBusy(true);
    setPushError(null);

    try {
      await sendOperatorTestPush(selectedPark.id);
      setPushError(t('settings.notifications.test_sent'));
    } catch (error) {
      setPushError(error instanceof Error ? error.message : t('settings.notifications.test_error'));
    } finally {
      setPushTestBusy(false);
    }
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

        <GlassCard className="p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{t('settings.notifications.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('settings.notifications.desc')}</p>
            </div>
            <div className="rounded-2xl bg-white/30 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                {t('settings.notifications.active_device')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {pushSupported
                  ? pushSubscribed
                    ? t('settings.notifications.device_on')
                    : t('settings.notifications.device_off')
                  : t('settings.notifications.unsupported')}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,300px)_1fr]">
            <div className="rounded-2xl bg-white/30 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-brand-50 p-3">
                  <BellRing className="h-5 w-5 text-brand-600" />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.device_title')}</p>
                    <p className="mt-1 text-sm text-slate-500">{t('settings.notifications.device_desc')}</p>
                  </div>

                  {!pushSupported && (
                    <p className="text-sm text-amber-700">{t('settings.notifications.unsupported_desc')}</p>
                  )}

                  {pushSupported && !pushChecking && (
                    <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {pushSubscribed
                            ? t('settings.notifications.device_on')
                            : t('settings.notifications.device_off')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.device_scope')}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={pushSubscribed}
                        disabled={pushBusy}
                        onChange={(event) => void handleTogglePushDevice(event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </label>
                  )}

                  {pushSupported && pushSubscribed && (
                    <button
                      type="button"
                      onClick={() => void handleSendTestPush()}
                      disabled={pushTestBusy}
                      className="glass-button-secondary"
                    >
                      {pushTestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      {t('settings.notifications.test')}
                    </button>
                  )}

                  {pushError && (
                    <p className={`text-sm ${pushError === t('settings.notifications.test_sent') ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {pushError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white/30 p-4">
              {notificationLoading ? (
                <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('settings.notifications.loading')}
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.master')}</p>
                      <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.master_desc')}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.push_enabled}
                      onChange={(event) => patchNotificationSettings({ push_enabled: event.target.checked })}
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </label>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.inactivity')}</p>
                          <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.inactivity_desc')}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationSettings.photo_inactivity_enabled}
                          onChange={(event) =>
                            patchNotificationSettings({ photo_inactivity_enabled: event.target.checked })
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </div>
                      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
                        {t('settings.notifications.minutes')}
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={notificationSettings.photo_inactivity_minutes}
                        onChange={(event) =>
                          patchNotificationSettings({
                            photo_inactivity_minutes: Number(event.target.value) || 30,
                          })
                        }
                        className="glass-input mt-2"
                      />
                    </div>

                    <div className="rounded-xl bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.paper')}</p>
                          <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.paper_desc')}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={notificationSettings.paper_low_enabled}
                          onChange={(event) =>
                            patchNotificationSettings({ paper_low_enabled: event.target.checked })
                          }
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </div>
                      <label className="mt-3 block text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
                        {t('settings.notifications.threshold')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={notificationSettings.paper_low_threshold}
                        onChange={(event) =>
                          patchNotificationSettings({
                            paper_low_threshold: Number(event.target.value) || 20,
                          })
                        }
                        className="glass-input mt-2"
                      />
                    </div>

                    <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <LifeBuoy className="mt-0.5 h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.support')}</p>
                          <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.support_desc')}</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notificationSettings.support_enabled}
                        onChange={(event) => patchNotificationSettings({ support_enabled: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-slate-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.health')}</p>
                          <p className="mt-1 text-xs text-slate-500">{t('settings.notifications.health_desc')}</p>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notificationSettings.system_health_enabled}
                        onChange={(event) =>
                          patchNotificationSettings({ system_health_enabled: event.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">{t('settings.notifications.mobile_hint')}</p>
                    <button
                      type="button"
                      onClick={() => void handleSaveNotificationSettings()}
                      disabled={notificationSaving}
                      className="glass-button-primary"
                    >
                      {notificationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                      {t('settings.notifications.save')}
                    </button>
                  </div>

                  {notificationMessage && (
                    <p className="text-sm text-slate-600">{notificationMessage}</p>
                  )}
                </div>
              )}
            </div>
          </div>
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
                  <h4 className="mb-2 text-lg font-semibold text-amber-900">
                    {t('settings.product_modal.unavailable')}
                  </h4>
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
                          {product.active
                            ? t('settings.product_modal.active')
                            : t('settings.product_modal.inactive')}
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
                                {price.active
                                  ? t('settings.product_modal.active')
                                  : t('settings.product_modal.inactive')}
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
                  {selectedPriceIds.size}{' '}
                  {selectedPriceIds.size === 1
                    ? t('settings.product_modal.selected_one')
                    : t('settings.product_modal.selected_many')}
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
