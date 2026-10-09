import type { CSSProperties } from 'react';
import { DISPLAY_W, gradientCss, starPoints, type El, type TextEl } from './model';

// Darstellung der Elemente im Browser. Die PNG-Ausgabe (exportPng.ts) zeichnet
// dieselben Werte mit der Canvas-API nach - Änderungen hier dort mitziehen.

export const TEXT_LINE_HEIGHT = 1.2;

export function textStyle(el: TextEl): CSSProperties {
  return {
    fontSize: el.fontSize,
    color: el.fill,
    fontFamily: `'${el.fontFamily}', sans-serif`,
    fontWeight: el.fontWeight,
    fontStyle: el.italic ? 'italic' : 'normal',
    textAlign: el.align,
    letterSpacing: el.letterSpacing,
    lineHeight: TEXT_LINE_HEIGHT,
    whiteSpace: 'pre',
    textShadow: el.shadow ? '0 1px 3px rgba(0,0,0,0.45)' : undefined,
    WebkitTextStroke: el.strokeWidth > 0 ? `${el.strokeWidth}px ${el.strokeColor}` : undefined,
    paintOrder: 'stroke fill',
    background: el.bgColor ?? undefined,
    padding: el.bgColor ? el.bgPadding : 0,
    borderRadius: el.bgColor ? 6 : 0,
  };
}

/** Lage, Größe, Drehung und Deckkraft des äußeren Kastens. */
export function boxStyle(el: El): CSSProperties {
  const style: CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    opacity: el.opacity,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    transformOrigin: 'center center',
  };
  if (el.type === 'text') return style;
  if (el.type === 'line') return { ...style, width: el.width, height: el.strokeWidth };
  return { ...style, width: el.width, height: el.height };
}

export function ElementBody({ el }: { el: El }) {
  switch (el.type) {
    case 'text':
      return <div style={textStyle(el)}>{el.text}</div>;
    case 'image':
      return (
        <img
          src={el.src}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: el.radius,
            transform: el.flipX ? 'scaleX(-1)' : undefined,
            pointerEvents: 'none',
            display: 'block',
          }}
        />
      );
    case 'rect':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: gradientCss(el),
            borderRadius: el.radius,
            boxShadow: el.strokeWidth ? `inset 0 0 0 ${el.strokeWidth}px ${el.stroke}` : undefined,
          }}
        />
      );
    case 'ellipse':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: el.fill,
            borderRadius: '50%',
            boxShadow: el.strokeWidth ? `inset 0 0 0 ${el.strokeWidth}px ${el.stroke}` : undefined,
          }}
        />
      );
    case 'frame':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: el.radius,
            boxShadow: `inset 0 0 0 ${el.strokeWidth}px ${el.stroke}`,
          }}
        />
      );
    case 'line':
      return <div style={{ width: '100%', height: '100%', background: el.stroke }} />;
    case 'triangle':
    case 'star': {
      const pts =
        el.type === 'triangle'
          ? [[el.width / 2, 0], [el.width, el.height], [0, el.height]]
          : starPoints(el.width, el.height);
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${el.width} ${el.height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
          <polygon points={pts.map((p) => p.join(',')).join(' ')} fill={el.fill} />
        </svg>
      );
    }
  }
}

/** Kleine, statische Vorschau (Vorlagen-Kacheln). */
export function OverlayThumb({ els, height, width }: { els: El[]; height: number; width: number }) {
  const scale = width / DISPLAY_W;
  return (
    <div style={{ width, height: height * scale, position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: DISPLAY_W, height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute' }}>
        {els.map((el) => {
          const style = boxStyle(el);
          if (el.type === 'text' && el.autoAnchor) {
            const shift = el.autoAnchor === 'center' ? '-50%' : '-100%';
            style.transform = `translateX(${shift})`;
          }
          return (
            <div key={el.id} style={style}>
              <ElementBody el={el} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
