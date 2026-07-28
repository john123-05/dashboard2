import { useState, useEffect, useMemo } from 'react';
import { Save, Loader2, Building2, MapPin, Mountain, Package, Bell, BellRing, Smartphone, AlertTriangle, LifeBuoy, CalendarDays, Clock3, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getOptionalSourceWarning, invokeEdgeFunction, isEdgeSourceUnavailable } from '../lib/edgeFunctions';
import { useAuth } from '../contexts/AuthContext';
import { usePark } from '../contexts/ParkContext';
import GlassCard from '../components/ui/GlassCard';
import { useI18n } from '../lib/i18n';
import {
  createDefaultOpeningHoursConfig,
  deriveLegacyOpeningHoursFromConfig,
  normalizeOpeningHoursConfig,
} from '../lib/kioskSales';
import type { Park, Attraction, OpeningHoursConfig, ScheduleException, SchedulePause, WeekdayKey } from '../lib/types';
import { invokeSharedEdgeFunction } from '../lib/sharedEdgeFunctions';
import {
  getCurrentOperatorPushSubscription,
  isOperatorPushSupported,
  sendOperatorTestPush,
  subscribeOperatorPush,
  syncOperatorPushSubscription,
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

const WEEKDAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
};

function createEmptyPause(): SchedulePause {
  return { start: '12:00', end: '13:00' };
}

function createException(type: ScheduleException['type']): ScheduleException {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    type,
    label: type === 'holiday' ? 'Feiertag' : type === 'vacation' ? 'Urlaub' : 'Sonderöffnung',
    start_date: today,
    end_date: today,
    is_closed: type !== 'special_hours',
    open: type === 'special_hours' ? '10:00' : null,
    close: type === 'special_hours' ? '16:00' : null,
    pauses: [],
  };
}

