// Akzentfarbe je Park für Dashboard-Vorschauen (CRM Umfrage/Social), damit die
// Vorschau nicht immer wie Imst (Gold) aussieht, auch wenn der gewählte Park
// (z.B. Tarzans) auf seiner echten Claim-Seite eine andere Markenfarbe hat.
const PARK_ACCENT_COLOR: Record<string, string> = {
  '85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14': '#C6A233', // Imster Bergbahnen (Gold)
  'e2da6436-6a83-4c39-add3-5f99eb6bd897': '#0099CC', // CSS-Alpine / Tarzans (Blau)
};

const DEFAULT_ACCENT_COLOR = '#C6A233';

export function accentColorForPark(parkId: string | null | undefined): string {
  if (!parkId) return DEFAULT_ACCENT_COLOR;
  return PARK_ACCENT_COLOR[parkId] ?? DEFAULT_ACCENT_COLOR;
}
