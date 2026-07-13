import { useEffect, useState, type ReactNode } from 'react';
import { usePark } from '../contexts/ParkContext';
import { fetchKioskSales } from '../lib/kioskSales';
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
  const { parkId } = usePark();
  const [isKioskPark, setIsKioskPark] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsKioskPark(null);
    if (!parkId) return;

    fetchKioskSales(parkId)
      .then((result) => {
        if (!cancelled) setIsKioskPark(result.isKioskPark);
      })
      .catch(() => {
        if (!cancelled) setIsKioskPark(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parkId]);

  if (isKioskPark) {
    return <>{children}</>;
  }

  return <ComingSoonOverlay description={description}>{children}</ComingSoonOverlay>;
}
