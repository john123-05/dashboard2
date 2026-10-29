// Akzentfarbe je Park für Dashboard-Vorschauen (CRM Umfrage/Social), damit die
// Vorschau nicht immer wie Imst (Gold) aussieht, auch wenn der gewählte Park
// (z.B. Tarzans) auf seiner echten Claim-Seite eine andere Markenfarbe hat.
const PARK_ACCENT_COLOR: Record<string, string> = {
  '85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14': '#C6A233', // Imster Bergbahnen (Gold)
  'e2da6436-6a83-4c39-add3-5f99eb6bd897': '#0099CC', // CSS-Alpine / Tarzans (Blau)
  '3b08e092-beb5-46ec-9811-5698e86dd83a': '#0B2545', // Plose (Navy)
  '25c1022b-4e2e-4fc4-b54d-72a4ced2522b': '#30A85B', // Gruenberg-Flitzer (Gruen)
  '91902231-5950-471b-8cc9-a03833f2a318': '#CA004A', // Serlesblitz Mieders (Serles-Rot)
  '56f864d0-1852-4baf-8167-a51fde746315': '#3D5732', // Spielpark Wingst (Dunkelgruen)
  'fc83d745-b110-4b49-a54c-0190e6c7fb34': '#21902F', // Tom der Tiger (Dschungelgruen)
  '36b887eb-7c89-4b45-a23f-095a6e6251fa': '#326061', // Allwetterrodelbahn Weißenfels (Petrol)
  'd19fe7a0-2792-407c-b3d6-51ed574cf16c': '#AC371F', // Sommerrodelbahn Bad Doberan (Rostrot)
  '76bf4501-b43b-49ca-8810-b83bcaaf2e55': '#3E86A6', // Edelwies Erlebnispark (Blau)
  'cf1cec77-0a10-4f64-837b-4c4453e07011': '#BE0A26', // Rodelpark Oderwitz (Rot)
  'bc8249b1-acb2-48f0-a736-f53f23e5edd6': '#D3201F', // Rodelbahn Fräkigaudi (Rot)
  '3eed6a5a-eca7-4097-90c2-45c64919e222': '#00403E', // Inselrodelbahn Bergen (Dunkelgrün)
};

const DEFAULT_ACCENT_COLOR = '#C6A233';

export function accentColorForPark(parkId: string | null | undefined): string {
  if (!parkId) return DEFAULT_ACCENT_COLOR;
  return PARK_ACCENT_COLOR[parkId] ?? DEFAULT_ACCENT_COLOR;
}

// Gold/Hellblau brauchen dunklen Text, ein dunkles Navy (Plose) braucht
// weissen - sonst ist der Vorschau-Button-Text unlesbar. Einfache
// Helligkeitsschaetzung (YIQ) statt eine zweite feste Liste zu pflegen.
export function accentTextColorForPark(parkId: string | null | undefined): string {
  const hex = accentColorForPark(parkId).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#0f172a' : '#ffffff';
}
