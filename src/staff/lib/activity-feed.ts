export type ActivityEvent = {
  id: string;
  created_at: string;
  title: string;
  details?: string;
  level?: 'info' | 'success' | 'warning';
};

const ACTIVITY_STORAGE_KEY = 'lp-activity-feed-v1';
const ACTIVITY_EVENT_NAME = 'lp-activity-feed-updated';
const MAX_EVENTS = 80;

function safeParse(raw: string | null): ActivityEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry?.id === 'string' && typeof entry?.title === 'string');
  } catch {
    return [];
  }
}

export function readActivityEvents(): ActivityEvent[] {
  return safeParse(window.localStorage.getItem(ACTIVITY_STORAGE_KEY));
}

export function appendActivityEvent(input: Omit<ActivityEvent, 'id' | 'created_at'>): ActivityEvent {
  const next: ActivityEvent = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    title: input.title,
    details: input.details,
    level: input.level || 'info',
  };

  const current = readActivityEvents();
  const merged = [next, ...current].slice(0, MAX_EVENTS);
  window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT_NAME, { detail: next }));
  return next;
}

export function removeActivityEvent(id: string): void {
  const current = readActivityEvents();
  const next = current.filter((event) => event.id !== id);
  window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT_NAME));
}

export function subscribeActivityEvents(onChange: (events: ActivityEvent[]) => void): () => void {
  const reload = () => onChange(readActivityEvents());
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVITY_STORAGE_KEY) reload();
  };

  window.addEventListener(ACTIVITY_EVENT_NAME, reload as EventListener);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(ACTIVITY_EVENT_NAME, reload as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
