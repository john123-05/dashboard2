import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface ParkState {
  parkId: string | null;
  parkName: string | null;
  setPark: (id: string | null, name: string | null) => void;
}

const ParkContext = createContext<ParkState | null>(null);
const STORAGE_KEY = 'selected_park';

export function ParkProvider({ children }: { children: ReactNode }) {
  const [parkId, setParkId] = useState<string | null>(null);
  const [parkName, setParkName] = useState<string | null>(null);

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
    <ParkContext.Provider value={{ parkId, parkName, setPark }}>
      {children}
    </ParkContext.Provider>
  );
}

export function usePark() {
  const ctx = useContext(ParkContext);
  if (!ctx) throw new Error('usePark must be used within ParkProvider');
  return ctx;
}
