export const TOUR_DISABLED_KEY = 'lp-dashboard-tour-disabled';
export const TOUR_SESSION_KEY = 'lp-dashboard-tour-session-shown';

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
