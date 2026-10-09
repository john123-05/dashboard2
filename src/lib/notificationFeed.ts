import { useCallback, useEffect, useMemo, useState } from 'react';
import { invokeEdgeFunction } from './edgeFunctions';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';
import { benenne } from './geraeteNamen';
import { translate as t } from './i18n';

// Benachrichtigungen für die Leiste oben rechts (TopBar / NotificationsDrawer).
//
// Quellen (alle schon vorhanden, keine eigene Tabelle):
//  - Antworten vom Support            -> Function `support-tickets` (recent_messages)
//  - Zustand der Automaten            -> Function `operator-liftpic-health`
//    (offline, Papier knapp, Gerät ausgefallen, Abholcode fehlt, Münzröhre leer)
//
// Gelesen / Papierkorb / Verlauf merkt sich der Browser je Konto und Park
// (localStorage). Einmal gesehene Meldungen bleiben im Verlauf, auch wenn die
// Störung inzwischen behoben ist.

export type NotificationKind = 'support' | 'fault' | 'offline' | 'paper' | 'code' | 'coins';

export type FeedItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  text: string;
  link: string;
  createdAt: string;
  severity: 'info' | 'warning' | 'error';
};

type Stored = {
  items: FeedItem[];
  read: string[];
  trash: Record<string, number>;
  deleted: string[];
};

const KEEP_DAYS = 30;
const MAX_ITEMS = 80;
const REFRESH_MS = 120_000;

const HEALTH_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1/operator-liftpic-health`;

type HealthMachine = {
  id: string;
  machine_id: string;
  machine_label: string | null;
  reachable: boolean;
  offline_minutes?: number | null;
  last_seen_at?: string | null;
  paper_remaining?: number | null;
  paper_warn_remaining?: number | null;
  customer_code_registered?: boolean | null;
  customer_code?: string | null;
  devices?: { name: string; status: string; plain?: string | null; detail?: string | null }[];
  probes?: { name: string; status: string; detail?: string | null }[];
  coin_warnings?: { cent: number; stufe: 'knapp' | 'leer'; text: string }[];
};

const today = () => new Date().toISOString().slice(0, 10);

async function machineItems(parkId: string): Promise<FeedItem[]> {
  const { data: { session } } = await getFunctionSession();
  if (!session?.access_token) return [];
  const res = await fetch(`${HEALTH_URL}?park_id=${encodeURIComponent(parkId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  const machines = (body?.data?.machines ?? []) as HealthMachine[];
  const day = today();
  const now = new Date().toISOString();
  const out: FeedItem[] = [];

  for (const m of machines) {
    const name = m.machine_label || m.machine_id;
    if (!m.reachable) {
      out.push({
        id: `offline-${m.id}-${m.last_seen_at ?? day}`,
        kind: 'offline',
        title: t('notif.machine_offline', { name }),
        text: t('notif.machine_offline_text'),
        link: '/health',
        createdAt: m.last_seen_at ?? now,
        severity: 'error',
      });
    }
    if (m.customer_code_registered === false) {
      out.push({
        id: `code-${m.id}-${m.customer_code ?? ''}`,
        kind: 'code',
        title: t('notif.code_missing', { name, code: m.customer_code ?? '' }),
        text: t('notif.code_missing_text'),
        link: '/health',
        createdAt: now,
        severity: 'error',
      });
    }
    const warnAt = m.paper_warn_remaining ?? 30;
    if (typeof m.paper_remaining === 'number' && m.paper_remaining <= warnAt) {
      out.push({
        id: `paper-${m.id}-${day}`,
        kind: 'paper',
        title: t('notif.paper_low', { name }),
        text: t('notif.paper_low_text', { count: m.paper_remaining }),
        link: '/health',
        createdAt: now,
        severity: 'warning',
      });
    }
    // Ausgefallene Geräte: Messung oder Protokoll meldet "down". Gleiche
    // Klarnamen (Messung + Protokoll) nur einmal.
    const seen = new Set<string>();
    for (const d of [...(m.probes ?? []), ...(m.devices ?? [])]) {
      if (d.status !== 'down') continue;
      const device = benenne(d.name).klar;
      if (seen.has(device)) continue;
      seen.add(device);
      const detail = (d as { plain?: string | null }).plain || d.detail || null;
      out.push({
        id: `fault-${m.id}-${device}-${day}`,
        kind: 'fault',
        title: t('notif.device_fault', { device, name }),
        text: detail || t('notif.device_fault_text'),
        link: '/health',
        createdAt: now,
        severity: 'error',
      });
    }
    for (const c of m.coin_warnings ?? []) {
      if (c.stufe !== 'leer') continue;
      out.push({
        id: `coins-${m.id}-${c.cent}-${day}`,
        kind: 'coins',
        title: t('notif.coins_empty', { name }),
        text: c.text,
        link: '/health',
        createdAt: now,
        severity: 'warning',
      });
    }
  }
  return out;
}

async function supportItems(parkId: string): Promise<FeedItem[]> {
  const { data, error } = await invokeEdgeFunction<{
    messages: { id: string; author_role: string; message: string; created_at: string; ticket_subject?: string | null }[];
  }>('support-tickets', { useSessionAuth: true, query: { park_id: parkId, recent_messages: '1' } });
  if (error) return [];
  return (data?.messages ?? [])
    .filter((m) => m.author_role === 'support')
    .map((m) => ({
      id: `support-${m.id}`,
      kind: 'support' as const,
      title: m.ticket_subject ? t('notif.support_reply_subject', { subject: m.ticket_subject }) : t('notif.support_reply'),
      text: m.message,
      link: '/tickets',
      createdAt: m.created_at,
      severity: 'info' as const,
    }));
}

function storageKey(userId: string, parkId: string) {
  return `lp-notifications:${userId}:${parkId}`;
}

function loadStored(key: string): Stored {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      return { items: parsed.items ?? [], read: parsed.read ?? [], trash: parsed.trash ?? {}, deleted: parsed.deleted ?? [] };
    }
  } catch {
    // nicht lesbar - neu anfangen
  }
  return { items: [], read: [], trash: {}, deleted: [] };
}

