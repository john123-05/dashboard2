import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Type, ImagePlus, Trash2, Loader2, Download, Square, Circle, Minus, Frame, Image as ImgIcon } from 'lucide-react';

// Canva-style overlay editor, dependency-free: HTML/CSS for live editing, the
// Canvas API for the transparent-PNG export. No external library, so it always
// builds on bolt.

type Base = { id: string; x: number; y: number };
type TextEl = Base & { type: 'text'; text: string; fontSize: number; fill: string; fontFamily: string };
type ImageEl = Base & { type: 'image'; width: number; height: number };
type RectEl = Base & { type: 'rect'; width: number; height: number; fill: string; stroke: string; strokeWidth: number; radius: number };
type EllipseEl = Base & { type: 'ellipse'; width: number; height: number; fill: string; stroke: string; strokeWidth: number };
type LineEl = Base & { type: 'line'; width: number; stroke: string; strokeWidth: number };
type FrameEl = Base & { type: 'frame'; width: number; height: number; stroke: string; strokeWidth: number; radius: number };
type El = TextEl | ImageEl | RectEl | EllipseEl | LineEl | FrameEl;

const FORMATS = [
  { id: '4:3', label: '4:3 (Standard)', w: 1600, h: 1200 },
  { id: '3:2', label: '3:2', w: 1620, h: 1080 },
  { id: '16:9', label: '16:9 (Breit)', w: 1920, h: 1080 },
  { id: '1:1', label: '1:1 (Quadrat)', w: 1080, h: 1080 },
];
const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS'];
const FRAME_PRESETS = [
  { label: 'Dünn', strokeWidth: 6, radius: 0 },
  { label: 'Dick', strokeWidth: 18, radius: 0 },
  { label: 'Abgerundet', strokeWidth: 12, radius: 40 },
];
const DISPLAY_W = 600;
const CHECKER = 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 20px 20px';

function hasWH(el: El): el is ImageEl | RectEl | EllipseEl | FrameEl {
  return el.type === 'image' || el.type === 'rect' || el.type === 'ellipse' || el.type === 'frame';
}

