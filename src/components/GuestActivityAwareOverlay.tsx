import type { ReactNode } from 'react';
import { usePark } from '../contexts/ParkContext';
import ComingSoonOverlay from './ComingSoonOverlay';

// The Benutzer page is still "Coming Soon" everywhere except CSS-ALPINE/
// Tarzans - that's the only park with real guest data on it so far (the
// passwordless leaderboard/profile system, see operator-guest-activity).
// Every other park keeps the exact same overlay as before.
const TARZANS_PARK_ID = 'e2da6436-6a83-4c39-add3-5f99eb6bd897';

export default function GuestActivityAwareOverlay({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const { parkId } = usePark();

  if (parkId === TARZANS_PARK_ID) {
    return <>{children}</>;
  }

  return <ComingSoonOverlay description={description}>{children}</ComingSoonOverlay>;
}
