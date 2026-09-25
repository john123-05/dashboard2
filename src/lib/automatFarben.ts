// Jeder Automat behält auf allen Seiten dieselbe Farbe (Umsatz-Ring, Zustandskarte).
export const AUTOMAT_FARBEN = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export function automatFarbe(index: number): string {
  return AUTOMAT_FARBEN[index % AUTOMAT_FARBEN.length];
}