export default function OverlayBuilder({
  onSave,
  saving,
  previewUrl,
}: {
  onSave: (file: File) => void | Promise<void>;
  saving?: boolean;
  previewUrl?: string | null;
}) {
  const [formatId, setFormatId] = useState('4:3');
  const format = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const displayH = Math.round(DISPLAY_W * (format.h / format.w));

  const [els, setEls] = useState<El[]>([]);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const previewShellRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; of: number } | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  const selected = els.find((e) => e.id === selectedId) ?? null;
  const scaledHeight = Math.round(displayH * canvasScale);

  useEffect(() => {
    const node = previewShellRef.current;
    if (!node) return;

    const updateScale = () => {
      const availableWidth = node.clientWidth;
      if (!availableWidth) return;
      setCanvasScale(Math.min(1, availableWidth / DISPLAY_W));
    };

    updateScale();

    const observer = new ResizeObserver(() => updateScale());
    observer.observe(node);
    window.addEventListener('resize', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  function update(id: string, patch: Partial<Record<string, unknown>>) {
    setEls((p) => p.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)));
  }
  function patchSel(patch: Partial<Record<string, unknown>>) {
    if (selectedId) update(selectedId, patch);
  }

  function onMove(ev: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.sx;
    const dy = ev.clientY - d.sy;
    setEls((p) =>
      p.map((el) => {
        if (el.id !== d.id) return el;
        if (d.mode === 'move') return { ...el, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) };
        // resize
        if (el.type === 'text') return { ...el, fontSize: Math.max(8, Math.round(d.of + dy)) };
        if (el.type === 'line') return { ...el, width: Math.max(10, Math.round(d.ow + dx)) };
        if (hasWH(el)) return { ...el, width: Math.max(16, Math.round(d.ow + dx)), height: Math.max(16, Math.round(d.oh + dy)) };
        return el;
      }),
    );
  }
  function onUp() {
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  function startDrag(ev: ReactPointerEvent, el: El, mode: 'move' | 'resize') {
    ev.stopPropagation();
    setSelectedId(el.id);
    drag.current = {
      id: el.id,
      mode,
      sx: ev.clientX,
      sy: ev.clientY,
      ox: el.x,
      oy: el.y,
      ow: 'width' in el ? el.width : 0,
      oh: hasWH(el) ? el.height : 0,
      of: el.type === 'text' ? el.fontSize : 0,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const cx = Math.round(DISPLAY_W * 0.3);
  const cy = Math.round(displayH * 0.4);
  const add = (el: El) => {
    setEls((p) => [...p, el]);
    setSelectedId(el.id);
  };
  const uid = () => crypto.randomUUID();

  function addText() {
    add({ id: uid(), type: 'text', x: cx, y: cy, text: 'Dein Text', fontSize: 34, fill: '#ffffff', fontFamily: 'Arial' });
  }
  function addRect() {
    add({ id: uid(), type: 'rect', x: cx, y: cy, width: 240, height: 90, fill: '#f97316', stroke: '#ffffff', strokeWidth: 0, radius: 8 });
  }
  function addEllipse() {
    add({ id: uid(), type: 'ellipse', x: cx, y: cy, width: 140, height: 140, fill: '#0ea5e9', stroke: '#ffffff', strokeWidth: 0 });
  }
  function addLine() {
    add({ id: uid(), type: 'line', x: cx, y: cy, width: 260, stroke: '#ffffff', strokeWidth: 6 });
  }
  function addFrame(preset: (typeof FRAME_PRESETS)[number]) {
    add({ id: uid(), type: 'frame', x: 20, y: 20, width: DISPLAY_W - 40, height: displayH - 40, stroke: '#ffffff', strokeWidth: preset.strokeWidth, radius: preset.radius });
  }
  function addImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const id = uid();
        const scale = Math.min((DISPLAY_W * 0.45) / img.width, (displayH * 0.45) / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        setImages((m) => ({ ...m, [id]: img }));
        add({ id, type: 'image', x: Math.round((DISPLAY_W - w) / 2), y: Math.round((displayH - h) / 2), width: w, height: h });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function deleteSel() {
    if (!selectedId) return;
    setEls((p) => p.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }
  function bringForward() {
    if (!selectedId) return;
    setEls((p) => {
      const i = p.findIndex((e) => e.id === selectedId);
      if (i < 0 || i === p.length - 1) return p;
      const n = [...p];
      [n[i], n[i + 1]] = [n[i + 1], n[i]];
      return n;
    });
  }

  async function handleExport() {
    const scale = format.w / DISPLAY_W;
    const canvas = document.createElement('canvas');
    canvas.width = format.w;
    canvas.height = format.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const anyCtx = ctx as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      const rad = Math.min(r * scale, w / 2, h / 2);
      ctx.beginPath();
      if (typeof anyCtx.roundRect === 'function') anyCtx.roundRect(x, y, w, h, rad);
      else ctx.rect(x, y, w, h);
      ctx.closePath();
    };
    for (const el of els) {
      if (el.type === 'image') {
        const img = images[el.id];
        if (img) ctx.drawImage(img, el.x * scale, el.y * scale, el.width * scale, el.height * scale);
      } else if (el.type === 'text') {
        ctx.save();
        ctx.font = `bold ${el.fontSize * scale}px ${el.fontFamily}, sans-serif`;
        ctx.fillStyle = el.fill;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 3 * scale;
        el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x * scale, (el.y + i * el.fontSize * 1.25) * scale));
        ctx.restore();
      } else if (el.type === 'rect') {
        rr(el.x * scale, el.y * scale, el.width * scale, el.height * scale, el.radius);
        ctx.fillStyle = el.fill;
        ctx.fill();
        if (el.strokeWidth > 0) {
          ctx.lineWidth = el.strokeWidth * scale;
          ctx.strokeStyle = el.stroke;
          ctx.stroke();
        }
      } else if (el.type === 'frame') {
        rr(el.x * scale, el.y * scale, el.width * scale, el.height * scale, el.radius);
        ctx.lineWidth = el.strokeWidth * scale;
        ctx.strokeStyle = el.stroke;
        ctx.stroke();
      } else if (el.type === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((el.x + el.width / 2) * scale, (el.y + el.height / 2) * scale, (el.width / 2) * scale, (el.height / 2) * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = el.fill;
        ctx.fill();
        if (el.strokeWidth > 0) {
          ctx.lineWidth = el.strokeWidth * scale;
          ctx.strokeStyle = el.stroke;
          ctx.stroke();
        }
      } else if (el.type === 'line') {
        ctx.fillStyle = el.stroke;
        ctx.fillRect(el.x * scale, el.y * scale, el.width * scale, el.strokeWidth * scale);
      }
    }
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    await onSave(new File([blob], `overlay-${Date.now()}.png`, { type: 'image/png' }));
  }

  function elStyle(el: El): CSSProperties {
    const sel = selectedId === el.id;
    const base: CSSProperties = { position: 'absolute', left: el.x, top: el.y, cursor: 'move', outline: sel ? '2px solid #f97316' : 'none', outlineOffset: 2 };
    if (el.type === 'text') return { ...base, fontSize: el.fontSize, color: el.fill, fontFamily: `${el.fontFamily}, sans-serif`, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'pre', textShadow: '0 1px 3px rgba(0,0,0,0.45)' };
    if (el.type === 'rect') return { ...base, width: el.width, height: el.height, background: el.fill, border: el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : 'none', borderRadius: el.radius };
    if (el.type === 'ellipse') return { ...base, width: el.width, height: el.height, background: el.fill, border: el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : 'none', borderRadius: '50%' };
    if (el.type === 'frame') return { ...base, width: el.width, height: el.height, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.radius, background: 'transparent' };
    if (el.type === 'line') return { ...base, width: el.width, height: el.strokeWidth, background: el.stroke };
    return { ...base, width: (el as ImageEl).width, height: (el as ImageEl).height };
  }

  const ToolBtn = ({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Type; label: string }) => (
    <button onClick={onClick} className="glass-button-secondary flex w-full items-center justify-center gap-1.5 text-sm sm:w-auto">
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className="glass-input w-full text-sm sm:w-auto">
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <ToolBtn onClick={addText} icon={Type} label="Text" />
          <ToolBtn onClick={() => fileRef.current?.click()} icon={ImagePlus} label="Bild" />
          <ToolBtn onClick={addRect} icon={Square} label="Balken" />
          <ToolBtn onClick={addEllipse} icon={Circle} label="Kreis" />
          <ToolBtn onClick={addLine} icon={Minus} label="Linie" />
          {previewUrl && (
            <button onClick={() => setShowPhoto((v) => !v)} className={`glass-button-secondary flex items-center gap-1.5 text-sm ${showPhoto ? 'ring-2 ring-brand-500' : ''}`}>
              <ImgIcon className="h-4 w-4" /> Foto
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addImageFromFile(f); e.target.value = ''; }} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Rahmen:</span>
          {FRAME_PRESETS.map((fp) => (
            <button key={fp.label} onClick={() => addFrame(fp)} className="flex items-center gap-1 rounded-lg bg-white/40 px-2.5 py-1 hover:bg-white/70">
              <Frame className="h-3.5 w-3.5" /> {fp.label}
            </button>
          ))}
        </div>

        <div ref={previewShellRef} className="w-full overflow-hidden">
          <div style={{ height: scaledHeight }} className="relative w-full overflow-hidden rounded-xl">
            <div
              className="relative select-none overflow-hidden rounded-xl shadow-inner"
              style={{
                width: DISPLAY_W,
                height: displayH,
                background: CHECKER,
                transform: `scale(${canvasScale})`,
                transformOrigin: 'top left',
              }}
              onPointerDown={() => setSelectedId(null)}
            >
              {showPhoto && previewUrl && (
                <img src={previewUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
              )}
              {els.map((el) => (
                <div key={el.id} onPointerDown={(e) => startDrag(e, el, 'move')} style={elStyle(el)}>
                  {el.type === 'text' && el.text}
                  {el.type === 'image' && <img src={images[el.id]?.src} alt="" draggable={false} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />}
                  {selectedId === el.id && (
                    <div
                      onPointerDown={(e) => startDrag(e, el, 'resize')}
                      style={{ position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, borderRadius: 8, background: '#f97316', border: '2px solid #fff', cursor: 'nwse-resize' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">Element anklicken, ziehen zum Verschieben, am orangen Punkt skalieren. Karierter Bereich = transparent.</p>
      </div>

      <div className="space-y-3">
        {selected ? (
          <div className="space-y-3 rounded-xl bg-white/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Element</p>
              <div className="flex gap-2">
                <button onClick={bringForward} className="text-xs text-slate-500 hover:text-slate-800">Nach vorne</button>
                <button onClick={deleteSel} className="flex items-center gap-1 text-xs text-rose-600"><Trash2 className="h-3.5 w-3.5" />Löschen</button>
              </div>
            </div>

            {selected.type === 'text' && (
              <>
                <textarea value={selected.text} onChange={(e) => patchSel({ text: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-sm" />
                <select value={selected.fontFamily} onChange={(e) => patchSel({ fontFamily: e.target.value })} className="glass-input w-full text-sm">
                  {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
                <label className="block text-xs text-slate-500">Größe: {selected.fontSize}px
                  <input type="range" min={12} max={200} value={selected.fontSize} onChange={(e) => patchSel({ fontSize: Number(e.target.value) })} className="w-full" />
                </label>
                <ColorRow label="Farbe" value={selected.fill} onChange={(v) => patchSel({ fill: v })} />
              </>
            )}

            {(selected.type === 'rect' || selected.type === 'ellipse') && (
              <>
                <ColorRow label="Füllung" value={selected.fill} onChange={(v) => patchSel({ fill: v })} />
                <ColorRow label="Rand" value={selected.stroke} onChange={(v) => patchSel({ stroke: v })} />
                <label className="block text-xs text-slate-500">Randstärke: {selected.strokeWidth}px
                  <input type="range" min={0} max={40} value={selected.strokeWidth} onChange={(e) => patchSel({ strokeWidth: Number(e.target.value) })} className="w-full" />
                </label>
                {selected.type === 'rect' && (
                  <label className="block text-xs text-slate-500">Ecken-Rundung: {selected.radius}px
                    <input type="range" min={0} max={120} value={selected.radius} onChange={(e) => patchSel({ radius: Number(e.target.value) })} className="w-full" />
                  </label>
                )}
              </>
            )}

            {selected.type === 'frame' && (
              <>
                <ColorRow label="Farbe" value={selected.stroke} onChange={(v) => patchSel({ stroke: v })} />
                <label className="block text-xs text-slate-500">Stärke: {selected.strokeWidth}px
                  <input type="range" min={1} max={60} value={selected.strokeWidth} onChange={(e) => patchSel({ strokeWidth: Number(e.target.value) })} className="w-full" />
                </label>
                <label className="block text-xs text-slate-500">Ecken-Rundung: {selected.radius}px
                  <input type="range" min={0} max={200} value={selected.radius} onChange={(e) => patchSel({ radius: Number(e.target.value) })} className="w-full" />
                </label>
              </>
            )}

            {selected.type === 'line' && (
              <>
                <ColorRow label="Farbe" value={selected.stroke} onChange={(v) => patchSel({ stroke: v })} />
                <label className="block text-xs text-slate-500">Dicke: {selected.strokeWidth}px
                  <input type="range" min={1} max={60} value={selected.strokeWidth} onChange={(e) => patchSel({ strokeWidth: Number(e.target.value) })} className="w-full" />
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white/30 p-4 text-xs text-slate-400">Element hinzufügen und anklicken, um Farbe, Größe, Schrift und mehr zu ändern.</div>
        )}

        <button onClick={handleExport} disabled={saving || els.length === 0} className="glass-button-primary flex w-full items-center justify-center gap-2 text-sm disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Als Overlay speichern
        </button>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-slate-500">{label}</label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-12 cursor-pointer rounded" />
    </div>
  );
}
