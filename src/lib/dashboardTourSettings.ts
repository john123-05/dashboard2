// Global escape hatch: once set, the tour never auto-shows again for any
// account in this browser (useful when repeatedly creating test accounts).
export const TOUR_DISABLED_KEY = 'lp-dashboard-tour-disabled';

// Per-account tracking: which user IDs have already been shown the tour at
// least once. Keyed by account rather than by browser tab/session, so a
// genuinely new account still sees it even if this browser already has.
const TOUR_SEEN_KEY = 'lp-dashboard-tour-seen-accounts';

export function isTourDisabled(): boolean {
  return window.localStorage.getItem(TOUR_DISABLED_KEY) === 'true';
}

export function setTourDisabled(disabled: boolean): void {
  if (disabled) {
    window.localStorage.setItem(TOUR_DISABLED_KEY, 'true');
    return;
  }
  window.localStorage.removeItem(TOUR_DISABLED_KEY);
}

function readSeenAccounts(): string[] {
  try {
    const raw = window.localStorage.getItem(TOUR_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hasAccountSeenTour(userId: string): boolean {
  return readSeenAccounts().includes(userId);
}

export function markAccountSeenTour(userId: string): void {
  const seen = readSeenAccounts();
  if (!seen.includes(userId)) {
    window.localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify([...seen, userId]));
  }
}
