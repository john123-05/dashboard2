import { useRef, useState } from 'react';
import { Type, ImagePlus, Trash2, Loader2, Download } from 'lucide-react';

// Dependency-free drag & drop overlay editor: HTML for editing, the Canvas API
// for the transparent-PNG export. No external library, so it always builds.

type TextEl = { id: string; type: 'text'; x: number; y: number; text: string; fontSize: number; fill: string };
type ImageEl = { id: string; type: 'image'; x: number; y: number; width: number; height: number };
type El = TextEl | ImageEl;

const FORMATS = [
  { id: '4:3', label: '4:3 (Standard)', w: 1600, h: 1200 },
  { id: '3:2', label: '3:2', w: 1620, h: 1080 },
  { id: '16:9', label: '16:9 (Breit)', w: 1920, h: 1080 },
  { id: '1:1', label: '1:1 (Quadrat)', w: 1080, h: 1080 },
];
const DISPLAY_W = 600;
const CHECKER = 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 20px 20px';

export default function OverlayBuilder({
  onSave,
  saving,
}: {
  onSave: (file: File) => void | Promise<void>;
  saving?: boolean;
}) {
  const [formatId, setFormatId] = useState('4:3');
  const format = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const displayH = Math.round(DISPLAY_W * (format.h / format.w));

  const [els, setEls] = useState<El[]>([]);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  const selected = els.find((e) => e.id === selectedId) ?? null;
  const selectedText = selected?.type === 'text' ? selected : null;

  function onMove(ev: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.sx;
    const dy = ev.clientY - d.sy;
    setEls((p) =>
      p.map((el) => {
        if (el.id !== d.id) return el;
        if (d.mode === 'move') return { ...el, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) };
        if (el.type === 'image')
          return { ...el, width: Math.max(20, Math.round(d.ow + dx)), height: Math.max(20, Math.round(d.oh + dy)) };
        return el;
      }),
    );
  }
  function onUp() {
    drag.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }
  function startDrag(ev: React.PointerEvent, el: El, mode: 'move' | 'resize') {
    ev.stopPropagation();
    setSelectedId(el.id);
    drag.current = {
      id: el.id,
      mode,
      sx: ev.clientX,
      sy: ev.clientY,
      ox: el.x,
      oy: el.y,
      ow: el.type === 'image' ? el.width : 0,
      oh: el.type === 'image' ? el.height : 0,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function addText() {
    const id = crypto.randomUUID();
    setEls((p) => [...p, { id, type: 'text', x: Math.round(DISPLAY_W * 0.2), y: Math.round(displayH * 0.42), text: 'Dein Text', fontSize: 34, fill: '#ffffff' }]);
    setSelectedId(id);
  }

  function addImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const id = crypto.randomUUID();
        const scale = Math.min((DISPLAY_W * 0.45) / img.width, (displayH * 0.45) / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        setImages((m) => ({ ...m, [id]: img }));
        setEls((p) => [...p, { id, type: 'image', x: Math.round((DISPLAY_W - w) / 2), y: Math.round((displayH - h) / 2), width: w, height: h }]);
        setSelectedId(id);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function patchSel(patch: Partial<TextEl>) {
    if (!selectedId) return;
    setEls((p) => p.map((e) => (e.id === selectedId ? ({ ...e, ...patch } as El) : e)));
  }
  function deleteSel() {
    if (!selectedId) return;
    setEls((p) => p.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  async function handleExport() {
    const scale = format.w / DISPLAY_W;
    const canvas = document.createElement('canvas');
    canvas.width = format.w;
    canvas.height = format.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (const el of els) {
      if (el.type === 'image') {
        const img = images[el.id];
        if (img) ctx.drawImage(img, el.x * scale, el.y * scale, el.width * scale, el.height * scale);
      } else {
        ctx.save();
        ctx.font = `bold ${el.fontSize * scale}px Arial, Helvetica, sans-serif`;
        ctx.fillStyle = el.fill;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 4 * scale;
        el.text.split('\n').forEach((line, i) => {
          ctx.fillText(line, el.x * scale, (el.y + i * el.fontSize * 1.25) * scale);
        });
        ctx.restore();
      }
    }
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await (await fetch(dataUrl)).blob();
    await onSave(new File([blob], `overlay-${Date.now()}.png`, { type: 'image/png' }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)} className="glass-input text-sm">
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <button onClick={addText} className="glass-button-secondary flex items-center gap-1.5 text-sm">
            <Type className="h-4 w-4" /> Text
          </button>
          <button onClick={() => fileRef.current?.click()} className="glass-button-secondary flex items-center gap-1.5 text-sm">
            <ImagePlus className="h-4 w-4" /> Bild / Logo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addImageFromFile(f);
              e.target.value = '';
            }}
          />
          {selected && (
            <button onClick={deleteSel} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" /> Löschen
            </button>
          )}
        </div>

        <div
          className="relative select-none overflow-hidden rounded-xl shadow-inner"
          style={{ width: DISPLAY_W, height: displayH, background: CHECKER, maxWidth: '100%' }}
          onPointerDown={() => setSelectedId(null)}
        >
          {els.map((el) =>
            el.type === 'text' ? (
              <div
                key={el.id}
                onPointerDown={(e) => startDrag(e, el, 'move')}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  fontSize: el.fontSize,
                  color: el.fill,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  whiteSpace: 'pre',
                  cursor: 'move',
                  textShadow: '0 1px 3px rgba(0,0,0,0.45)',
                  outline: selectedId === el.id ? '2px solid #f97316' : 'none',
                  outlineOffset: 2,
                }}
              >
                {el.text}
              </div>
            ) : (
              <div
                key={el.id}
                onPointerDown={(e) => startDrag(e, el, 'move')}
                style={{
                  position: 'absolute',
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  cursor: 'move',
                  outline: selectedId === el.id ? '2px solid #f97316' : 'none',
                  outlineOffset: 2,
                }}
              >
                <img src={images[el.id]?.src} alt="" draggable={false} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
                {selectedId === el.id && (
                  <div
                    onPointerDown={(e) => startDrag(e, el, 'resize')}
                    style={{
                      position: 'absolute',
                      right: -7,
                      bottom: -7,
                      width: 14,
                      height: 14,
                      borderRadius: 8,
                      background: '#f97316',
                      border: '2px solid #fff',
                      cursor: 'nwse-resize',
                    }}
                  />
                )}
              </div>
            ),
          )}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Element anklicken zum Auswählen, ziehen zum Verschieben, Bild am orangen Punkt skalieren. Der karierte
          Bereich ist transparent.
        </p>
      </div>

      <div className="space-y-4">
        {selectedText ? (
          <div className="space-y-3 rounded-xl bg-white/40 p-4">
            <p className="text-sm font-semibold text-slate-800">Text bearbeiten</p>
            <textarea
              value={selectedText.text}
              onChange={(e) => patchSel({ text: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-sm"
            />
            <div>
              <label className="text-xs text-slate-500">Größe: {selectedText.fontSize}px</label>
              <input
                type="range"
                min={12}
                max={160}
                value={selectedText.fontSize}
                onChange={(e) => patchSel({ fontSize: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Farbe</label>
              <input type="color" value={selectedText.fill} onChange={(e) => patchSel({ fill: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/30 p-4 text-xs text-slate-400">
            Text hinzufügen und anklicken, um Inhalt, Größe und Farbe zu ändern.
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={saving || els.length === 0}
          className="glass-button-primary flex w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Als Overlay speichern
        </button>
      </div>
    </div>
  );
}