function saveStored(key: string, value: Stored) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll/gesperrt - Zustand gilt dann nur für diese Sitzung
  }
}

export function useNotificationFeed(userId: string | null | undefined, parkId: string | null | undefined) {
  const key = userId && parkId ? storageKey(userId, parkId) : null;
  const [stored, setStored] = useState<Stored>({ items: [], read: [], trash: {}, deleted: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (key) setStored(loadStored(key));
  }, [key]);

  const update = useCallback(
    (fn: (prev: Stored) => Stored) => {
      setStored((prev) => {
        const next = fn(prev);
        if (key) saveStored(key, next);
        return next;
      });
    },
    [key],
  );

  const refresh = useCallback(async () => {
    if (!parkId || !key) return;
    setLoading(true);
    const [machines, support] = await Promise.all([
      machineItems(parkId).catch(() => []),
      supportItems(parkId).catch(() => []),
    ]);
    const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
    update((prev) => {
      const known = new Map(prev.items.map((i) => [i.id, i]));
      for (const item of [...machines, ...support]) {
        // Erstmals gesehen: Zeitpunkt festhalten, damit er nicht bei jedem
        // Abruf auf "jetzt" springt. Texte dürfen sich aktualisieren.
        const old = known.get(item.id);
        known.set(item.id, old ? { ...item, createdAt: old.createdAt } : item);
      }
      const items = [...known.values()]
        .filter((i) => new Date(i.createdAt).getTime() >= cutoff && !prev.deleted.includes(i.id))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_ITEMS);
      return { ...prev, items };
    });
    setLoading(false);
  }, [parkId, key, update]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const lists = useMemo(() => {
    const inbox = stored.items.filter((i) => !(i.id in stored.trash));
    return {
      all: inbox,
      unread: inbox.filter((i) => !stored.read.includes(i.id)),
      trash: stored.items.filter((i) => i.id in stored.trash),
    };
  }, [stored]);

  return {
    ...lists,
    loading,
    refresh,
    isRead: (id: string) => stored.read.includes(id),
    markRead: (id: string, read = true) =>
      update((p) => ({ ...p, read: read ? [...new Set([...p.read, id])] : p.read.filter((x) => x !== id) })),
    markAllRead: () => update((p) => ({ ...p, read: [...new Set([...p.read, ...p.items.map((i) => i.id)])] })),
    moveToTrash: (id: string) => update((p) => ({ ...p, trash: { ...p.trash, [id]: Date.now() }, read: [...new Set([...p.read, id])] })),
    restore: (id: string) =>
      update((p) => {
        const trash = { ...p.trash };
        delete trash[id];
        return { ...p, trash };
      }),
    deleteForever: (id: string) =>
      update((p) => {
        const trash = { ...p.trash };
        delete trash[id];
        return { ...p, trash, items: p.items.filter((i) => i.id !== id), deleted: [...p.deleted, id].slice(-300) };
      }),
    emptyTrash: () =>
      update((p) => {
        const ids = Object.keys(p.trash);
        return { ...p, trash: {}, items: p.items.filter((i) => !ids.includes(i.id)), deleted: [...p.deleted, ...ids].slice(-300) };
      }),
  };
}

export type NotificationFeed = ReturnType<typeof useNotificationFeed>;
