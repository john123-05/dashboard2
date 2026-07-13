import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchKioskSales } from '../lib/kioskSales';

interface ParkState {
  parkId: string | null;
  parkName: string | null;
  setPark: (id: string | null, name: string | null) => void;
  // Self-service/kiosk parks (no webshop, e.g. Imst) have parks.price_per_photo_cents
  // set on the shared project — every consumer that needs to branch on this
  // reads it from here instead of each re-fetching/re-checking independently.
  isKioskPark: boolean;
  kioskPriceCents: number | null;
  kioskTimezone: string;
  kioskCheckLoading: boolean;
}

const ParkContext = createContext<ParkState | null>(null);
const STORAGE_KEY = 'selected_park';

export function ParkProvider({ children }: { children: ReactNode }) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [parkName, setParkName] = useState<string | null>(null);
  const [isKioskPark, setIsKioskPark] = useState(false);
  const [kioskPriceCents, setKioskPriceCents] = useState<number | null>(null);
  const [kioskTimezone, setKioskTimezone] = useState('Europe/Vienna');
  const [kioskCheckLoading, setKioskCheckLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { id: string; name: string };
        setParkId(parsed.id);
        setParkName(parsed.name);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setKioskCheckLoading(true);

    if (!parkId) {
      setIsKioskPark(false);
      setKioskPriceCents(null);
      setKioskCheckLoading(false);
      return;
    }

    fetchKioskSales(parkId)
      .then((result) => {
        if (cancelled) return;
        setIsKioskPark(result.isKioskPark);
        setKioskPriceCents(result.priceCents);
        setKioskTimezone(result.timezone ?? 'Europe/Vienna');
      })
      .catch(() => {
        if (cancelled) return;
        setIsKioskPark(false);
        setKioskPriceCents(null);
      })
      .finally(() => {
        if (!cancelled) setKioskCheckLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [parkId]);

  const setPark = (id: string | null, name: string | null) => {
    setParkId(id);
    setParkName(name);
    if (id && name) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <ParkContext.Provider
      value={{ parkId, parkName, setPark, isKioskPark, kioskPriceCents, kioskTimezone, kioskCheckLoading }}
    >
      {children}
    </ParkContext.Provider>
  );
}

export function usePark() {
  const ctx = useContext(ParkContext);
  if (!ctx) throw new Error('usePark must be used within ParkProvider');
  return ctx;
}