function normalizeNotificationErrorMessage(message: string | null): string | null {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes('invalid jwt')) return null;
  return message;
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
  const [scheduleConfig, setScheduleConfig] = useState<OpeningHoursConfig>(createDefaultOpeningHoursConfig(null));
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
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
  const selectedPark = parkId ? parks.find((p) => p.id === parkId) : parks[0];
  const parksToRender = selectedPark ? [selectedPark] : parks;

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
        setNotificationMessage(normalizeNotificationErrorMessage(error || t('settings.notifications.load_error')));
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
      if (subscription && selectedPark?.id) {
        await syncOperatorPushSubscription(selectedPark.id).catch((error) => {
          if (!cancelled) {
            setPushError(error instanceof Error ? error.message : t('settings.notifications.device_error'));
          }
        });
      }
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
        timezone: p.timezone ?? 'Europe/Vienna',
        price_per_photo_cents: p.price_per_photo_cents ?? null,
        opening_hours: p.opening_hours ?? null,
        opening_hours_config: p.opening_hours_config ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        attractions: attractionsByPark.get(p.id) || [],
      }))
    );
    setLoading(false);
  }

  function patchNotificationSettings(patch: Partial<OperatorNotificationSettings>) {
    setNotificationSettings((current) => ({
      ...current,
      ...patch,
    }));
  }

  useEffect(() => {
    setPhotoPriceInput(formatEuroInputFromCents(selectedPark?.price_per_photo_cents ?? null));
    setPriceMessage(null);
  }, [selectedPark?.id, selectedPark?.price_per_photo_cents]);

  useEffect(() => {
    setScheduleConfig(
      normalizeOpeningHoursConfig(
        selectedPark?.opening_hours_config ?? null,
        selectedPark?.opening_hours ?? null,
      ),
    );
    setScheduleMessage(null);
  }, [selectedPark?.id, selectedPark?.opening_hours, selectedPark?.opening_hours_config]);

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
      setNotificationMessage(normalizeNotificationErrorMessage(error));
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

  function updateWeekday<K extends keyof OpeningHoursConfig['weekdays'][WeekdayKey]>(
    dayKey: WeekdayKey,
    field: K,
    value: OpeningHoursConfig['weekdays'][WeekdayKey][K],
  ) {
    setScheduleConfig((current) => ({
      ...current,
      weekdays: {
        ...current.weekdays,
        [dayKey]: {
          ...current.weekdays[dayKey],
          [field]: value,
        },
      },
    }));
  }

  function addPause(dayKey: WeekdayKey) {
    setScheduleConfig((current) => ({
      ...current,
      weekdays: {
        ...current.weekdays,
        [dayKey]: {
          ...current.weekdays[dayKey],
          pauses: [...current.weekdays[dayKey].pauses, createEmptyPause()],
        },
      },
    }));
  }

  function updatePause(dayKey: WeekdayKey, pauseIndex: number, field: keyof SchedulePause, value: string) {
    setScheduleConfig((current) => ({
      ...current,
      weekdays: {
        ...current.weekdays,
        [dayKey]: {
          ...current.weekdays[dayKey],
          pauses: current.weekdays[dayKey].pauses.map((pause, index) =>
            index === pauseIndex ? { ...pause, [field]: value } : pause,
          ),
        },
      },
    }));
  }

  function removePause(dayKey: WeekdayKey, pauseIndex: number) {
    setScheduleConfig((current) => ({
      ...current,
      weekdays: {
        ...current.weekdays,
        [dayKey]: {
          ...current.weekdays[dayKey],
          pauses: current.weekdays[dayKey].pauses.filter((_, index) => index !== pauseIndex),
        },
      },
    }));
  }

  function addScheduleException(type: ScheduleException['type']) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: [...current.exceptions, createException(type)],
    }));
  }

  function updateScheduleException(
    exceptionId: string,
    patch: Partial<ScheduleException>,
  ) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: current.exceptions.map((entry) => (entry.id === exceptionId ? { ...entry, ...patch } : entry)),
    }));
  }

  function addExceptionPause(exceptionId: string) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: current.exceptions.map((entry) =>
        entry.id === exceptionId
          ? { ...entry, pauses: [...entry.pauses, createEmptyPause()] }
          : entry,
      ),
    }));
  }

  function updateExceptionPause(
    exceptionId: string,
    pauseIndex: number,
    field: keyof SchedulePause,
    value: string,
  ) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: current.exceptions.map((entry) =>
        entry.id === exceptionId
          ? {
              ...entry,
              pauses: entry.pauses.map((pause, index) =>
                index === pauseIndex ? { ...pause, [field]: value } : pause,
              ),
            }
          : entry,
      ),
    }));
  }

  function removeExceptionPause(exceptionId: string, pauseIndex: number) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: current.exceptions.map((entry) =>
        entry.id === exceptionId
          ? { ...entry, pauses: entry.pauses.filter((_, index) => index !== pauseIndex) }
          : entry,
      ),
    }));
  }

  function removeScheduleException(exceptionId: string) {
    setScheduleConfig((current) => ({
      ...current,
      exceptions: current.exceptions.filter((entry) => entry.id !== exceptionId),
    }));
  }

  async function handleSaveOpeningHours() {
    if (!selectedPark) return;

    setScheduleSaving(true);
    setScheduleMessage(null);

    const payload = {
      ...scheduleConfig,
      exceptions: scheduleConfig.exceptions
        .slice()
        .sort((left, right) => left.start_date.localeCompare(right.start_date)),
    };

    const { data, error } = await invokeSharedEdgeFunction<{
      opening_hours: Park['opening_hours'];
      opening_hours_config: OpeningHoursConfig;
    }>('operator-park-schedule', {
      method: 'POST',
      body: {
        park_id: selectedPark.id,
        opening_hours_config: payload,
      },
    });

    if (error) {
      setScheduleMessage(error);
      setScheduleSaving(false);
      return;
    }

    const nextConfig = normalizeOpeningHoursConfig(
      data?.opening_hours_config ?? payload,
      data?.opening_hours ?? deriveLegacyOpeningHoursFromConfig(payload),
    );

    setScheduleConfig(nextConfig);
    await loadData();
    refreshKioskState();
    setScheduleSaving(false);
    setScheduleMessage('Öffnungszeiten gespeichert. Umsatzansicht und Benachrichtigungen nutzen jetzt diese Zeiten.');
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

        <GlassCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{t('settings.kiosk_price.title')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('settings.kiosk_price.desc')}</p>
            </div>
            <div className="rounded-xl bg-white/30 px-3 py-2.5">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{t('settings.kiosk_price.current')}</p>
              <p className="mt-1 text-base font-semibold text-slate-800">
                {selectedPark?.price_per_photo_cents != null
                  ? `${formatEuroInputFromCents(selectedPark.price_per_photo_cents)} €`
                  : t('settings.kiosk_price.not_set')}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
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
              <div className="mt-3 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleSaveKioskPrice('future')}
                  disabled={!selectedPark || priceSavingMode !== null}
                  className="glass-button-primary px-4 py-2"
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
                  className="glass-button-secondary px-4 py-2"
                >
                  {priceSavingMode === 'retroactive' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('settings.kiosk_price.retroactive')}
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-medium text-slate-700">{t('settings.kiosk_price.future')}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{t('settings.kiosk_price.future_desc')}</p>
                </div>
                <div className="rounded-xl bg-amber-50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900">{t('settings.kiosk_price.retroactive')}</p>
                  <p className="mt-1 text-xs leading-5 text-amber-700">{t('settings.kiosk_price.retroactive_desc')}</p>
                </div>
              </div>
              {priceMessage && <p className="mt-4 text-sm text-slate-600">{priceMessage}</p>}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="self-start p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">{t('settings.notifications.title')}</h3>
            </div>
            <div className="rounded-2xl bg-white/30 px-3 py-2.5">
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

          <div className="mt-4 rounded-2xl bg-white/30 p-4">
            {notificationLoading ? (
              <div className="flex items-center gap-3 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('settings.notifications.loading')}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Dieses Gerat</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {pushSubscribed
                          ? t('settings.notifications.device_on')
                          : t('settings.notifications.device_off')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSubscribed}
                      disabled={!pushSupported || pushBusy || pushChecking}
                      onChange={(event) => void handleTogglePushDevice(event.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.master')}</p>
                      <p className="mt-1 text-xs text-slate-500">Parkweite Alerts aktivieren</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationSettings.push_enabled}
                      onChange={(event) => patchNotificationSettings({ push_enabled: event.target.checked })}
                      className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.inactivity')}</p>
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
                      className="glass-input mt-2 py-2.5"
                    />
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.paper')}</p>
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
                      className="glass-input mt-2 py-2.5"
                    />
                  </div>

                  <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <LifeBuoy className="mt-0.5 h-4 w-4 text-slate-500" />
                      <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.support')}</p>
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
                      <p className="text-sm font-semibold text-slate-800">{t('settings.notifications.health')}</p>
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

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap gap-2">
                    {pushSupported && pushSubscribed && (
                      <button
                        type="button"
                        onClick={() => void handleSendTestPush()}
                        disabled={pushTestBusy}
                        className="glass-button-secondary px-4 py-2"
                      >
                        {pushTestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                        {t('settings.notifications.test')}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveNotificationSettings()}
                    disabled={notificationSaving}
                    className="glass-button-primary px-4 py-2"
                  >
                    {notificationSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                    {t('settings.notifications.save')}
                  </button>
                </div>

                {(pushError || notificationMessage) && (
                  <p className={`text-sm ${(pushError && pushError !== t('settings.notifications.test_sent')) ? 'text-rose-700' : 'text-slate-600'}`}>
                    {pushError || notificationMessage}
                  </p>
                )}
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6 xl:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Öffnungszeiten & Saison</h3>
              <p className="mt-1 text-sm text-slate-500">
                Kompakt wie im Business-Profil: Wochenzeiten oben, Sonderzeiten nur bei Bedarf darunter.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl bg-white/30 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Zeitzone</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedPark?.timezone || 'Europe/Vienna'}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveOpeningHours()}
                disabled={scheduleSaving || !selectedPark}
                className="glass-button-primary"
              >
                {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                Öffnungszeiten speichern
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-2xl bg-white/30 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-brand-600" />
                <p className="text-sm font-semibold text-slate-800">Wochenzeiten</p>
              </div>
              <div className="space-y-2">
                {WEEKDAY_ORDER.map((dayKey) => {
                  const day = scheduleConfig.weekdays[dayKey];
                  return (
                    <div key={dayKey} className="rounded-xl bg-slate-50 p-3">
                      <div className="grid gap-3 xl:grid-cols-[120px_136px_132px_132px_auto] xl:items-center">
                        <p className="text-sm font-semibold text-slate-800">{WEEKDAY_LABELS[dayKey]}</p>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <input
                            type="checkbox"
                            checked={!day.enabled}
                            onChange={(e) => updateWeekday(dayKey, 'enabled', !e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Geschlossen
                        </label>
                        <input
                          type="time"
                          value={day.open}
                          onChange={(e) => updateWeekday(dayKey, 'open', e.target.value)}
                          disabled={!day.enabled}
                          className="glass-input"
                        />
                        <input
                          type="time"
                          value={day.close}
                          onChange={(e) => updateWeekday(dayKey, 'close', e.target.value)}
                          disabled={!day.enabled}
                          className="glass-input"
                        />
                        <button
                          type="button"
                          onClick={() => addPause(dayKey)}
                          disabled={!day.enabled}
                          className="glass-button-secondary justify-self-start px-3 py-2 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Pause
                        </button>
                      </div>

                      {day.pauses.length > 0 && (
                        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                          {day.pauses.map((pause, index) => (
                            <div key={`${dayKey}-${index}`} className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[minmax(0,132px)_minmax(0,132px)_auto]">
                              <input
                                type="time"
                                value={pause.start}
                                onChange={(e) => updatePause(dayKey, index, 'start', e.target.value)}
                                className="glass-input"
                              />
                              <input
                                type="time"
                                value={pause.end}
                                onChange={(e) => updatePause(dayKey, index, 'end', e.target.value)}
                                className="glass-input"
                              />
                              <button
                                type="button"
                                onClick={() => removePause(dayKey, index)}
                                className="glass-button-secondary justify-self-start px-3 py-2 text-xs"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Entfernen
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-slate-200/70 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
              <div className="space-y-3">
                <div className="rounded-2xl bg-white/30 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-brand-600" />
                    <p className="text-sm font-semibold text-slate-800">Saison</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Saisonstart</label>
                      <input
                        type="date"
                        value={scheduleConfig.season_start ?? ''}
                        onChange={(e) => setScheduleConfig((current) => ({ ...current, season_start: e.target.value || null }))}
                        className="glass-input"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Saisonende</label>
                      <input
                        type="date"
                        value={scheduleConfig.season_end ?? ''}
                        onChange={(e) => setScheduleConfig((current) => ({ ...current, season_end: e.target.value || null }))}
                        className="glass-input"
                      />
                    </div>
                  </div>
                </div>

                {(['holiday', 'vacation', 'special_hours'] as const).map((type) => {
              const title =
                type === 'holiday'
                  ? 'Feiertage'
                  : type === 'vacation'
                    ? 'Urlaubszeiten / Schließtage'
                    : 'Sonderöffnungen';
              const buttonLabel =
                type === 'holiday'
                  ? 'Feiertag hinzufügen'
                  : type === 'vacation'
                    ? 'Zeit hinzufügen'
                    : 'Sonderöffnung hinzufügen';
              const items = scheduleConfig.exceptions.filter((entry) => entry.type === type);

              return (
                <details key={type} className="rounded-2xl bg-white/30 p-4" open={items.length > 0}>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{title}</p>
                      <p className="text-xs text-slate-500">
                        {items.length > 0 ? `${items.length} Einträge` : 'Noch nichts eingetragen'}
                      </p>
                    </div>
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Bearbeiten</span>
                  </summary>

                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => addScheduleException(type)}
                      className="glass-button-secondary px-3 py-2 text-xs"
                    >
                      <Plus className="h-4 w-4" />
                      {buttonLabel}
                    </button>

                    {items.map((entry) => (
                      <div key={entry.id} className="rounded-xl bg-slate-50 p-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <input
                            type="text"
                            value={entry.label}
                            onChange={(e) => updateScheduleException(entry.id, { label: e.target.value })}
                            placeholder="Bezeichnung"
                            className="glass-input"
                          />
                          <label className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={entry.is_closed}
                              onChange={(e) =>
                                updateScheduleException(entry.id, {
                                  is_closed: e.target.checked,
                                  open: e.target.checked ? null : entry.open ?? '10:00',
                                  close: e.target.checked ? null : entry.close ?? '16:00',
                                })
                              }
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            Geschlossen
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <input
                            type="date"
                            value={entry.start_date}
                            onChange={(e) => updateScheduleException(entry.id, { start_date: e.target.value })}
                            className="glass-input"
                          />
                          <input
                            type="date"
                            value={entry.end_date}
                            onChange={(e) => updateScheduleException(entry.id, { end_date: e.target.value })}
                            className="glass-input"
                          />
                        </div>

                        {!entry.is_closed && (
                          <>
                            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <input
                                type="time"
                                value={entry.open ?? '10:00'}
                                onChange={(e) => updateScheduleException(entry.id, { open: e.target.value })}
                                className="glass-input"
                              />
                              <input
                                type="time"
                                value={entry.close ?? '16:00'}
                                onChange={(e) => updateScheduleException(entry.id, { close: e.target.value })}
                                className="glass-input"
                              />
                              <button
                                type="button"
                                onClick={() => addExceptionPause(entry.id)}
                                className="glass-button-secondary justify-self-start px-3 py-2 text-xs"
                              >
                                <Plus className="h-4 w-4" />
                                Pause
                              </button>
                            </div>

                            {entry.pauses.length > 0 && (
                              <div className="mt-3 space-y-2">
                                {entry.pauses.map((pause, pauseIndex) => (
                                  <div key={`${entry.id}-${pauseIndex}`} className="grid gap-3 rounded-xl bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                                    <input
                                      type="time"
                                      value={pause.start}
                                      onChange={(e) => updateExceptionPause(entry.id, pauseIndex, 'start', e.target.value)}
                                      className="glass-input"
                                    />
                                    <input
                                      type="time"
                                      value={pause.end}
                                      onChange={(e) => updateExceptionPause(entry.id, pauseIndex, 'end', e.target.value)}
                                      className="glass-input"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeExceptionPause(entry.id, pauseIndex)}
                                      className="glass-button-secondary justify-self-start px-3 py-2 text-xs"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Entfernen
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeScheduleException(entry.id)}
                            className="glass-button-secondary px-3 py-2 text-xs"
                          >
                            <Trash2 className="h-4 w-4" />
                            Eintrag löschen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
              </div>
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-500">
            Die Wochenzeiten werden automatisch als Basis für Umsatzdiagramme und Push-Alerts übernommen.
          </div>

          {scheduleMessage && <p className="mt-3 text-sm text-slate-600">{scheduleMessage}</p>}
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
