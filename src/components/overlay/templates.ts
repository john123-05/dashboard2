import { DISPLAY_W, makeEllipse, makeFrame, makeLine, makeRect, makeText, type El } from './model';

// Fertige Startpunkte für Overlays. Jede Vorlage baut ihre Elemente passend
// zur aktuellen Flächenhöhe, damit sie in jedem Format sitzt.

export type Template = {
  id: string;
  label: string;
  build: (h: number, title: string, tagline: string) => El[];
};

const W = DISPLAY_W;

export const TEMPLATES: Template[] = [
  {
    id: 'frame',
    label: 'builder.tpl_frame',
    build: (h, title) => [
      makeFrame(24, W, h, { strokeWidth: 6 }),
      makeText(W - 48, h - 84, title, 30, { align: 'right', fontWeight: 700, autoAnchor: 'right' }),
    ],
  },
  {
    id: 'banner',
    label: 'builder.tpl_banner',
    build: (h, title, tagline) => [
      makeRect(0, h - 190, W, 190, { fill: 'rgba(0,0,0,0)', gradientTo: '#000000', gradientDir: 'down', radius: 0, opacity: 0.85 }),
      makeText(40, h - 128, title, 48, { fontWeight: 900 }),
      makeText(42, h - 66, tagline, 22, { fontWeight: 400, shadow: false }),
    ],
  },
  {
    id: 'badge',
    label: 'builder.tpl_badge',
    build: (_h, title) => [
      makeText(32, 32, title, 26, { bgColor: '#c2410c', bgPadding: 14, shadow: false, fontWeight: 700 }),
    ],
  },
  {
    id: 'polaroid',
    label: 'builder.tpl_polaroid',
    build: (h, title) => [
      makeFrame(0, W, h, { strokeWidth: 28, x: 0, y: 0, width: W, height: h }),
      makeRect(0, h - 110, W, 110, { fill: '#ffffff', radius: 0 }),
      makeText(W / 2, h - 82, title, 40, { fill: '#1f2933', shadow: false, align: 'center', fontWeight: 700, autoAnchor: 'center' }),
    ],
  },
  {
    id: 'double',
    label: 'builder.tpl_double',
    build: (h, title) => [
      makeFrame(20, W, h, { strokeWidth: 4 }),
      makeFrame(36, W, h, { strokeWidth: 2, opacity: 0.8 }),
      makeLine(W / 2 - 90, h - 92, 180, { strokeWidth: 3 }),
      makeText(W / 2, h - 78, title, 26, { align: 'center', fontWeight: 400, letterSpacing: 4, autoAnchor: 'center' }),
    ],
  },
  {
    id: 'circle',
    label: 'builder.tpl_circle',
    build: (h, title) => [
      makeEllipse(W - 200, h - 200, 160, { fill: '#c2410c', stroke: '#ffffff', strokeWidth: 4 }),
      makeText(W - 120, h - 136, title.slice(0, 14), 22, { shadow: false, align: 'center', fontWeight: 900, autoAnchor: 'center' }),
    ],
  },
];
