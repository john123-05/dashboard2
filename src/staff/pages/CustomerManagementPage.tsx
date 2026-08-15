import {
  Activity,
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Euro,
  Expand,
  KeyRound,
  LifeBuoy,
  Mail,
  Monitor,
  Mountain,
  PencilLine,
  RotateCcw,
  Search,
  Trash2,
  Images,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { AuthContext, useAuth, type AuthContextType } from '../../contexts/AuthContext';
import { ParkContext, type ParkState } from '../../contexts/ParkContext';
import { fetchRecentPhotos, type BrowsablePhoto } from '../../lib/photoBrowser';
import { todayInTimezone } from '../../lib/kioskSales';
import { formatCurrency } from '../../lib/utils';
import Photos from '../../pages/Photos';
import Revenue from '../../pages/Revenue';
import SystemHealth from '../../pages/SystemHealth';
import Leads from '../../pages/Leads';
import { appendActivityEvent } from '../lib/activity-feed';
import { getApiErrorMessage } from '../lib/api-error';
import { edgeFetch } from '../lib/edge-fetch';
import {
  createStaffCredential,
  deleteStaffCredential,
  fetchStaffCredentials,
  updateStaffCredential,
  type StaffCredential,
} from '../lib/staffCredentials';
import { supabaseBrowser } from '../lib/supabase';
import type {
  Attraction,
  LiftpicMachineConfig,
  LiftpicMachineMode,
  Park,
  ParkCamera,
  ParkPathPrefix,
  SupportTicket,
} from '../lib/types';
import { useCopyToClipboard } from '../lib/useCopyToClipboard';
import CamerasPage from './CamerasPage';
import LiftpicSetupPage from './LiftpicSetupPage';
import ParksPage from './ParksPage';

type CustomerView = 'customers' | 'setup';
type LegacySetupTab = 'parks' | 'cameras' | 'liftpic';
type CustomerPanel = 'details' | 'edit';
type CustomerSection = 'revenue' | 'photos' | 'health' | 'emails' | 'access' | 'structure' | 'cameras' | 'machines' | 'support';

type CustomerPark = Park & {
  price_per_photo_cents: number | null;
  timezone: string | null;
};

type SalesRow = {
  park_id: string;
  business_date: string;
  photos_sold_count: number;
};

type LiftpicResponse = {
  parks: Park[];
  attractions: Attraction[];
  configs: LiftpicMachineConfig[];
};

type MachineQuickForm = {
  attraction_id: string;
  machine_id: string;
  machine_label: string;
  camera_code: string;
  camera_label: string;
  legacy_customer_code: string;
  mode: LiftpicMachineMode;
  shadow_mode: boolean;
};

type OperatorAccessUser = {
  membership_id: string;
  user_id: string;
  role: string;
  created_at: string;
  email: string | null;
  full_name: string | null;
  allowed_park_ids?: string[];
  is_park_scoped?: boolean;
  is_legacy_org_wide?: boolean;
};

type OperatorUserForm = {
  full_name: string;
  email: string;
  password: string;
  role: 'org_owner' | 'staff';
};

type OperatorUserDraft = {
  full_name: string;
  email: string;
  password: string;
  role: string;
};

type CredentialForm = {
  label: string;
  category: string;
  person_name: string;
  login: string;
  password: string;
  notes: string;
};

const OPERATOR_PROJECT_URL = 'https://xcrxltiiovpoladpaewd.supabase.co';
const OPERATOR_PROJECT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ';

const legacyTabs = [
  { id: 'parks', label: 'Park & Zugang', icon: Mountain },
  { id: 'cameras', label: 'Foto-Codes', icon: Camera },
  { id: 'liftpic', label: 'PCs', icon: Monitor },
] as const;

const sectionMeta: Array<{
  id: CustomerSection;
  label: string;
  panel: CustomerPanel;
  icon: typeof Activity;
}> = [
  { id: 'revenue', label: 'Umsatz', panel: 'details', icon: Euro },
  { id: 'photos', label: 'Fotos', panel: 'details', icon: Images },
  { id: 'emails', label: 'E-Mail-Liste', panel: 'details', icon: Mail },
  { id: 'health', label: 'Systemzustand', panel: 'details', icon: Activity },
  { id: 'access', label: 'Zugänge', panel: 'edit', icon: KeyRound },
  { id: 'structure', label: 'Struktur', panel: 'edit', icon: Mountain },
  { id: 'cameras', label: 'Kameras', panel: 'edit', icon: Camera },
  { id: 'machines', label: 'Liftpic PCs', panel: 'edit', icon: Monitor },
  { id: 'support', label: 'Support', panel: 'edit', icon: LifeBuoy },
];

const defaultQuickMachineForm: MachineQuickForm = {
  attraction_id: '',
  machine_id: '',
  machine_label: '',
  camera_code: 'cam1',
  camera_label: 'Kamera 1',
  legacy_customer_code: '',
  mode: 'sold_only',
  shadow_mode: true,
};

const emptyOperatorUserForm: OperatorUserForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'staff',
};

const emptyCredentialForm: CredentialForm = {
  label: '',
  category: '',
  person_name: '',
  login: '',
  password: '',
  notes: '',
};

function normalizeLegacyTab(value: string | null): LegacySetupTab {
  return legacyTabs.some((tab) => tab.id === value) ? (value as LegacySetupTab) : 'parks';
}

function normalizeView(value: string | null, legacyTabValue: string | null): CustomerView {
  if (value === 'setup' || legacyTabs.some((tab) => tab.id === legacyTabValue)) return 'setup';
  return 'customers';
}

function normalizeSection(value: string | null): CustomerSection | null {
  return sectionMeta.some((section) => section.id === value) ? (value as CustomerSection) : null;
}

function sectionPanel(section: CustomerSection | null): CustomerPanel {
  if (!section) return 'details';
  return sectionMeta.find((entry) => entry.id === section)?.panel ?? 'details';
}

function normalizePanel(value: string | null, section: CustomerSection | null): CustomerPanel {
  if (value === 'details' || value === 'edit') return value;
  return sectionPanel(section);
}

function sortParks(list: CustomerPark[]): CustomerPark[] {
  return [...list].sort((a, b) => {
    const aImst = a.name.toLowerCase().includes('imst') ? 0 : 1;
    const bImst = b.name.toLowerCase().includes('imst') ? 0 : 1;
    if (aImst !== bImst) return aImst - bImst;
    return a.name.localeCompare(b.name, 'de');
  });
}

