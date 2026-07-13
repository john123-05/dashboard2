import type { ReactNode } from 'react';
import { usePark } from '../contexts/ParkContext';
import ComingSoonOverlay from './ComingSoonOverlay';

// Self-service/kiosk parks (price_per_photo_cents set on the shared parks
// table, e.g. Imst) have real, working data on this page even though the
// feature is still generally "Coming Soon" for every other park — those
// keep seeing the exact same overlay as before, untouched.
export default function KioskAwareOverlay({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const { isKioskPark, kioskCheckLoading } = usePark();

  if (kioskCheckLoading) {
    return <div className="h-96 animate-pulse rounded-2xl bg-white/30" />;
  }

  if (isKioskPark) {
    return <>{children}</>;
  }

  return <ComingSoonOverlay description={description}>{children}</ComingSoonOverlay>;
}
