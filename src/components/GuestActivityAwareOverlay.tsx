import type { ReactNode } from 'react';
import { usePark } from '../contexts/ParkContext';
import ComingSoonOverlay from './ComingSoonOverlay';

// The Benutzer page is still "Coming Soon" everywhere except the parks that
// actually have real guest data (the passwordless leaderboard/profile
// system, see operator-guest-activity): CSS-ALPINE/Tarzans and Plose so far.
// Every other park keeps the exact same overlay as before.
const GUEST_ACTIVITY_PARK_IDS = new Set([
  'e2da6436-6a83-4c39-add3-5f99eb6bd897', // CSS-ALPINE / Tarzans
  '3b08e092-beb5-46ec-9811-5698e86dd83a', // Plose
]);

export default function GuestActivityAwareOverlay({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const { parkId } = usePark();

  if (parkId && GUEST_ACTIVITY_PARK_IDS.has(parkId)) {
    return <>{children}</>;
  }

  return <ComingSoonOverlay description={description}>{children}</ComingSoonOverlay>;
}