function formatDateTime(value: string | null) {
  if (!value) return 'Noch kein Signal';
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatRelative(value: string | null) {
  if (!value) return 'Noch kein Signal';
  const diffMin = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  const diffDays = Math.round(diffHours / 24);
  return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
}

function machineHeartbeatClass(value: string | null) {
  if (!value) return '';
  const diffMin = (Date.now() - new Date(value).getTime()) / 60000;
  if (diffMin <= 10) return 'ok';
  if (diffMin <= 60) return 'warn';
  return '';
}

function machineStatusText(config: Pick<LiftpicMachineConfig, 'last_seen_at'>) {
  if (!config.last_seen_at) return 'Ohne PC-Signal';
  const diffMin = (Date.now() - new Date(config.last_seen_at).getTime()) / 60000;
  if (diffMin <= 10) return 'Online';
  if (diffMin <= 60) return 'Wackelig';
  return 'Ohne aktuelles Signal';
}

function machineModeLabel(mode: LiftpicMachineMode) {
  if (mode === 'all_photos') return 'Alle Fotos';
  if (mode === 'count_only') return 'Nur Zähler';
  return 'Nur verkaufte Fotos';
}

function machineHealthNotes(lastStatus: Record<string, unknown>) {
  const notes: string[] = [];
  const pairs: Array<[string, string]> = [
    ['paper_remaining', 'Papier'],
    ['queue_count', 'Queue'],
    ['pending_uploads', 'Uploads'],
    ['rides_today', 'Fahrten'],
    ['last_error', 'Fehler'],
  ];

  for (const [key, label] of pairs) {
    const value = lastStatus[key];
    if (typeof value === 'number' && Number.isFinite(value)) notes.push(`${label}: ${value}`);
    if (typeof value === 'string' && value.trim()) notes.push(`${label}: ${value}`);
  }

  return notes.slice(0, 3);
}

async function saveCustomerParkPassword(parkId: string, parkName: string, password: string): Promise<string | null> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const staffAccessToken = sessionData.session?.access_token;
  if (!staffAccessToken) return 'Keine Staff-Sitzung gefunden';

  const res = await fetch(`${OPERATOR_PROJECT_URL}/functions/v1/admin-set-park-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: OPERATOR_PROJECT_ANON_KEY },
    body: JSON.stringify({ staffAccessToken, park_id: parkId, park_name: parkName, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return getApiErrorMessage(body, 'Park-Passwort konnte nicht gespeichert werden');
  return null;
}

function credentialMatchesPark(park: CustomerPark, credential: StaffCredential) {
  const haystack = [
    credential.label,
    credential.category,
    credential.person_name,
    credential.login,
    credential.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(park.name.toLowerCase()) || haystack.includes(park.slug.toLowerCase());
}

function parkPasswordCredentialLabel(park: CustomerPark) {
  return `${park.name} – Park-Passwort`;
}

function operatorUserCredentialLabel(park: CustomerPark, email: string) {
  return `${park.name} – Dashboard-Zugang – ${email.toLowerCase()}`;
}

function operatorRoleLabel(role: string) {
  if (role === 'org_owner') return 'Inhaber';
  if (role === 'staff') return 'Mitarbeiter';
  if (role === 'park_manager') return 'Park-Manager';
  if (role === 'marketing') return 'Marketing';
  if (role === 'support_agent') return 'Support';
  if (role === 'platform_admin') return 'Platform';
  return role;
}

function EmbeddedOperatorPage({
  authValue,
  parkValue,
  children,
}: {
  authValue: AuthContextType;
  parkValue: ParkState;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={authValue}>
      <ParkContext.Provider value={parkValue}>
        <div className="customer-embedded-page operator-app">{children}</div>
      </ParkContext.Provider>
    </AuthContext.Provider>
  );
}

export default function CustomerManagementPage() {
  const operatorAuth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedLegacyTab = searchParams.get('setupTab') ?? searchParams.get('tab');
  const view = normalizeView(searchParams.get('view'), requestedLegacyTab);
  const legacyTab = normalizeLegacyTab(requestedLegacyTab);
  const pageTitle = 'Kunden Management';
  const expandedCustomerId = searchParams.get('customer');
  const activeSection = normalizeSection(searchParams.get('section'));
  const activePanel = normalizePanel(searchParams.get('panel'), activeSection);

  if (view === 'setup' && requestedLegacyTab === 'inquiries') {
    return <Navigate to="/staff/website-anfragen" replace />;
  }

  const [parks, setParks] = useState<CustomerPark[]>([]);
  const [prefixes, setPrefixes] = useState<ParkPathPrefix[]>([]);
  const [attractions, setAttractions] = useState<Attraction[]>([]);
  const [cameras, setCameras] = useState<ParkCamera[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [salesRows, setSalesRows] = useState<SalesRow[]>([]);
  const [configs, setConfigs] = useState<LiftpicMachineConfig[]>([]);
  const [credentials, setCredentials] = useState<StaffCredential[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<BrowsablePhoto[]>([]);
  const [latestPhotoByPark, setLatestPhotoByPark] = useState<Record<string, BrowsablePhoto | null>>({});
  const [previewPhoto, setPreviewPhoto] = useState<{ parkName: string; photo: BrowsablePhoto } | null>(null);
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [parkPassword, setParkPasswordInput] = useState('');
  const [savingParkPassword, setSavingParkPassword] = useState(false);
  const [operatorUsers, setOperatorUsers] = useState<OperatorAccessUser[]>([]);
  const [operatorUsersLoading, setOperatorUsersLoading] = useState(false);
  const [operatorUsersError, setOperatorUsersError] = useState<string | null>(null);
  const [operatorUserForm, setOperatorUserForm] = useState<OperatorUserForm>(emptyOperatorUserForm);
  const [operatorUserDrafts, setOperatorUserDrafts] = useState<Record<string, OperatorUserDraft>>({});
  const [creatingOperatorUser, setCreatingOperatorUser] = useState(false);
  const [savingOperatorUserId, setSavingOperatorUserId] = useState<string | null>(null);
  const [editingOperatorUserId, setEditingOperatorUserId] = useState<string | null>(null);
  const [showNewOperatorForm, setShowNewOperatorForm] = useState(false);
  const [showParkPasswordEditor, setShowParkPasswordEditor] = useState(false);
  const [editingCredentialId, setEditingCredentialId] = useState<string | null>(null);
  const [credentialForm, setCredentialForm] = useState<CredentialForm>(emptyCredentialForm);
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [attractionName, setAttractionName] = useState('');
  const [attractionSlug, setAttractionSlug] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [cameraCode, setCameraCode] = useState('');
  const [cameraName, setCameraName] = useState('');
  const [cameraAttractionId, setCameraAttractionId] = useState('');
  const [machineForm, setMachineForm] = useState<MachineQuickForm>(defaultQuickMachineForm);
  const { copiedId, copy } = useCopyToClipboard();

  const setView = (nextView: CustomerView) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', nextView);
    if (nextView === 'customers') {
      next.delete('tab');
      next.delete('setupTab');
    }
    setSearchParams(next, { replace: true });
  };

  const setLegacyTab = (nextTab: LegacySetupTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'setup');
    next.set('setupTab', nextTab);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };

  const openCustomer = (parkId: string, panel: CustomerPanel, section: CustomerSection) => {
    if (expandedCustomerId === parkId && activeSection === section && activePanel === panel) {
      closeCustomer();
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('view', 'customers');
    next.set('customer', parkId);
    next.set('panel', panel);
    next.set('section', section);
    next.delete('tab');
    next.delete('setupTab');
    setSearchParams(next, { replace: true });
  };

  const closeCustomer = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('customer');
    next.delete('panel');
    next.delete('section');
    setSearchParams(next, { replace: true });
  };

  const setSection = (section: CustomerSection) => {
    if (!expandedCustomerId) return;

    if (activeSection === section) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('customer', expandedCustomerId);
    next.set('panel', sectionPanel(section));
    next.set('section', section);
    next.set('view', 'customers');
    setSearchParams(next, { replace: true });
  };

  async function getStaffAccessToken() {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token || null;
  }

  async function callOperatorUsersAdmin(body: Record<string, unknown>) {
    const staffAccessToken = await getStaffAccessToken();
    if (!staffAccessToken) {
      throw new Error('Keine Staff-Sitzung gefunden.');
    }

    const response = await fetch(`${OPERATOR_PROJECT_URL}/functions/v1/admin-operator-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: OPERATOR_PROJECT_ANON_KEY,
        Authorization: `Bearer ${staffAccessToken}`,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload, 'Operator-Zugänge konnten nicht verarbeitet werden.'));
    }

    return payload as { users?: OperatorAccessUser[]; ok?: boolean };
  }

  const loadOperatorUsersForPark = useCallback(async (parkId: string) => {
    setOperatorUsersLoading(true);
    setOperatorUsersError(null);

    try {
      const payload = await callOperatorUsersAdmin({ action: 'list', park_id: parkId });
      const rows = payload.users || [];
      setOperatorUsers(rows);
      setOperatorUserDrafts(
        Object.fromEntries(
          rows.map((user) => [
            user.user_id,
            {
              full_name: user.full_name || '',
              email: user.email || '',
              password: '',
              role: user.role,
            },
          ]),
        ),
      );
    } catch (loadError) {
      setOperatorUsers([]);
      setOperatorUsersError(loadError instanceof Error ? loadError.message : 'Operator-Zugänge konnten nicht geladen werden.');
    } finally {
      setOperatorUsersLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [
        parksResult,
        prefixesResult,
        attractionsResult,
        camerasResult,
        ticketsResult,
        salesResult,
        configsRes,
        credentialRows,
      ] = await Promise.all([
        supabaseBrowser
          .from('parks')
          .select('id, slug, name, is_active, price_per_photo_cents, timezone')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabaseBrowser
          .from('park_path_prefixes')
          .select('id, park_id, path_prefix, is_active')
          .order('path_prefix', { ascending: true }),
        supabaseBrowser
          .from('attractions')
          .select('id, park_id, slug, name, is_active')
          .order('name', { ascending: true }),
        supabaseBrowser
          .from('park_cameras')
          .select('id, park_id, customer_code, camera_name, attraction_id, is_active')
          .order('customer_code', { ascending: true }),
        supabaseBrowser
          .from('support_tickets')
          .select('id, organization_id, created_by, subject, description, status, priority, created_at, updated_at')
          .in('status', ['open', 'in_progress'])
          .order('created_at', { ascending: false }),
        supabaseBrowser
          .from('park_photo_sales_daily')
          .select('park_id, business_date, photos_sold_count')
          .gte('business_date', sinceDate),
        edgeFetch('/api/admin/liftpic-machines'),
        fetchStaffCredentials(),
      ]);

      if (parksResult.error) throw parksResult.error;
      if (prefixesResult.error) throw prefixesResult.error;
      if (attractionsResult.error) throw attractionsResult.error;
      if (camerasResult.error) throw camerasResult.error;
      if (ticketsResult.error) throw ticketsResult.error;
      if (salesResult.error) throw salesResult.error;

      const configsBody = await configsRes.json().catch(() => null);
      if (!configsRes.ok) {
        throw new Error(getApiErrorMessage(configsBody, 'Liftpic-Daten konnten nicht geladen werden'));
      }

      const nextParks = sortParks((parksResult.data || []) as CustomerPark[]);
      const nextConfigs = (((configsBody?.data || {}) as LiftpicResponse).configs || []).filter((item) => item.is_active);

      setParks(nextParks);
      setPrefixes((prefixesResult.data || []) as ParkPathPrefix[]);
      setAttractions((attractionsResult.data || []) as Attraction[]);
      setCameras((camerasResult.data || []) as ParkCamera[]);
      setTickets((ticketsResult.data || []) as SupportTicket[]);
      setSalesRows((salesResult.data || []) as SalesRow[]);
      setConfigs(nextConfigs);
      setCredentials(credentialRows);

    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Kundendaten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expandedPark = useMemo(
    () => parks.find((park) => park.id === expandedCustomerId) ?? null,
    [parks, expandedCustomerId],
  );

  useEffect(() => {
    if (!expandedPark || view !== 'customers') {
      setRecentPhotos([]);
      return;
    }

    setPhotosLoading(true);
    fetchRecentPhotos(expandedPark.id, 8)
      .then((photos) => setRecentPhotos(photos))
      .catch(() => setRecentPhotos([]))
      .finally(() => setPhotosLoading(false));
  }, [expandedPark, view]);

  useEffect(() => {
    if (!parks.length || view !== 'customers') {
      setLatestPhotoByPark({});
      return;
    }

    let cancelled = false;

    (async () => {
      const entries = await Promise.all(
        parks.map(async (park) => {
          try {
            const photo = (await fetchRecentPhotos(park.id, 1))[0] || null;
            return [park.id, photo] as const;
          } catch {
            return [park.id, null] as const;
          }
        }),
      );

      if (!cancelled) {
        setLatestPhotoByPark(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parks, view]);

  useEffect(() => {
    if (!previewPhoto) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreviewPhoto(null);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewPhoto]);

  useEffect(() => {
    setParkPasswordInput('');
    setOperatorUsers([]);
    setOperatorUsersError(null);
    setOperatorUserForm(emptyOperatorUserForm);
    setOperatorUserDrafts({});
    setEditingOperatorUserId(null);
    setShowNewOperatorForm(false);
    setShowParkPasswordEditor(false);
    setEditingCredentialId(null);
    setCredentialForm(emptyCredentialForm);
    setShowCredentialForm(false);
    setAttractionName('');
    setAttractionSlug('');
    setPathPrefix('');
    setCameraCode('');
    setCameraName('');
    setCameraAttractionId('');
    setMachineForm(defaultQuickMachineForm);
  }, [expandedPark?.id]);

  useEffect(() => {
    if (!expandedPark) return;

    let cancelled = false;
    loadOperatorUsersForPark(expandedPark.id)
      .then(() => {
        if (cancelled) return;
      })
      .catch((loadError) => {
        if (cancelled) return;
        setOperatorUsersError(loadError instanceof Error ? loadError.message : 'Operator-Zugänge konnten nicht geladen werden.');
      });

    return () => {
      cancelled = true;
    };
  }, [expandedPark?.id, loadOperatorUsersForPark]);

  const filteredParks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parks;
    return parks.filter((park) => [park.name, park.slug].some((value) => value.toLowerCase().includes(q)));
  }, [parks, search]);

  const attractionsByPark = useMemo(() => {
    const map = new Map<string, Attraction[]>();
    for (const attraction of attractions) {
      const current = map.get(attraction.park_id) || [];
      current.push(attraction);
      map.set(attraction.park_id, current);
    }
    return map;
  }, [attractions]);

  const prefixesByPark = useMemo(() => {
    const map = new Map<string, ParkPathPrefix[]>();
    for (const prefix of prefixes) {
      const current = map.get(prefix.park_id) || [];
      current.push(prefix);
      map.set(prefix.park_id, current);
    }
    return map;
  }, [prefixes]);

  const camerasByPark = useMemo(() => {
    const map = new Map<string, ParkCamera[]>();
    for (const camera of cameras) {
      const current = map.get(camera.park_id) || [];
      current.push(camera);
      map.set(camera.park_id, current);
    }
    return map;
  }, [cameras]);

  const configsByPark = useMemo(() => {
    const map = new Map<string, LiftpicMachineConfig[]>();
    for (const config of configs) {
      const current = map.get(config.park_id) || [];
      current.push(config);
      map.set(config.park_id, current);
    }
    return map;
  }, [configs]);

  const ticketsByPark = useMemo(() => {
    const map = new Map<string, SupportTicket[]>();
    for (const ticket of tickets) {
      const current = map.get(ticket.organization_id) || [];
      current.push(ticket);
      map.set(ticket.organization_id, current);
    }
    return map;
  }, [tickets]);

  const salesTodayByPark = useMemo(() => {
    const map = new Map<string, number>();

    for (const park of parks) {
      const today = park.timezone ? todayInTimezone(park.timezone) : new Date().toISOString().slice(0, 10);
      const count = salesRows
        .filter((row) => row.park_id === park.id && row.business_date === today)
        .reduce((sum, row) => sum + row.photos_sold_count, 0);
      map.set(park.id, count);
    }

    return map;
  }, [parks, salesRows]);

  const expandedAttractions = expandedPark ? attractionsByPark.get(expandedPark.id) || [] : [];
  const expandedPrefixes = expandedPark ? prefixesByPark.get(expandedPark.id) || [] : [];
  const expandedCameras = expandedPark ? camerasByPark.get(expandedPark.id) || [] : [];
  const expandedConfigs = expandedPark ? configsByPark.get(expandedPark.id) || [] : [];
  const expandedTickets = expandedPark ? ticketsByPark.get(expandedPark.id) || [] : [];
  const expandedCredentials = expandedPark ? credentials.filter((credential) => credentialMatchesPark(expandedPark, credential)) : [];
  const parkPasswordCredential =
    expandedPark
      ? expandedCredentials.find(
          (credential) =>
            credential.category === 'Park-Passwort' || credential.label.trim().toLowerCase() === parkPasswordCredentialLabel(expandedPark).toLowerCase(),
        ) || null
      : null;
  const operatorCredentialEmails = useMemo(
    () => new Set(operatorUsers.map((user) => (user.email || '').trim().toLowerCase()).filter(Boolean)),
    [operatorUsers],
  );
  const genericCredentials = useMemo(
    () =>
      expandedCredentials.filter((credential) => {
        if (parkPasswordCredential && credential.id === parkPasswordCredential.id) return false;
        if (credential.category === 'Dashboard-Zugang' && operatorCredentialEmails.has((credential.login || '').trim().toLowerCase())) {
          return false;
        }
        return true;
      }),
    [expandedCredentials, operatorCredentialEmails, parkPasswordCredential],
  );
  const attractionNameById = useMemo(
    () => new Map(expandedAttractions.map((attraction) => [attraction.id, attraction.name])),
    [expandedAttractions],
  );

  const expandedSalesToday = expandedPark ? salesTodayByPark.get(expandedPark.id) || 0 : 0;
  const expandedRevenueToday =
    expandedPark && expandedPark.price_per_photo_cents != null
      ? expandedSalesToday * expandedPark.price_per_photo_cents
      : null;
  const expandedLastSeen =
    expandedConfigs
      .map((config) => config.last_seen_at)
      .filter(Boolean)
      .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] ?? null;

  const embeddedAuthValue = useMemo<AuthContextType>(
    () => ({
      ...operatorAuth,
      hasOrg: true,
      isStaff: false,
      isOwner: true,
      role: 'org_owner',
    }),
    [operatorAuth],
  );

  const embeddedParkValue = useMemo<ParkState>(
    () => ({
      parkId: expandedPark?.id ?? null,
      parkName: expandedPark?.name ?? null,
      setPark: () => undefined,
      refreshKioskState: () => undefined,
      isKioskPark: expandedPark?.price_per_photo_cents != null,
      kioskPriceCents: expandedPark?.price_per_photo_cents ?? null,
      kioskTimezone: expandedPark?.timezone || 'Europe/Vienna',
      kioskOpeningHours: null,
      kioskOpeningHoursConfig: null,
      kioskCheckLoading: false,
    }),
    [expandedPark],
  );

  function sectionSummary(section: CustomerSection) {
    if (!expandedPark) return '';
    if (section === 'revenue') return expandedRevenueToday != null ? formatCurrency(expandedRevenueToday, 'eur') : `${expandedSalesToday} Verkäufe`;
    if (section === 'photos') return photosLoading ? 'Lädt...' : `${recentPhotos.length} Bilder`;
    if (section === 'health') return machineStatusText({ last_seen_at: expandedLastSeen });
    if (section === 'access') {
      const visibleAccessCount = (parkPasswordCredential ? 1 : 0) + operatorUsers.length + genericCredentials.length;
      return `${visibleAccessCount} Zugänge`;
    }
    if (section === 'structure') return `${expandedAttractions.length + expandedPrefixes.length} Einträge`;
    if (section === 'cameras') return `${expandedCameras.length} Codes`;
    if (section === 'machines') return `${expandedConfigs.length} PCs`;
    return `${expandedTickets.length} offen`;
  }

  const visibleSections = sectionMeta.filter((section) => section.panel === activePanel);
  const activeEditSection =
    activePanel === 'edit' ? visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0] ?? null : null;

  async function refreshAndNotify(message: string) {
    setStatus(message);
    setError(null);
    await load();
  }

  async function createAttraction(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    const res = await edgeFetch('/api/admin/attractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        park_id: expandedPark.id,
        name: attractionName,
        slug: attractionSlug,
        is_active: true,
      }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Attraktion konnte nicht gespeichert werden'));
      return;
    }

    appendActivityEvent({ title: 'Attraktion gespeichert', details: attractionName, level: 'success' });
    setAttractionName('');
    setAttractionSlug('');
    await refreshAndNotify('Attraktion gespeichert');
  }

  async function deleteAttraction(attraction: Attraction) {
    if (!confirm(`Attraktion "${attraction.name}" wirklich löschen?`)) return;
    setDeletingId(attraction.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch(`/api/admin/attractions?id=${encodeURIComponent(attraction.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Attraktion konnte nicht gelöscht werden'));
        return;
      }

      appendActivityEvent({ title: 'Attraktion gelöscht', details: attraction.name, level: 'warning' });
      await refreshAndNotify('Attraktion gelöscht');
    } finally {
      setDeletingId(null);
    }
  }

  async function createPrefix(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    const res = await edgeFetch('/api/admin/park-prefixes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ park_id: expandedPark.id, path_prefix: pathPrefix, is_active: true }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Kürzel konnte nicht gespeichert werden'));
      return;
    }

    appendActivityEvent({ title: 'Foto-Kürzel gespeichert', details: pathPrefix, level: 'success' });
    setPathPrefix('');
    await refreshAndNotify('Foto-Kürzel gespeichert');
  }

  async function deletePrefix(prefix: ParkPathPrefix) {
    if (!confirm(`Kürzel "${prefix.path_prefix}" wirklich löschen?`)) return;
    setDeletingId(prefix.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch(`/api/admin/park-prefixes?id=${encodeURIComponent(prefix.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Kürzel konnte nicht gelöscht werden'));
        return;
      }

      appendActivityEvent({ title: 'Foto-Kürzel gelöscht', details: prefix.path_prefix, level: 'warning' });
      await refreshAndNotify('Foto-Kürzel gelöscht');
    } finally {
      setDeletingId(null);
    }
  }

  async function createCamera(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    const res = await edgeFetch('/api/admin/park-cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        park_id: expandedPark.id,
        customer_code: cameraCode,
        camera_name: cameraName || null,
        attraction_id: cameraAttractionId || null,
        is_active: true,
      }),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Kamera konnte nicht gespeichert werden'));
      return;
    }

    appendActivityEvent({
      title: 'Kamera-Zuordnung gespeichert',
      details: `${cameraCode}${cameraName ? ` (${cameraName})` : ''}`,
      level: 'success',
    });
    setCameraCode('');
    setCameraName('');
    setCameraAttractionId('');
    await refreshAndNotify('Kamera gespeichert');
  }

  async function deleteCamera(camera: ParkCamera) {
    if (!confirm(`Kamera-Code "${camera.customer_code}" wirklich löschen?`)) return;
    setDeletingId(camera.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch(`/api/admin/park-cameras?id=${encodeURIComponent(camera.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Kamera konnte nicht gelöscht werden'));
        return;
      }

      appendActivityEvent({ title: 'Kamera-Zuordnung gelöscht', details: camera.customer_code, level: 'warning' });
      await refreshAndNotify('Kamera gelöscht');
    } finally {
      setDeletingId(null);
    }
  }

  async function saveParkPassword(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);
    setSavingParkPassword(true);
    try {
      const passwordError = await saveCustomerParkPassword(expandedPark.id, expandedPark.name, parkPassword.trim());
      if (passwordError) {
        setError(passwordError);
        return;
      }

      const parkCredentialPayload = {
        label: parkPasswordCredentialLabel(expandedPark),
        category: 'Park-Passwort',
        person_name: '',
        login: expandedPark.slug,
        password: parkPassword.trim(),
        notes: 'Zugang für den Park-Login im Operator-Dashboard.',
      };

      try {
        if (parkPasswordCredential) {
          await updateStaffCredential(parkPasswordCredential.id, parkCredentialPayload);
        } else {
          await createStaffCredential(parkCredentialPayload);
        }
      } catch (credentialError) {
        setError(credentialError instanceof Error ? credentialError.message : 'Park-Passwort wurde gesetzt, aber nicht im Passwort-Tresor gespeichert.');
        await load();
        return;
      }

      appendActivityEvent({ title: 'Park-Passwort gesetzt', details: expandedPark.name, level: 'success' });
      setParkPasswordInput('');
      setShowParkPasswordEditor(false);
      await refreshAndNotify('Park-Passwort gespeichert');
    } finally {
      setSavingParkPassword(false);
    }
  }

  async function saveCredential(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    if (!credentialForm.label.trim() || !credentialForm.password.trim()) {
      setError('Bezeichnung und Passwort sind Pflichtfelder.');
      return;
    }

    const payload = {
      label: credentialForm.label.trim(),
      category: credentialForm.category.trim(),
      person_name: credentialForm.person_name.trim(),
      login: credentialForm.login.trim(),
      password: credentialForm.password,
      notes: credentialForm.notes.trim(),
    };

    try {
      if (editingCredentialId) {
        await updateStaffCredential(editingCredentialId, payload);
      } else {
        await createStaffCredential(payload);
      }
      setEditingCredentialId(null);
      setCredentialForm(emptyCredentialForm);
      setShowCredentialForm(false);
      await refreshAndNotify(editingCredentialId ? 'Zugang aktualisiert' : 'Zugang gespeichert');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Zugang konnte nicht gespeichert werden.');
    }
  }

  function editCredential(credential: StaffCredential) {
    setShowCredentialForm(true);
    setEditingCredentialId(credential.id);
    setCredentialForm({
      label: credential.label,
      category: credential.category || '',
      person_name: credential.person_name || '',
      login: credential.login || '',
      password: credential.password,
      notes: credential.notes || '',
    });
  }

  function resetCredentialForm() {
    setEditingCredentialId(null);
    setCredentialForm(emptyCredentialForm);
    setShowCredentialForm(false);
  }

  async function removeCredential(credential: StaffCredential) {
    if (!confirm(`Zugang "${credential.label}" wirklich löschen?`)) return;

    setStatus(null);
    setError(null);

    try {
      await deleteStaffCredential(credential.id);
      if (editingCredentialId === credential.id) resetCredentialForm();
      await refreshAndNotify('Zugang gelöscht');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Zugang konnte nicht gelöscht werden.');
    }
  }

  async function createOperatorUser(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    if (!operatorUserForm.email.trim() || operatorUserForm.password.trim().length < 8) {
      setError('E-Mail und Passwort mit mindestens 8 Zeichen sind Pflichtfelder.');
      return;
    }

    setCreatingOperatorUser(true);
    try {
      await callOperatorUsersAdmin({
        action: 'create',
        park_id: expandedPark.id,
        full_name: operatorUserForm.full_name.trim(),
        email: operatorUserForm.email.trim(),
        password: operatorUserForm.password,
        role: operatorUserForm.role,
      });

      await createStaffCredential({
        label: operatorUserCredentialLabel(expandedPark, operatorUserForm.email),
        category: 'Dashboard-Zugang',
        person_name: operatorUserForm.full_name.trim(),
        login: operatorUserForm.email.trim().toLowerCase(),
        password: operatorUserForm.password,
        notes: `${operatorRoleLabel(operatorUserForm.role)} für ${expandedPark.name}`,
      });

      appendActivityEvent({ title: 'Operator-Zugang angelegt', details: operatorUserForm.email.trim(), level: 'success' });
      setOperatorUserForm(emptyOperatorUserForm);
      setShowNewOperatorForm(false);
      await refreshAndNotify('Operator-Zugang angelegt');
      await loadOperatorUsersForPark(expandedPark.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Operator-Zugang konnte nicht angelegt werden.');
    } finally {
      setCreatingOperatorUser(false);
    }
  }

  async function updateOperatorUser(user: OperatorAccessUser) {
    if (!expandedPark) return;
    const draft = operatorUserDrafts[user.user_id];
    if (!draft) return;

    setStatus(null);
    setError(null);

    if (!draft.email.trim()) {
      setError('E-Mail darf nicht leer sein.');
      return;
    }

    setSavingOperatorUserId(user.user_id);
    try {
      await callOperatorUsersAdmin({
        action: 'update',
        park_id: expandedPark.id,
        user_id: user.user_id,
        full_name: draft.full_name.trim(),
        email: draft.email.trim(),
        password: draft.password.trim(),
        role: draft.role,
      });

      const existingCredential = expandedCredentials.find(
        (credential) =>
          (credential.login || '').toLowerCase() === (user.email || '').toLowerCase() &&
          credential.category === 'Dashboard-Zugang',
      );

      const mirroredPayload = {
        label: operatorUserCredentialLabel(expandedPark, draft.email.trim()),
        category: 'Dashboard-Zugang',
        person_name: draft.full_name.trim(),
        login: draft.email.trim().toLowerCase(),
        password: draft.password.trim() ? draft.password : existingCredential?.password || '',
        notes: `${operatorRoleLabel(draft.role)} für ${expandedPark.name}`,
      };

      if (existingCredential && mirroredPayload.password) {
        await updateStaffCredential(existingCredential.id, mirroredPayload);
      } else if (draft.password.trim()) {
        if (existingCredential) {
          await updateStaffCredential(existingCredential.id, mirroredPayload);
        } else {
          await createStaffCredential(mirroredPayload);
        }
      }

      appendActivityEvent({ title: 'Operator-Zugang aktualisiert', details: draft.email.trim(), level: 'success' });
      setEditingOperatorUserId(null);
      await refreshAndNotify('Operator-Zugang aktualisiert');
      await loadOperatorUsersForPark(expandedPark.id);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Operator-Zugang konnte nicht aktualisiert werden.');
    } finally {
      setSavingOperatorUserId(null);
    }
  }

  async function deleteOperatorUser(user: OperatorAccessUser) {
    if (!expandedPark) return;
    if (!confirm(`Zugang ${user.email || user.full_name || user.user_id} wirklich löschen?`)) return;

    setStatus(null);
    setError(null);

    try {
      await callOperatorUsersAdmin({
        action: 'delete',
        park_id: expandedPark.id,
        user_id: user.user_id,
      });

      const mirroredCredential = expandedCredentials.find(
        (credential) =>
          credential.category === 'Dashboard-Zugang' &&
          (credential.login || '').toLowerCase() === (user.email || '').toLowerCase(),
      );
      if (mirroredCredential) {
        await deleteStaffCredential(mirroredCredential.id);
      }

      appendActivityEvent({ title: 'Operator-Zugang gelöscht', details: user.email || user.user_id, level: 'warning' });
      if (editingOperatorUserId === user.user_id) setEditingOperatorUserId(null);
      await refreshAndNotify('Operator-Zugang gelöscht');
      await loadOperatorUsersForPark(expandedPark.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Operator-Zugang konnte nicht gelöscht werden.');
    }
  }

  async function createMachine(e: FormEvent) {
    e.preventDefault();
    if (!expandedPark) return;

    setStatus(null);
    setError(null);

    const payload = {
      park_id: expandedPark.id,
      attraction_id: machineForm.attraction_id || null,
      machine_id: machineForm.machine_id.trim().toLowerCase(),
      machine_label: machineForm.machine_label.trim(),
      camera_code: machineForm.camera_code.trim().toLowerCase(),
      camera_label: machineForm.camera_label.trim(),
      legacy_customer_code: machineForm.legacy_customer_code.replace(/\D/g, '').slice(0, 4).padStart(4, '0'),
      mode: machineForm.mode,
      shadow_mode: machineForm.shadow_mode,
      qr_enabled: machineForm.mode === 'count_only' ? false : true,
      speed_enabled: true,
      count_rides_enabled: true,
      upload_all_photos: machineForm.mode === 'all_photos',
    };

    const res = await edgeFetch('/api/admin/liftpic-machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      setError(getApiErrorMessage(body, 'Liftpic PC konnte nicht angelegt werden'));
      return;
    }

    appendActivityEvent({ title: 'Liftpic PC angelegt', details: machineForm.machine_label, level: 'success' });
    setMachineForm(defaultQuickMachineForm);
    await refreshAndNotify('Liftpic PC angelegt');
  }

  async function rotatePairing(config: LiftpicMachineConfig) {
    setBusyId(config.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch('/api/admin/liftpic-machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, action: 'new_pairing_code' }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Pairing-Code konnte nicht erneuert werden'));
        return;
      }

      await refreshAndNotify('Neuer Pairing-Code erstellt');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleShadowMode(config: LiftpicMachineConfig) {
    if (config.mode === 'count_only') {
      setError('Bei "Nur Zähler" bleibt Shadow Mode automatisch aktiv.');
      return;
    }

    const nextShadowMode = !config.shadow_mode;
    if (
      !nextShadowMode &&
      !confirm(`"${config.machine_label || config.machine_id}" wirklich live schalten? Dann führt der PC echte Uploads aus.`)
    ) {
      return;
    }

    setBusyId(config.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch('/api/admin/liftpic-machines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: config.id,
          park_id: config.park_id,
          attraction_id: config.attraction_id,
          machine_id: config.machine_id,
          machine_label: config.machine_label,
          camera_code: config.camera_code,
          camera_label: config.camera_label,
          legacy_customer_code: config.legacy_customer_code,
          mode: config.mode,
          qr_enabled: config.qr_enabled,
          speed_enabled: config.speed_enabled,
          count_rides_enabled: config.count_rides_enabled,
          upload_all_photos: config.upload_all_photos,
          shadow_mode: nextShadowMode,
          raw_dir: config.raw_dir,
          processed_dir: config.processed_dir,
          qrcode_dir: config.qrcode_dir,
          webout_dir: config.webout_dir,
          statistic_file: config.statistic_file,
          print_count_file: config.print_count_file,
          paper_warn_remaining: config.paper_warn_remaining,
          paper_capacity: config.paper_capacity ?? 0,
          is_active: config.is_active,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Shadow Mode konnte nicht geändert werden'));
        return;
      }

      await refreshAndNotify(nextShadowMode ? 'Testmodus aktiviert' : 'Live-Modus aktiviert');
    } finally {
      setBusyId(null);
    }
  }

  async function disableConfig(config: LiftpicMachineConfig) {
    if (!confirm(`Liftpic PC "${config.machine_label || config.machine_id}" deaktivieren?`)) return;
    setBusyId(config.id);
    setStatus(null);
    setError(null);

    try {
      const res = await edgeFetch(`/api/admin/liftpic-machines?id=${encodeURIComponent(config.id)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(getApiErrorMessage(body, 'Liftpic PC konnte nicht deaktiviert werden'));
        return;
      }

      await refreshAndNotify('Liftpic PC deaktiviert');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="customer-management-page">
        <div className="card">
          <p className="note">Kundenbereich wird geladen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-management-page">
      <div className="card customer-directory-shell">
        <div className="customer-directory-head">
          <div>
            <h2>{pageTitle}</h2>
          </div>
          <div className="customer-directory-view-switch" role="tablist" aria-label="Ansicht">
            <button
              type="button"
              className={`customer-directory-view-btn ${view === 'customers' ? 'active' : ''}`}
              onClick={() => setView('customers')}
            >
              Kundenliste
            </button>
            <button
              type="button"
              className={`customer-directory-view-btn ${view === 'setup' ? 'active' : ''}`}
              onClick={() => setView('setup')}
            >
              Anlegen & Setup
            </button>
          </div>
        </div>

        {view === 'customers' && (
          <>
            <div className="customer-directory-toolbar">
              <label className="customer-directory-search">
                <Search size={15} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kunde suchen..."
                />
              </label>
            </div>

            <div className="customer-directory-list">
              {filteredParks.map((park) => {
                const parkAttractions = attractionsByPark.get(park.id) || [];
                const parkCameras = camerasByPark.get(park.id) || [];
                const parkConfigs = configsByPark.get(park.id) || [];
                const parkTickets = ticketsByPark.get(park.id) || [];
                const soldToday = salesTodayByPark.get(park.id) || 0;
                const latestPhoto = latestPhotoByPark[park.id] || null;
                const lastSeen =
                  parkConfigs
                    .map((config) => config.last_seen_at)
                    .filter(Boolean)
                    .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] ?? null;
                const isOpen = expandedPark?.id === park.id;

                return (
                  <article key={park.id} className={`customer-row-card ${isOpen ? 'open' : ''}`}>
                    <div className="customer-row-main">
                      <div className="customer-row-content">
                        <div className="customer-row-head">
                          <div>
                            <h3>{park.name}</h3>
                          </div>
                        </div>

                        <div className="customer-row-meta">
                          <span>{parkAttractions.length} Attraktionen</span>
                          <span>{parkCameras.length} Kameras</span>
                          <span>{parkConfigs.length} PCs</span>
                          <span>{parkTickets.length} Tickets</span>
                          <span>{soldToday} Verkäufe heute</span>
                        </div>

                        <div className="customer-row-actions">
                          <button
                            type="button"
                            className="customer-open-btn"
                            onClick={() =>
                              expandedCustomerId === park.id && activePanel === 'details'
                                ? closeCustomer()
                                : openCustomer(park.id, 'details', 'revenue')
                            }
                          >
                            {isOpen && activePanel === 'details' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            Details
                          </button>
                        </div>
                      </div>

                      <div className="customer-row-media">
                        <button
                          type="button"
                          className="customer-row-photo-card"
                          aria-label={`Letztes Bild von ${park.name}`}
                          title={latestPhoto?.imageUrl ? `Letztes Bild von ${park.name} ansehen` : 'Noch kein Bild'}
                          onClick={() => latestPhoto?.imageUrl && setPreviewPhoto({ parkName: park.name, photo: latestPhoto })}
                          disabled={!latestPhoto?.imageUrl}
                        >
                          {latestPhoto?.imageUrl ? (
                            <img src={latestPhoto.imageUrl} alt={`Letztes Bild von ${park.name}`} loading="lazy" />
                          ) : (
                            <div className="customer-row-photo-empty">
                              <Camera size={16} />
                              <span>Kein Bild</span>
                            </div>
                          )}
                        </button>

                        <button
                          type="button"
                          className="customer-icon-btn customer-row-expand-btn"
                          aria-label={`Letztes Bild von ${park.name} größer anzeigen`}
                          title="Bild vergrößern"
                          onClick={() => latestPhoto?.imageUrl && setPreviewPhoto({ parkName: park.name, photo: latestPhoto })}
                          disabled={!latestPhoto?.imageUrl}
                        >
                          <Expand size={15} />
                        </button>
                      </div>

                      <aside className="customer-row-side">
                        <span className={`badge ${lastSeen ? machineHeartbeatClass(lastSeen) : ''}`}>
                          {machineStatusText({ last_seen_at: lastSeen })}
                        </span>
                        <div className="customer-row-utility-actions">
                          <button
                            type="button"
                            className="customer-icon-btn"
                            onClick={() =>
                              expandedCustomerId === park.id && activePanel === 'edit'
                                ? closeCustomer()
                                : openCustomer(park.id, 'edit', 'access')
                            }
                            aria-label={`${park.name} bearbeiten`}
                            title="Bearbeiten"
                          >
                            <PencilLine size={15} />
                          </button>
                          <Link
                            to={`/staff/passwoerter?q=${encodeURIComponent(park.name)}`}
                            className="customer-icon-link"
                            aria-label={`${park.name} Passwörter`}
                            title="Passwörter"
                          >
                            <KeyRound size={15} />
                          </Link>
                        </div>
                      </aside>
                    </div>

                    {isOpen && (
                      <div className="customer-expand-wrap">
                        <div className="customer-section-list">
                          {activePanel === 'details' ? (
                            <>
                              <div className="customer-detail-tabs" role="tablist" aria-label="Kundendashboard Bereiche">
                                {visibleSections.map((section) => {
                                  const isActive = activeSection === section.id;
                                  const Icon = section.icon;
                                  return (
                                    <button
                                      key={section.id}
                                      type="button"
                                      className={`customer-detail-tab ${isActive ? 'active' : ''}`}
                                      onClick={() => {
                                        if (!isActive) setSection(section.id);
                                      }}
                                      aria-pressed={isActive}
                                    >
                                      <span className="customer-detail-tab-icon">
                                        <Icon size={15} />
                                      </span>
                                      <span className="customer-detail-tab-label">{section.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              <section className="customer-detail-canvas">
                                {activeSection === 'revenue' && (
                                  <EmbeddedOperatorPage authValue={embeddedAuthValue} parkValue={embeddedParkValue}>
                                    <Revenue embedded />
                                  </EmbeddedOperatorPage>
                                )}

                                {activeSection === 'photos' && (
                                  <EmbeddedOperatorPage authValue={embeddedAuthValue} parkValue={embeddedParkValue}>
                                    <Photos embedded />
                                  </EmbeddedOperatorPage>
                                )}

                                {activeSection === 'health' && (
                                  <EmbeddedOperatorPage authValue={embeddedAuthValue} parkValue={embeddedParkValue}>
                                    <SystemHealth embedded />
                                  </EmbeddedOperatorPage>
                                )}

                                {activeSection === 'emails' && (
                                  <EmbeddedOperatorPage authValue={embeddedAuthValue} parkValue={embeddedParkValue}>
                                    <Leads embedded />
                                  </EmbeddedOperatorPage>
                                )}
                              </section>
                            </>
                          ) : activeEditSection ? (
                            <>
                              <div className="customer-detail-tabs" role="tablist" aria-label="Bearbeiten Bereiche">
                                {visibleSections.map((section) => {
                                  const isActive = activeEditSection.id === section.id;
                                  const Icon = section.icon;
                                  return (
                                    <button
                                      key={section.id}
                                      type="button"
                                      className={`customer-detail-tab ${isActive ? 'active' : ''}`}
                                      onClick={() => (isActive ? closeCustomer() : setSection(section.id))}
                                      aria-pressed={isActive}
                                    >
                                      <span className="customer-detail-tab-icon">
                                        <Icon size={15} />
                                      </span>
                                      <span className="customer-detail-tab-label">{section.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              <section className="customer-detail-canvas customer-edit-canvas">
                                {[activeEditSection].map((section) => (
                                  <div key={section.id}>
                                    {section.id === 'access' && (
                                      <div className="customer-section-stack">
                                        {(status || error) && (
                                          <div className="customer-inline-status" aria-live="polite">
                                            {status && <p className="success">{status}</p>}
                                            {error && <p className="error">{error}</p>}
                                          </div>
                                        )}

                                        <div className="customer-simple-card customer-access-compact-card">
                                          <div className="customer-inline-head">
                                            <div>
                                              <strong>Park-Login</strong>
                                              <small>{expandedPark.slug}</small>
                                            </div>
                                            <div className="row customer-password-actions">
                                              {parkPasswordCredential && (
                                                <>
                                                  <button
                                                    type="button"
                                                    className="customer-icon-btn"
                                                    onClick={() =>
                                                      setVisiblePasswords((prev) => ({
                                                        ...prev,
                                                        [parkPasswordCredential.id]: !prev[parkPasswordCredential.id],
                                                      }))
                                                    }
                                                    aria-label={visiblePasswords[parkPasswordCredential.id] ? 'Park-Passwort verbergen' : 'Park-Passwort anzeigen'}
                                                    title={visiblePasswords[parkPasswordCredential.id] ? 'Verbergen' : 'Anzeigen'}
                                                  >
                                                    {visiblePasswords[parkPasswordCredential.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="customer-icon-btn"
                                                    onClick={() => copy(`password-${parkPasswordCredential.id}`, parkPasswordCredential.password)}
                                                    aria-label="Park-Passwort kopieren"
                                                    title={copiedId === `password-${parkPasswordCredential.id}` ? 'Kopiert' : 'Kopieren'}
                                                  >
                                                    <Copy size={14} />
                                                  </button>
                                                </>
                                              )}
                                              <button
                                                type="button"
                                                className="customer-icon-btn"
                                                onClick={() => setShowParkPasswordEditor((prev) => !prev)}
                                                aria-label="Park-Passwort bearbeiten"
                                                title="Bearbeiten"
                                              >
                                                <PencilLine size={14} />
                                              </button>
                                            </div>
                                          </div>

                                          {parkPasswordCredential ? (
                                            <div className="customer-password-line compact">
                                              <code>{visiblePasswords[parkPasswordCredential.id] ? parkPasswordCredential.password : '••••••••••••'}</code>
                                            </div>
                                          ) : (
                                            <p className="note">
                                              Noch kein lesbares Park-Passwort gespeichert. Alte Passwörter liegen nur gehasht vor und müssen einmal neu gesetzt werden.
                                            </p>
                                          )}

                                          {showParkPasswordEditor && (
                                            <form className="grid customer-compact-form" onSubmit={saveParkPassword}>
                                              <div className="row">
                                                <div>
                                                  <label>Neues Passwort</label>
                                                  <input
                                                    type="text"
                                                    minLength={6}
                                                    value={parkPassword}
                                                    onChange={(e) => setParkPasswordInput(e.target.value)}
                                                    placeholder="Mindestens 6 Zeichen"
                                                    required
                                                  />
                                                </div>
                                              </div>
                                              <div className="customer-machine-actions">
                                                <button type="submit" className="customer-action-btn" disabled={savingParkPassword}>
                                                  {savingParkPassword ? 'Speichert...' : 'Speichern'}
                                                </button>
                                                <button
                                                  type="button"
                                                  className="customer-quiet-btn"
                                                  onClick={() => {
                                                    setShowParkPasswordEditor(false);
                                                    setParkPasswordInput('');
                                                  }}
                                                >
                                                  Abbrechen
                                                </button>
                                              </div>
                                            </form>
                                          )}
                                        </div>

                                        <div className="customer-simple-card customer-access-compact-card">
                                          <div className="customer-inline-head">
                                            <div>
                                              <strong>Dashboard-Accounts</strong>
                                              <small>{operatorUsers.length} Nutzer</small>
                                            </div>
                                            <button
                                              type="button"
                                              className="customer-quiet-btn"
                                              onClick={() => setShowNewOperatorForm((prev) => !prev)}
                                            >
                                              {showNewOperatorForm ? 'Schließen' : 'Neu'}
                                            </button>
                                          </div>

                                          {showNewOperatorForm && (
                                            <form className="grid customer-compact-form" onSubmit={createOperatorUser}>
                                              <div className="row">
                                                <div>
                                                  <label>Name</label>
                                                  <input
                                                    value={operatorUserForm.full_name}
                                                    onChange={(e) => setOperatorUserForm((prev) => ({ ...prev, full_name: e.target.value }))}
                                                    placeholder="Max Mustermann"
                                                  />
                                                </div>
                                                <div>
                                                  <label>E-Mail</label>
                                                  <input
                                                    type="email"
                                                    value={operatorUserForm.email}
                                                    onChange={(e) => setOperatorUserForm((prev) => ({ ...prev, email: e.target.value }))}
                                                    placeholder="kunde@park.at"
                                                    required
                                                  />
                                                </div>
                                              </div>
                                              <div className="row">
                                                <div>
                                                  <label>Rolle</label>
                                                  <select
                                                    value={operatorUserForm.role}
                                                    onChange={(e) =>
                                                      setOperatorUserForm((prev) => ({
                                                        ...prev,
                                                        role: e.target.value as 'org_owner' | 'staff',
                                                      }))
                                                    }
                                                  >
                                                    <option value="staff">Mitarbeiter</option>
                                                    <option value="org_owner">Inhaber</option>
                                                  </select>
                                                </div>
                                                <div>
                                                  <label>Passwort</label>
                                                  <input
                                                    type="text"
                                                    minLength={8}
                                                    value={operatorUserForm.password}
                                                    onChange={(e) => setOperatorUserForm((prev) => ({ ...prev, password: e.target.value }))}
                                                    placeholder="Mindestens 8 Zeichen"
                                                    required
                                                  />
                                                </div>
                                              </div>
                                              <div className="customer-machine-actions">
                                                <button type="submit" className="customer-action-btn" disabled={creatingOperatorUser}>
                                                  {creatingOperatorUser ? 'Legt an...' : 'Zugang anlegen'}
                                                </button>
                                              </div>
                                            </form>
                                          )}

                                          {operatorUsersLoading && <p className="note">Dashboard-Accounts werden geladen...</p>}
                                          {operatorUsersError && <p className="error">{operatorUsersError}</p>}
                                          {!operatorUsersLoading && operatorUsers.length === 0 && (
                                            <p className="note">Für diesen Kunden ist noch kein Dashboard-Account angelegt.</p>
                                          )}

                                          <div className="customer-credential-stack compact">
                                            {operatorUsers.map((user) => {
                                              const draft = operatorUserDrafts[user.user_id] || {
                                                full_name: user.full_name || '',
                                                email: user.email || '',
                                                password: '',
                                                role: user.role,
                                              };
                                              const mirroredCredential =
                                                expandedPark && user.email
                                                  ? expandedCredentials.find(
                                                      (credential) =>
                                                        credential.category === 'Dashboard-Zugang' &&
                                                        (credential.login || '').toLowerCase() === user.email.toLowerCase(),
                                                    ) || null
                                                  : null;
                                              const isEditing = editingOperatorUserId === user.user_id;

                                              return (
                                                <div key={user.user_id} className={`customer-access-user ${isEditing ? 'open' : ''}`}>
                                                  <div className="customer-access-user-row">
                                                    <div className="customer-access-user-main">
                                                      <strong>{user.full_name || user.email || 'Unbenannter Zugang'}</strong>
                                                      <small>
                                                        {user.email || 'Keine E-Mail'} · {operatorRoleLabel(user.role)}
                                                        {user.is_legacy_org_wide ? ' · Alt: org-weit' : ''}
                                                      </small>
                                                    </div>
                                                    <div className="customer-access-user-password">
                                                      {mirroredCredential ? (
                                                        <code>
                                                          {visiblePasswords[mirroredCredential.id] ? mirroredCredential.password : '••••••••••••'}
                                                        </code>
                                                      ) : (
                                                        <span className="note">Kein lesbares Passwort</span>
                                                      )}
                                                    </div>
                                                    <div className="row customer-password-actions">
                                                      {mirroredCredential && (
                                                        <>
                                                          <button
                                                            type="button"
                                                            className="customer-icon-btn"
                                                            onClick={() =>
                                                              setVisiblePasswords((prev) => ({
                                                                ...prev,
                                                                [mirroredCredential.id]: !prev[mirroredCredential.id],
                                                              }))
                                                            }
                                                            aria-label={
                                                              visiblePasswords[mirroredCredential.id]
                                                                ? 'Account-Passwort verbergen'
                                                                : 'Account-Passwort anzeigen'
                                                            }
                                                            title={visiblePasswords[mirroredCredential.id] ? 'Verbergen' : 'Anzeigen'}
                                                          >
                                                            {visiblePasswords[mirroredCredential.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                          </button>
                                                          <button
                                                            type="button"
                                                            className="customer-icon-btn"
                                                            onClick={() => copy(`operator-password-${mirroredCredential.id}`, mirroredCredential.password)}
                                                            aria-label="Account-Passwort kopieren"
                                                            title={
                                                              copiedId === `operator-password-${mirroredCredential.id}` ? 'Passwort kopiert' : 'Passwort kopieren'
                                                            }
                                                          >
                                                            <Copy size={14} />
                                                          </button>
                                                        </>
                                                      )}
                                                      {user.email && (
                                                        <button
                                                          type="button"
                                                          className="customer-icon-btn"
                                                          onClick={() => copy(`operator-login-${user.user_id}`, user.email || '')}
                                                          aria-label={`${user.email} kopieren`}
                                                          title={copiedId === `operator-login-${user.user_id}` ? 'Login kopiert' : 'Login kopieren'}
                                                        >
                                                          <Mail size={14} />
                                                        </button>
                                                      )}
                                                      <button
                                                        type="button"
                                                        className="customer-icon-btn"
                                                        onClick={() => setEditingOperatorUserId((prev) => (prev === user.user_id ? null : user.user_id))}
                                                        aria-label="Zugang bearbeiten"
                                                        title="Bearbeiten"
                                                      >
                                                        <PencilLine size={14} />
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="customer-icon-btn"
                                                        onClick={() => void deleteOperatorUser(user)}
                                                        aria-label="Zugang löschen"
                                                        title="Löschen"
                                                      >
                                                        <Trash2 size={14} />
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {isEditing && (
                                                    <div className="grid customer-compact-form customer-access-editor">
                                                      <div className="row">
                                                        <div>
                                                          <label>Name</label>
                                                          <input
                                                            value={draft.full_name}
                                                            onChange={(e) =>
                                                              setOperatorUserDrafts((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: { ...draft, full_name: e.target.value },
                                                              }))
                                                            }
                                                          />
                                                        </div>
                                                        <div>
                                                          <label>E-Mail</label>
                                                          <input
                                                            type="email"
                                                            value={draft.email}
                                                            onChange={(e) =>
                                                              setOperatorUserDrafts((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: { ...draft, email: e.target.value },
                                                              }))
                                                            }
                                                          />
                                                        </div>
                                                      </div>
                                                      <div className="row">
                                                        <div>
                                                          <label>Rolle</label>
                                                          <select
                                                            value={draft.role}
                                                            onChange={(e) =>
                                                              setOperatorUserDrafts((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: { ...draft, role: e.target.value },
                                                              }))
                                                            }
                                                          >
                                                            <option value="staff">Mitarbeiter</option>
                                                            <option value="org_owner">Inhaber</option>
                                                            <option value="park_manager">Park-Manager</option>
                                                            <option value="marketing">Marketing</option>
                                                            <option value="support_agent">Support</option>
                                                          </select>
                                                        </div>
                                                        <div>
                                                          <label>Neues Passwort</label>
                                                          <input
                                                            type="text"
                                                            minLength={8}
                                                            value={draft.password}
                                                            onChange={(e) =>
                                                              setOperatorUserDrafts((prev) => ({
                                                                ...prev,
                                                                [user.user_id]: { ...draft, password: e.target.value },
                                                              }))
                                                            }
                                                            placeholder="Leer lassen, wenn unverändert"
                                                          />
                                                        </div>
                                                      </div>
                                                      <div className="customer-machine-actions">
                                                        <button
                                                          type="button"
                                                          className="customer-action-btn"
                                                          onClick={() => void updateOperatorUser(user)}
                                                          disabled={savingOperatorUserId === user.user_id}
                                                        >
                                                          {savingOperatorUserId === user.user_id ? 'Speichert...' : 'Speichern'}
                                                        </button>
                                                        <button
                                                          type="button"
                                                          className="customer-quiet-btn"
                                                          onClick={() => setEditingOperatorUserId(null)}
                                                        >
                                                          Schließen
                                                        </button>
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        <div className="customer-simple-card customer-access-compact-card">
                                          <div className="customer-inline-head">
                                            <strong>Gespeicherte Zugangsdaten</strong>
                                            <div className="row customer-password-actions">
                                              <button
                                                type="button"
                                                className="customer-quiet-btn"
                                                onClick={() => {
                                                  if (showCredentialForm && !editingCredentialId) {
                                                    resetCredentialForm();
                                                    return;
                                                  }
                                                  setShowCredentialForm(true);
                                                }}
                                              >
                                                {showCredentialForm ? (editingCredentialId ? 'Bearbeitung aktiv' : 'Schließen') : 'Neu'}
                                              </button>
                                              <Link
                                                to={`/staff/passwoerter?q=${encodeURIComponent(park.name)}`}
                                                className="btn-link customer-mini-link"
                                              >
                                                Passwortliste
                                              </Link>
                                            </div>
                                          </div>

                                          {showCredentialForm && (
                                            <form className="grid customer-compact-form" onSubmit={saveCredential}>
                                              <div className="row">
                                                <div>
                                                  <label>Bezeichnung</label>
                                                  <input
                                                    value={credentialForm.label}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, label: e.target.value }))}
                                                    placeholder={`${park.name} – Zugang`}
                                                    required
                                                  />
                                                </div>
                                                <div>
                                                  <label>Kategorie</label>
                                                  <input
                                                    value={credentialForm.category}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, category: e.target.value }))}
                                                    placeholder="z. B. Tool, Social, Zusatzlogin"
                                                  />
                                                </div>
                                              </div>
                                              <div className="row">
                                                <div>
                                                  <label>Name</label>
                                                  <input
                                                    value={credentialForm.person_name}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, person_name: e.target.value }))}
                                                  />
                                                </div>
                                                <div>
                                                  <label>Login / E-Mail</label>
                                                  <input
                                                    value={credentialForm.login}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, login: e.target.value }))}
                                                  />
                                                </div>
                                              </div>
                                              <div className="row">
                                                <div>
                                                  <label>Passwort</label>
                                                  <input
                                                    type="text"
                                                    value={credentialForm.password}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, password: e.target.value }))}
                                                    required
                                                  />
                                                </div>
                                                <div>
                                                  <label>Notiz</label>
                                                  <input
                                                    value={credentialForm.notes}
                                                    onChange={(e) => setCredentialForm((prev) => ({ ...prev, notes: e.target.value }))}
                                                  />
                                                </div>
                                              </div>
                                              <div className="customer-machine-actions">
                                                <button type="submit" className="customer-action-btn">
                                                  {editingCredentialId ? 'Zugang aktualisieren' : 'Zugang speichern'}
                                                </button>
                                                <button type="button" className="customer-quiet-btn" onClick={resetCredentialForm}>
                                                  Abbrechen
                                                </button>
                                              </div>
                                            </form>
                                          )}

                                          {genericCredentials.length === 0 && (
                                            <p className="note">Für diesen Kunden wurden in der Passwortverwaltung noch keine Einträge gefunden.</p>
                                          )}

                                          <div className="customer-credential-stack">
                                            {genericCredentials.map((credential) => (
                                              <div key={credential.id} className="customer-simple-card">
                                                <div className="customer-inline-head">
                                                  <div>
                                                    <strong>{credential.label}</strong>
                                                    {credential.category && <small>{credential.category}</small>}
                                                  </div>
                                                  <div className="row customer-password-actions">
                                                    {credential.login && (
                                                      <button
                                                        type="button"
                                                        className="customer-icon-btn"
                                                        onClick={() => copy(`login-${credential.id}`, credential.login || '')}
                                                        aria-label="Login kopieren"
                                                        title={copiedId === `login-${credential.id}` ? 'Login kopiert' : 'Login kopieren'}
                                                      >
                                                        <Copy size={14} />
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      className="customer-icon-btn"
                                                      onClick={() => editCredential(credential)}
                                                      aria-label="Zugang bearbeiten"
                                                      title="Bearbeiten"
                                                    >
                                                      <PencilLine size={14} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="customer-icon-btn"
                                                      onClick={() => void removeCredential(credential)}
                                                      aria-label="Zugang löschen"
                                                      title="Löschen"
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  </div>
                                                </div>
                                                {credential.login && (
                                                  <p className="note">
                                                    Login: <code>{credential.login}</code>
                                                  </p>
                                                )}
                                                <div className="customer-password-line">
                                                  <code>{visiblePasswords[credential.id] ? credential.password : '••••••••••••'}</code>
                                                  <div className="row customer-password-actions">
                                                    <button
                                                      type="button"
                                                      className="customer-icon-btn"
                                                      onClick={() =>
                                                        setVisiblePasswords((prev) => ({ ...prev, [credential.id]: !prev[credential.id] }))
                                                      }
                                                      aria-label={visiblePasswords[credential.id] ? 'Passwort verbergen' : 'Passwort anzeigen'}
                                                      title={visiblePasswords[credential.id] ? 'Verbergen' : 'Anzeigen'}
                                                    >
                                                      {visiblePasswords[credential.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="customer-icon-btn"
                                                      onClick={() => copy(`password-${credential.id}`, credential.password)}
                                                      aria-label="Passwort kopieren"
                                                      title={copiedId === `password-${credential.id}` ? 'Passwort kopiert' : 'Passwort kopieren'}
                                                    >
                                                      <Copy size={14} />
                                                    </button>
                                                  </div>
                                                </div>
                                                {credential.notes && <p className="note">{credential.notes}</p>}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {section.id === 'structure' && (
                                      <div className="customer-section-stack">
                                        <div className="customer-simple-card">
                                          <div className="customer-inline-head">
                                            <strong>Attraktionen</strong>
                                            <span className="note">{expandedAttractions.length}</span>
                                          </div>
                                          <div className="customer-simple-list">
                                            {expandedAttractions.map((attraction) => (
                                              <div key={attraction.id} className="customer-simple-list-row">
                                                <div>
                                                  <strong>{attraction.name}</strong>
                                                  <small>{attraction.slug}</small>
                                                </div>
                                                <button
                                                  type="button"
                                                  className="danger inline"
                                                  onClick={() => void deleteAttraction(attraction)}
                                                  disabled={deletingId === attraction.id}
                                                >
                                                  Löschen
                                                </button>
                                              </div>
                                            ))}
                                            {expandedAttractions.length === 0 && <p className="note">Noch keine Attraktionen angelegt.</p>}
                                          </div>
                                          <form className="grid customer-compact-form" onSubmit={createAttraction}>
                                            <div className="row">
                                              <div>
                                                <label>Neue Attraktion</label>
                                                <input value={attractionName} onChange={(e) => setAttractionName(e.target.value)} required />
                                              </div>
                                              <div>
                                                <label>Slug</label>
                                                <input
                                                  value={attractionSlug}
                                                  onChange={(e) => setAttractionSlug(e.target.value.toLowerCase())}
                                                  required
                                                />
                                              </div>
                                            </div>
                                            <button type="submit" className="customer-action-btn">
                                              Attraktion anlegen
                                            </button>
                                          </form>
                                        </div>

                                        <div className="customer-simple-card">
                                          <div className="customer-inline-head">
                                            <strong>Foto-Kürzel</strong>
                                            <span className="note">{expandedPrefixes.length}</span>
                                          </div>
                                          <div className="customer-simple-list">
                                            {expandedPrefixes.map((prefix) => (
                                              <div key={prefix.id} className="customer-simple-list-row">
                                                <div>
                                                  <strong>{prefix.path_prefix}</strong>
                                                  <small>Automatische Foto-Zuordnung</small>
                                                </div>
                                                <button
                                                  type="button"
                                                  className="danger inline"
                                                  onClick={() => void deletePrefix(prefix)}
                                                  disabled={deletingId === prefix.id}
                                                >
                                                  Löschen
                                                </button>
                                              </div>
                                            ))}
                                            {expandedPrefixes.length === 0 && <p className="note">Noch kein Kürzel hinterlegt.</p>}
                                          </div>
                                          <form className="row customer-compact-form" onSubmit={createPrefix}>
                                            <div>
                                              <label>Neues Kürzel</label>
                                              <input value={pathPrefix} onChange={(e) => setPathPrefix(e.target.value.trim())} required />
                                            </div>
                                            <div className="customer-form-button-col">
                                              <button type="submit" className="customer-action-btn">
                                                Kürzel speichern
                                              </button>
                                            </div>
                                          </form>
                                        </div>
                                      </div>
                                    )}

                                    {section.id === 'cameras' && (
                                      <div className="customer-section-stack">
                                        <div className="customer-simple-card customer-form-card">
                                          <div className="customer-table-wrap">
                                          <table className="table camera-table">
                                            <thead>
                                              <tr>
                                                <th>Code</th>
                                                <th>Name</th>
                                                <th>Attraktion</th>
                                                <th>Aktion</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {expandedCameras.map((camera) => (
                                                <tr key={camera.id}>
                                                  <td>{camera.customer_code}</td>
                                                  <td>{camera.camera_name || '-'}</td>
                                                  <td>{camera.attraction_id ? attractionNameById.get(camera.attraction_id) || '-' : '-'}</td>
                                                  <td>
                                                    <button
                                                      type="button"
                                                      className="danger inline"
                                                      onClick={() => void deleteCamera(camera)}
                                                      disabled={deletingId === camera.id}
                                                    >
                                                      Löschen
                                                    </button>
                                                  </td>
                                                </tr>
                                              ))}
                                              {expandedCameras.length === 0 && (
                                                <tr>
                                                  <td colSpan={4} className="note">Noch keine Kameras angelegt.</td>
                                                </tr>
                                              )}
                                            </tbody>
                                          </table>
                                          </div>
                                        </div>

                                        <div className="customer-simple-card customer-form-card">
                                          <form className="grid customer-compact-form" onSubmit={createCamera}>
                                            <div className="row">
                                              <div>
                                                <label>Kamera-Code</label>
                                                <input
                                                  value={cameraCode}
                                                  onChange={(e) => setCameraCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                  required
                                                />
                                              </div>
                                              <div>
                                                <label>Name</label>
                                                <input value={cameraName} onChange={(e) => setCameraName(e.target.value)} />
                                              </div>
                                            </div>
                                            <div>
                                              <label>Attraktion</label>
                                              <select value={cameraAttractionId} onChange={(e) => setCameraAttractionId(e.target.value)}>
                                                <option value="">Keine Zuordnung</option>
                                                {expandedAttractions.map((attraction) => (
                                                  <option key={attraction.id} value={attraction.id}>
                                                    {attraction.name}
                                                  </option>
                                                ))}
                                              </select>
                                            </div>
                                            <button type="submit" className="customer-action-btn">
                                              Kamera speichern
                                            </button>
                                          </form>
                                        </div>
                                      </div>
                                    )}

                                    {section.id === 'machines' && (
                                      <div className="customer-section-stack">
                                        <div className="customer-machine-stack">
                                          {expandedConfigs.map((config) => {
                                            const healthNotes = machineHealthNotes(config.last_status || {});
                                            return (
                                              <div key={config.id} className="customer-simple-card">
                                                <div className="customer-inline-head">
                                                  <div>
                                                    <strong>{config.machine_label}</strong>
                                                    <small>{config.machine_id}</small>
                                                  </div>
                                                  <span className={`badge ${machineHeartbeatClass(config.last_seen_at)}`}>
                                                    {machineStatusText(config)}
                                                  </span>
                                                </div>
                                                <p className="note">
                                                  {config.camera_label} · {machineModeLabel(config.mode)} · {config.shadow_mode ? 'Testmodus' : 'Live'} ·{' '}
                                                  {config.legacy_customer_code}
                                                </p>
                                                <p className="note">Pairing: <code>{config.pairing_code}</code></p>
                                                <p className="note">Zuletzt gesehen: {formatDateTime(config.last_seen_at)}</p>
                                                {healthNotes.length > 0 && (
                                                  <div className="customer-row-meta">
                                                    {healthNotes.map((note) => (
                                                      <span key={note}>{note}</span>
                                                    ))}
                                                  </div>
                                                )}
                                                <div className="customer-machine-actions">
                                                  <button
                                                    type="button"
                                                    className="customer-icon-btn"
                                                    onClick={() => copy(`pairing-${config.id}`, config.pairing_code)}
                                                    aria-label={`${config.machine_label} Pairing-Code kopieren`}
                                                    title="Code kopieren"
                                                  >
                                                    <Copy size={14} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="customer-icon-btn"
                                                    onClick={() => void rotatePairing(config)}
                                                    disabled={busyId === config.id}
                                                    aria-label={`${config.machine_label} neuer Code`}
                                                    title="Neuer Code"
                                                  >
                                                    <RotateCcw size={14} />
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className={config.shadow_mode ? 'customer-quiet-btn' : 'danger inline'}
                                                    onClick={() => void toggleShadowMode(config)}
                                                    disabled={busyId === config.id}
                                                  >
                                                    {config.shadow_mode ? 'Live schalten' : 'Testmodus an'}
                                                  </button>
                                                  <button
                                                    type="button"
                                                    className="danger inline"
                                                    onClick={() => void disableConfig(config)}
                                                    disabled={busyId === config.id}
                                                  >
                                                    Deaktivieren
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}

                                          {expandedConfigs.length === 0 && <p className="note">Für diesen Kunden ist noch kein Liftpic PC vorbereitet.</p>}
                                        </div>

                                        <div className="customer-simple-card customer-form-card">
                                          <form className="grid customer-compact-form" onSubmit={createMachine}>
                                            <div className="row">
                                              <div>
                                                <label>PC-ID</label>
                                                <input
                                                  value={machineForm.machine_id}
                                                  onChange={(e) => setMachineForm((prev) => ({ ...prev, machine_id: e.target.value }))}
                                                  placeholder="imst-pc-1"
                                                  required
                                                />
                                              </div>
                                              <div>
                                                <label>PC-Name</label>
                                                <input
                                                  value={machineForm.machine_label}
                                                  onChange={(e) => setMachineForm((prev) => ({ ...prev, machine_label: e.target.value }))}
                                                  placeholder="Kassa 1"
                                                  required
                                                />
                                              </div>
                                            </div>
                                            <div className="row">
                                              <div>
                                                <label>Kamera intern</label>
                                                <input
                                                  value={machineForm.camera_code}
                                                  onChange={(e) => setMachineForm((prev) => ({ ...prev, camera_code: e.target.value }))}
                                                  required
                                                />
                                              </div>
                                              <div>
                                                <label>Kamera-Name</label>
                                                <input
                                                  value={machineForm.camera_label}
                                                  onChange={(e) => setMachineForm((prev) => ({ ...prev, camera_label: e.target.value }))}
                                                  required
                                                />
                                              </div>
                                              <div>
                                                <label>Kundencode alt</label>
                                                <input
                                                  value={machineForm.legacy_customer_code}
                                                  onChange={(e) =>
                                                    setMachineForm((prev) => ({
                                                      ...prev,
                                                      legacy_customer_code: e.target.value.replace(/\D/g, '').slice(0, 4),
                                                    }))
                                                  }
                                                  required
                                                />
                                              </div>
                                            </div>
                                            <div className="row">
                                              <div>
                                                <label>Attraktion</label>
                                                <select
                                                  value={machineForm.attraction_id}
                                                  onChange={(e) => setMachineForm((prev) => ({ ...prev, attraction_id: e.target.value }))}
                                                >
                                                  <option value="">Keine feste Attraktion</option>
                                                  {expandedAttractions.map((attraction) => (
                                                    <option key={attraction.id} value={attraction.id}>
                                                      {attraction.name}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div>
                                                <label>Modus</label>
                                                <select
                                                  value={machineForm.mode}
                                                  onChange={(e) =>
                                                    setMachineForm((prev) => ({ ...prev, mode: e.target.value as LiftpicMachineMode }))
                                                  }
                                                >
                                                  <option value="sold_only">Nur verkaufte Fotos</option>
                                                  <option value="all_photos">Alle Fotos</option>
                                                  <option value="count_only">Nur Zähler</option>
                                                </select>
                                              </div>
                                              <div>
                                                <label>Startmodus</label>
                                                <select
                                                  value={machineForm.shadow_mode ? 'shadow' : 'live'}
                                                  onChange={(e) =>
                                                    setMachineForm((prev) => ({ ...prev, shadow_mode: e.target.value === 'shadow' }))
                                                  }
                                                >
                                                  <option value="shadow">Testmodus</option>
                                                  <option value="live">Live</option>
                                                </select>
                                              </div>
                                            </div>
                                            <button type="submit" className="customer-action-btn">
                                              Liftpic PC anlegen
                                            </button>
                                          </form>
                                        </div>
                                      </div>
                                    )}

                                    {section.id === 'support' && (
                                      <div className="customer-section-stack">
                                        <div className="customer-simple-card">
                                          <div className="customer-inline-head">
                                            <strong>Offene Tickets</strong>
                                            <Link to="/staff/support-ticket-kunden" className="btn-link customer-mini-link">
                                            Support öffnen
                                          </Link>
                                        </div>
                                        {expandedTickets.length === 0 && <p className="note">Aktuell keine offenen Support-Tickets.</p>}
                                        <div className="customer-simple-list">
                                          {expandedTickets.map((ticket) => (
                                            <div key={ticket.id} className="customer-simple-list-row">
                                              <div>
                                                <strong>{ticket.subject}</strong>
                                                <small>{ticket.priority} · {formatRelative(ticket.created_at)}</small>
                                              </div>
                                              <span className={`badge status-${ticket.status}`}>{ticket.status}</span>
                                            </div>
                                          ))}
                                        </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </section>
                            </>
                          ) : null}
                        </div>

                        {(status || error) && (
                          <div className="customer-inline-status">
                            {status && <p className="success">{status}</p>}
                            {error && <p className="error">{error}</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {filteredParks.length === 0 && <p className="note">Kein aktiver Kunde passt zur Suche.</p>}
            </div>
          </>
        )}

        {view === 'setup' && (
          <>
            <div className="customer-management-tabs" role="tablist" aria-label="Setup-Bereiche">
              {legacyTabs.map((tab) => {
                const isActive = tab.id === legacyTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`customer-management-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setLegacyTab(tab.id)}
                  >
                    <tab.icon size={18} />
                    <span>
                      <strong>{tab.label}</strong>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="management-section">
              {legacyTab === 'parks' && <ParksPage />}
              {legacyTab === 'cameras' && <CamerasPage />}
              {legacyTab === 'liftpic' && <LiftpicSetupPage />}
            </div>
          </>
        )}
      </div>

      {previewPhoto && (
        <div className="media-lightbox" onClick={() => setPreviewPhoto(null)}>
          <div className="media-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewPhoto.photo.imageUrl || ''} alt={`Letztes Bild von ${previewPhoto.parkName}`} />
            <div className="media-lightbox-meta">
              <h4>{previewPhoto.parkName}</h4>
              <p className="note">Letztes Bild: {formatDateTime(previewPhoto.photo.capturedAt)}</p>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="secondary inline" onClick={() => setPreviewPhoto(null)}>
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
