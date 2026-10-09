import type { ReactNode } from 'react';

// The Speedmessung page only has real guest data for the parks that run the
// speed system (passwordless leaderboard/profile, see operator-guest-activity):
// CSS-ALPINE/Tarzans, Plose and Gruenberg so far. Every other park sees the
// same real page - just without data - and the retrofit offer at the bottom.
export const GUEST_ACTIVITY_PARK_IDS = new Set([
  'e2da6436-6a83-4c39-add3-5f99eb6bd897', // CSS-ALPINE / Tarzans
  '3b08e092-beb5-46ec-9811-5698e86dd83a', // Plose
  '25c1022b-4e2e-4fc4-b54d-72a4ced2522b', // Gruenberg-Flitzer
]);

export function hasGuestActivity(parkId: string | null | undefined): boolean {
  return !!parkId && GUEST_ACTIVITY_PARK_IDS.has(parkId);
}

export default function GuestActivityAwareOverlay({ children }: { children: ReactNode }) {

  return <>{children}</>;
}
