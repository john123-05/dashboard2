// Datenmodell des Overlay-Studios (src/components/OverlayBuilder.tsx).
// Alle Koordinaten leben in einem Entwurfsraster mit fester Breite DISPLAY_W;
// beim Export wird auf die echte Formatbreite hochgerechnet.

export const DISPLAY_W = 900;

type Base = {
  id: string;
  x: number;
  y: number;
  opacity: number;
  /** Drehung in Grad, um die Mitte des Elements. */
  rotation: number;
  hidden?: boolean;
  locked?: boolean;
};

export type TextEl = Base & {
  type: 'text';
  text: string;
  fontSize: number;
  fill: string;
  fontFamily: string;
  fontWeight: 400 | 700 | 900;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  letterSpacing: number;
  shadow: boolean;
  strokeColor: string;
  strokeWidth: number;
  /** Farbfläche hinter dem Text, null = keine. */
  bgColor: string | null;
  bgPadding: number;
  /** Nur beim Einfügen aus Vorlagen: x ist Mitte bzw. rechte Kante. Das Studio
   *  rechnet es nach dem ersten Messen in eine linke Kante um und löscht es. */
  autoAnchor?: 'center' | 'right';
};

export type ImageEl = Base & {
  type: 'image';
  width: number;
  height: number;
  src: string;
  /** Pfad in der Ablage, damit ein Entwurf die (ablaufende) URL neu holen kann. */
  storagePath?: string;
  radius: number;
  flipX: boolean;
};

export type GradientDir = 'down' | 'up' | 'right' | 'left';

export type RectEl = Base & {
  type: 'rect';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  /** Verlauf von `fill` nach `gradientTo`; null = einfarbig. */
  gradientTo: string | null;
  gradientDir: GradientDir;
};

export type EllipseEl = Base & {
  type: 'ellipse';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type TriangleEl = Base & { type: 'triangle'; width: number; height: number; fill: string };
export type StarEl = Base & { type: 'star'; width: number; height: number; fill: string };
export type LineEl = Base & { type: 'line'; width: number; stroke: string; strokeWidth: number };
export type FrameEl = Base & {
  type: 'frame';
  width: number;
  height: number;
  stroke: string;
  strokeWidth: number;
  radius: number;
};

export type El = TextEl | ImageEl | RectEl | EllipseEl | TriangleEl | StarEl | LineEl | FrameEl;
export type BoxEl = Exclude<El, TextEl | LineEl>;

export function hasBox(el: El): el is BoxEl {
  return el.type !== 'text' && el.type !== 'line';
}

export type Format = { id: string; label: string; w: number; h: number };

// 4:3 in der Auflösung, die der Automat für Foto-Overlays erwartet
// (siehe branding.slot.overlay_tip).
export const FORMATS: Format[] = [
  { id: '4:3', label: 'builder.fmt_standard', w: 2362, h: 1772 },
  { id: '3:2', label: '3:2', w: 1620, h: 1080 },
  { id: '16:9', label: 'builder.fmt_wide', w: 1920, h: 1080 },
  { id: '1:1', label: 'builder.fmt_square', w: 1080, h: 1080 },
  { id: '3:4', label: 'builder.fmt_portrait', w: 1200, h: 1600 },
  { id: '9:16', label: 'builder.fmt_story', w: 1080, h: 1920 },
];

export function displayHeight(format: Format) {
  return Math.round(DISPLAY_W * (format.h / format.w));
}

/** Format mit dem Seitenverhältnis, das einem Bild am nächsten kommt. */
export function closestFormat(width: number, height: number): Format {
  const ratio = width / height;
  return FORMATS.reduce((best, f) =>
    Math.abs(f.w / f.h - ratio) < Math.abs(best.w / best.h - ratio) ? f : best,
  );
}

export const FONTS = [
  'Lexend Deca',
  'Arial',
  'Helvetica',
  'Verdana',
  'Trebuchet MS',
  'Tahoma',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Impact',
];

export const SWATCHES = ['#ffffff', '#000000', '#1f2933', '#c2410c', '#f97316', '#facc15', '#16a34a', '#0ea5e9', '#7c3aed', '#e11d48'];

export const uid = () => crypto.randomUUID();

const base = (x: number, y: number) => ({ id: uid(), x, y, opacity: 1, rotation: 0 });

export function makeText(x: number, y: number, text: string, fontSize: number, extra: Partial<TextEl> = {}): TextEl {
  return {
    ...base(x, y),
    type: 'text',
    text,
    fontSize,
    fill: '#ffffff',
    fontFamily: 'Lexend Deca',
    fontWeight: 700,
    italic: false,
    align: 'left',
    letterSpacing: 0,
    shadow: true,
    strokeColor: '#000000',
    strokeWidth: 0,
    bgColor: null,
    bgPadding: 12,
    ...extra,
  };
}

export function makeRect(x: number, y: number, width: number, height: number, extra: Partial<RectEl> = {}): RectEl {
  return {
    ...base(x, y),
    type: 'rect',
    width,
    height,
    fill: '#c2410c',
    stroke: '#ffffff',
    strokeWidth: 0,
    radius: 8,
    gradientTo: null,
    gradientDir: 'down',
    ...extra,
  };
}

export function makeEllipse(x: number, y: number, size: number, extra: Partial<EllipseEl> = {}): EllipseEl {
  return { ...base(x, y), type: 'ellipse', width: size, height: size, fill: '#0ea5e9', stroke: '#ffffff', strokeWidth: 0, ...extra };
}

export function makeTriangle(x: number, y: number, size: number): TriangleEl {
  return { ...base(x, y), type: 'triangle', width: size, height: Math.round(size * 0.87), fill: '#facc15' };
}

export function makeStar(x: number, y: number, size: number): StarEl {
  return { ...base(x, y), type: 'star', width: size, height: size, fill: '#facc15' };
}

export function makeLine(x: number, y: number, width: number, extra: Partial<LineEl> = {}): LineEl {
  return { ...base(x, y), type: 'line', width, stroke: '#ffffff', strokeWidth: 6, ...extra };
}

export function makeFrame(inset: number, w: number, h: number, extra: Partial<FrameEl> = {}): FrameEl {
  return {
    ...base(inset, inset),
    type: 'frame',
    width: w - inset * 2,
    height: h - inset * 2,
    stroke: '#ffffff',
    strokeWidth: 8,
    radius: 0,
    ...extra,
  };
}

export function makeImage(x: number, y: number, width: number, height: number, src: string, storagePath?: string): ImageEl {
  return { ...base(x, y), type: 'image', width, height, src, storagePath, radius: 0, flipX: false };
}

/** Punkte eines fünfzackigen Sterns in einer Box (0..w, 0..h). */
export function starPoints(w: number, h: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? 0.5 : 0.2;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([w / 2 + Math.cos(a) * r * w, h / 2 + Math.sin(a) * r * h * 1.05]);
  }
  return pts;
}

export function gradientCss(el: RectEl) {
  if (!el.gradientTo) return el.fill;
  const dir = { down: 'to bottom', up: 'to top', right: 'to right', left: 'to left' }[el.gradientDir];
  return `linear-gradient(${dir}, ${el.fill}, ${el.gradientTo})`;
}
