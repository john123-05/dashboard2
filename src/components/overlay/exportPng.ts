import { DISPLAY_W, starPoints, type El, type Format, type RectEl } from './model';
import { TEXT_LINE_HEIGHT } from './render';

// Zeichnet die Elemente als PNG in Formatauflösung. Spiegelt render.tsx -
// wer dort die Darstellung ändert, ändert sie hier mit.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Bilder aus der Ablage kommen von einer anderen Domain; ohne CORS-Anfrage
    // wäre die Zeichenfläche danach "verunreinigt" und liesse sich nicht speichern.
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${src.slice(0, 60)}`));
    img.src = src;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function rectFill(ctx: CanvasRenderingContext2D, el: RectEl, w: number, h: number) {
  if (!el.gradientTo) return el.fill;
  const [x0, y0, x1, y1] = {
    down: [0, 0, 0, h],
    up: [0, h, 0, 0],
    right: [0, 0, w, 0],
    left: [w, 0, 0, 0],
  }[el.gradientDir];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, el.fill);
  g.addColorStop(1, el.gradientTo);
  return g;
}

export type Measured = Record<string, { w: number; h: number }>;

export async function exportPng(els: El[], format: Format, measured: Measured, background: string | null): Promise<Blob> {
  const s = format.w / DISPLAY_W;
  const canvas = document.createElement('canvas');
  canvas.width = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, format.w, format.h);
  }

  const visible = els.filter((el) => !el.hidden);
  const images: Record<string, HTMLImageElement> = {};
  await Promise.all(
    visible.map(async (el) => {
      if (el.type === 'image') images[el.id] = await loadImage(el.src);
      if (el.type === 'text') {
        await document.fonts?.load(`${el.fontWeight} ${el.fontSize}px '${el.fontFamily}'`).catch(() => undefined);
      }
    }),
  );

  for (const el of visible) {
    const w = el.type === 'text' ? measured[el.id]?.w ?? 0 : el.width;
    const h = el.type === 'text' ? measured[el.id]?.h ?? 0 : el.type === 'line' ? el.strokeWidth : el.height;

    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.scale(s, s);
    ctx.translate(el.x + w / 2, el.y + h / 2);
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);

    switch (el.type) {
      case 'image': {
        const img = images[el.id];
        if (img) {
          if (el.radius > 0) {
            roundedRect(ctx, 0, 0, w, h, el.radius);
            ctx.clip();
          }
          if (el.flipX) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0, w, h);
        }
        break;
      }
      case 'text': {
        const pad = el.bgColor ? el.bgPadding : 0;
        if (el.bgColor) {
          roundedRect(ctx, 0, 0, w, h, 6);
          ctx.fillStyle = el.bgColor;
          ctx.fill();
        }
        ctx.font = `${el.italic ? 'italic ' : ''}${el.fontWeight} ${el.fontSize}px '${el.fontFamily}', sans-serif`;
        const anyCtx = ctx as unknown as { letterSpacing?: string };
        if ('letterSpacing' in ctx) anyCtx.letterSpacing = `${el.letterSpacing}px`;
        ctx.textAlign = el.align;
        ctx.textBaseline = 'middle';
        const tx = el.align === 'left' ? pad : el.align === 'center' ? w / 2 : w - pad;
        const lh = el.fontSize * TEXT_LINE_HEIGHT;
        el.text.split('\n').forEach((line, i) => {
          const ty = pad + i * lh + lh / 2;
          if (el.strokeWidth > 0) {
            ctx.lineWidth = el.strokeWidth;
            ctx.strokeStyle = el.strokeColor;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, tx, ty);
          }
          if (el.shadow) {
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 1;
          }
          ctx.fillStyle = el.fill;
          ctx.fillText(line, tx, ty);
          ctx.shadowColor = 'transparent';
        });
        break;
      }
      case 'rect': {
        roundedRect(ctx, 0, 0, w, h, el.radius);
        ctx.fillStyle = rectFill(ctx, el, w, h);
        ctx.fill();
        if (el.strokeWidth > 0) {
          const lw = el.strokeWidth;
          roundedRect(ctx, lw / 2, lw / 2, w - lw, h - lw, el.radius - lw / 2);
          ctx.lineWidth = lw;
          ctx.strokeStyle = el.stroke;
          ctx.stroke();
        }
        break;
      }
      case 'frame': {
        const lw = el.strokeWidth;
        roundedRect(ctx, lw / 2, lw / 2, w - lw, h - lw, el.radius - lw / 2);
        ctx.lineWidth = lw;
        ctx.strokeStyle = el.stroke;
        ctx.stroke();
        break;
      }
      case 'ellipse': {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = el.fill;
        ctx.fill();
        if (el.strokeWidth > 0) {
          const lw = el.strokeWidth;
          ctx.beginPath();
          ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - lw / 2), Math.max(0, h / 2 - lw / 2), 0, 0, Math.PI * 2);
          ctx.lineWidth = lw;
          ctx.strokeStyle = el.stroke;
          ctx.stroke();
        }
        break;
      }
      case 'line':
        ctx.fillStyle = el.stroke;
        ctx.fillRect(0, 0, w, h);
        break;
      case 'triangle':
      case 'star': {
        const pts = el.type === 'triangle' ? [[w / 2, 0], [w, h], [0, h]] : starPoints(w, h);
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.fillStyle = el.fill;
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'),
  );
}
