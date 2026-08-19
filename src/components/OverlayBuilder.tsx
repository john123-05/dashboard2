import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Type, ImagePlus, Trash2, Loader2, Download, Square, Circle, Minus, Frame, Image as ImgIcon, Sparkles, Copy, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlignCenterHorizontal, AlignCenterVertical, Shapes, Crop } from 'lucide-react';

// Canva-style overlay editor, dependency-free: HTML/CSS for live editing, the
// Canvas API for the transparent-PNG export. No external library, so it always
// builds on bolt.

type Base = { id: string; x: number; y: number; opacity: number };
type TextEl = Base & { type: 'text'; text: string; fontSize: number; fill: string; fontFamily: string };
type ImageEl = Base & { type: 'image'; width: number; height: number };
type RectEl = Base & { type: 'rect'; width: number; height: number; fill: string; stroke: string; strokeWidth: number; radius: number };
type EllipseEl = Base & { type: 'ellipse'; width: number; height: number; fill: string; stroke: string; strokeWidth: number };
type LineEl = Base & { type: 'line'; width: number; stroke: string; strokeWidth: number };
type FrameEl = Base & { type: 'frame'; width: number; height: number; stroke: string; strokeWidth: number; radius: number };
type El = TextEl | ImageEl | RectEl | EllipseEl | LineEl | FrameEl;
type UploadedImage = { id: string; name: string; img: HTMLImageElement };
type PanelId = 'format' | 'elements' | 'text' | 'uploads' | 'ai';

const FORMATS = [
  { id: '4:3', label: '4:3 (Standard)', w: 1600, h: 1200 },
  { id: '3:2', label: '3:2', w: 1620, h: 1080 },
  { id: '16:9', label: '16:9 (Breit)', w: 1920, h: 1080 },
  { id: '1:1', label: '1:1 (Quadrat)', w: 1080, h: 1080 },
  { id: '3:4', label: '3:4 (Hochformat)', w: 1200, h: 1600 },
  { id: '9:16', label: '9:16 (Story)', w: 1080, h: 1920 },
];
const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Comic Sans MS'];
const FRAME_PRESETS = [
  { label: 'Dünn', strokeWidth: 6, radius: 0 },
  { label: 'Dick', strokeWidth: 18, radius: 0 },
  { label: 'Abgerundet', strokeWidth: 12, radius: 40 },
];
const DISPLAY_W = 900;
const CHECKER = 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 20px 20px';

function hasWH(el: El): el is ImageEl | RectEl | EllipseEl | FrameEl {
  return el.type === 'image' || el.type === 'rect' || el.type === 'ellipse' || el.type === 'frame';
}

export default function OverlayBuilder({
  onSave,
  saving,
  previewUrl,
  onGenerate,
  generating,
  generateError,
}: {
  onSave: (file: File) => void | Promise<void>;
  saving?: boolean;
  previewUrl?: string | null;
  onGenerate: (message: string, prompt: string) => void | Promise<void>;
  generating?: boolean;
  generateError?: string | null;
}) {
  const [formatId, setFormatId] = useState('4:3');
  const format = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const displayH = Math.round(DISPLAY_W * (format.h / format.w));

  const [els, setEls] = useState<El[]>([]);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [panel, setPanel] = useState<PanelId>('elements');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [uploads, setUploads] = useState<UploadedImage[]>([]);
  const [genMessage, setGenMessage] = useState('');
  const [genPrompt, setGenPrompt] = useState('');

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

  // Entf/Backspace loescht das ausgewaehlte Element - aber nicht, waehrend man
  // gerade in einem Text-/Zahlenfeld tippt (sonst loescht Backspace beim Text
  // aendern versehentlich das ganze Element).
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!selectedId) return;
      ev.preventDefault();
      setEls((p) => p.filter((e) => e.id !== selectedId));
      setSelectedId(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  // Falls die Komponente mitten im Ziehen verschwindet (z. B. Tab-Wechsel),
  // bleibt sonst die Seite dauerhaft am Scrollen gehindert.
  useEffect(() => {
    return () => unlockPageScroll();
  }, []);

  function update(id: string, patch: Partial<Record<string, unknown>>) {
    setEls((p) => p.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)));
  }
  function patchSel(patch: Partial<Record<string, unknown>>) {
    if (selectedId) update(selectedId, patch);
  }

  // Zeiger-Delta kommt in echten Bildschirm-Pixeln, die Elemente leben aber im
  // Entwurfsraster (DISPLAY_W). Die Flaeche steht meist verkleinert da
  // (canvasScale < 1) - ohne diese Division lief das Element schneller als
  // der Finger/die Maus und driftete sichtbar weg, auf dem Handy am
  // staerksten, weil canvasScale dort am kleinsten ist.
  const pendingMove = useRef<{ dx: number; dy: number } | null>(null);
  const rafId = useRef<number | null>(null);

  function applyPendingMove() {
    rafId.current = null;
    const d = drag.current;
    const pend = pendingMove.current;
    if (!d || !pend) return;
    const { dx, dy } = pend;
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
  function onMove(ev: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    ev.preventDefault();
    pendingMove.current = {
      dx: (ev.clientX - d.sx) / canvasScale,
      dy: (ev.clientY - d.sy) / canvasScale,
    };
    // Buendelt schnelle Zeigerereignisse (Apple Pencil/Touch feuern sehr
    // haeufig) auf ein Update pro Bildwiederholung statt pro Event.
    if (rafId.current == null) {
      rafId.current = requestAnimationFrame(applyPendingMove);
    }
  }
  // Sperrt das Scrollen der ganzen Seite waehrend eines Zieh-Vorgangs. Reines
  // `touch-action: none` auf dem Element reicht auf iOS/Safari nicht immer,
  // wenn es (wie hier) in einem skalierten Container steckt - der Browser
  // scrollt dann trotzdem die Seite mit, statt nur das Element zu bewegen.
  function lockPageScroll() {
    document.documentElement.style.touchAction = 'none';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
  }
  function unlockPageScroll() {
    document.documentElement.style.touchAction = '';
    document.body.style.touchAction = '';
    document.body.style.overscrollBehavior = '';
  }

  function endDrag() {
    drag.current = null;
    pendingMove.current = null;
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    unlockPageScroll();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }
  function startDrag(ev: ReactPointerEvent, el: El, mode: 'move' | 'resize') {
    ev.stopPropagation();
    ev.preventDefault();
    setSelectedId(el.id);
    // Pointer Capture: das Ziehen bleibt zuverlaessig an diesem Element,
    // selbst wenn Finger/Stift kurz die Spur verlaesst - sonst bricht der
    // Browser das Beruehren gern als Wischgeste ab.
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    lockPageScroll();
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
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  const cx = Math.round(DISPLAY_W * 0.3);
  const cy = Math.round(displayH * 0.4);
  const add = (el: El) => {
    setEls((p) => [...p, el]);
    setSelectedId(el.id);
  };
  const uid = () => crypto.randomUUID();

  function addTextPreset(fontSize: number) {
    const id = uid();
    add({ id, type: 'text', x: cx, y: cy, opacity: 1, text: 'Dein Text', fontSize, fill: '#ffffff', fontFamily: 'Arial' });
    setEditingTextId(id);
  }
  function addRect() {
    add({ id: uid(), type: 'rect', x: cx, y: cy, opacity: 1, width: 240, height: 90, fill: '#f97316', stroke: '#ffffff', strokeWidth: 0, radius: 8 });
  }
  function addEllipse() {
    add({ id: uid(), type: 'ellipse', x: cx, y: cy, opacity: 1, width: 140, height: 140, fill: '#0ea5e9', stroke: '#ffffff', strokeWidth: 0 });
  }
  function addLine() {
    add({ id: uid(), type: 'line', x: cx, y: cy, opacity: 1, width: 260, stroke: '#ffffff', strokeWidth: 6 });
  }
  function addFrame(preset: (typeof FRAME_PRESETS)[number]) {
    add({ id: uid(), type: 'frame', x: 20, y: 20, opacity: 1, width: DISPLAY_W - 40, height: displayH - 40, stroke: '#ffffff', strokeWidth: preset.strokeWidth, radius: preset.radius });
  }
  /** Bild in die Uploads-Bibliothek legen - noch nicht auf der Flaeche.
   *  So kann z. B. ein Logo mehrfach eingefuegt werden, ohne es erneut
   *  hochzuladen, und laesst sich einzeln wieder aus der Bibliothek loeschen. */
  function handleUploadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        setUploads((list) => [{ id: uid(), name: file.name, img }, ...list]);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }
  function insertUpload(u: UploadedImage) {
    const id = uid();
    const scale = Math.min((DISPLAY_W * 0.45) / u.img.width, (displayH * 0.45) / u.img.height, 1);
    const w = Math.round(u.img.width * scale);
    const h = Math.round(u.img.height * scale);
    setImages((m) => ({ ...m, [id]: u.img }));
    add({ id, type: 'image', x: Math.round((DISPLAY_W - w) / 2), y: Math.round((displayH - h) / 2), opacity: 1, width: w, height: h });
  }
  function removeUpload(id: string) {
    setUploads((list) => list.filter((u) => u.id !== id));
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
  function sendBackward() {
    if (!selectedId) return;
    setEls((p) => {
      const i = p.findIndex((e) => e.id === selectedId);
      if (i <= 0) return p;
      const n = [...p];
      [n[i], n[i - 1]] = [n[i - 1], n[i]];
      return n;
    });
  }
  function duplicateSel() {
    if (!selected) return;
    const id = uid();
    if (selected.type === 'image') setImages((m) => ({ ...m, [id]: images[selected.id] }));
    add({ ...selected, id, x: selected.x + 24, y: selected.y + 24 });
  }
  function centerHorizontal() {
    if (!selected) return;
    const w = 'width' in selected ? selected.width : 0;
    patchSel({ x: Math.round((DISPLAY_W - w) / 2) });
  }
  function centerVertical() {
    if (!selected) return;
    const h = hasWH(selected)
      ? selected.height
      : selected.type === 'text'
        ? selected.fontSize
        : selected.type === 'line'
          ? selected.strokeWidth
          : 0;
    patchSel({ y: Math.round((displayH - h) / 2) });
  }
  async function submitGenerate() {
    await onGenerate(genMessage, genPrompt);
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
      ctx.globalAlpha = el.opacity;
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
    const base: CSSProperties = {
      position: 'absolute',
      left: el.x,
      top: el.y,
      cursor: 'move',
      opacity: el.opacity,
      touchAction: 'none',
      outline: sel ? '2px solid #f97316' : 'none',
      outlineOffset: 2,
    };
    if (el.type === 'text') return { ...base, fontSize: el.fontSize, color: el.fill, fontFamily: `${el.fontFamily}, sans-serif`, fontWeight: 700, lineHeight: 1.25, whiteSpace: 'pre', textShadow: '0 1px 3px rgba(0,0,0,0.45)' };
    if (el.type === 'rect') return { ...base, width: el.width, height: el.height, background: el.fill, border: el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : 'none', borderRadius: el.radius };
    if (el.type === 'ellipse') return { ...base, width: el.width, height: el.height, background: el.fill, border: el.strokeWidth ? `${el.strokeWidth}px solid ${el.stroke}` : 'none', borderRadius: '50%' };
    if (el.type === 'frame') return { ...base, width: el.width, height: el.height, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.radius, background: 'transparent' };
    if (el.type === 'line') return { ...base, width: el.width, height: el.strokeWidth, background: el.stroke };
    return { ...base, width: (el as ImageEl).width, height: (el as ImageEl).height };
  }

  const RAIL_ITEMS: { id: PanelId; icon: typeof Type; label: string }[] = [
    { id: 'format', icon: Crop, label: 'Format' },
    { id: 'elements', icon: Shapes, label: 'Elemente' },
    { id: 'text', icon: Type, label: 'Text' },
    { id: 'uploads', icon: ImagePlus, label: 'Uploads' },
    { id: 'ai', icon: Sparkles, label: 'KI' },
  ];

  function selectPanel(id: PanelId) {
    if (panel === id && !panelCollapsed) {
      setPanelCollapsed(true);
    } else {
      setPanel(id);
      setPanelCollapsed(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/10 xl:flex-row xl:items-stretch">
      {/* Kategorien-Leiste */}
      <div className="flex shrink-0 flex-row gap-1 border-b border-white/30 bg-white/40 p-2 xl:w-20 xl:flex-col xl:border-b-0 xl:border-r xl:py-3">
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => selectPanel(item.id)}
            className={`relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-medium transition xl:flex-none ${
              panel === item.id && !panelCollapsed ? 'bg-brand-100 text-brand-700' : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {item.id === 'uploads' && uploads.length > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-semibold text-white">
                {uploads.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Kategorien-Panel */}
      {!panelCollapsed && (
        <div className="shrink-0 space-y-4 border-b border-white/30 bg-white/25 p-3 xl:w-44 xl:max-h-[640px] xl:overflow-y-auto xl:border-b-0 xl:border-r">
          {panel === 'format' && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Format</p>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormatId(f.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center text-[11px] font-medium transition ${
                      formatId === f.id
                        ? 'border-brand-300 bg-brand-50/60 text-brand-700'
                        : 'border-white/40 bg-white/60 text-slate-600 hover:bg-white/90'
                    }`}
                  >
                    <span
                      className="rounded-sm border-2 border-current opacity-70"
                      style={{ width: 22, height: Math.round((22 * f.h) / f.w) }}
                    />
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {panel === 'elements' && (
            <>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Formen</p>
                <div className="grid grid-cols-2 gap-2">
                  <PanelBtn onClick={addRect} icon={Square} label="Balken" />
                  <PanelBtn onClick={addEllipse} icon={Circle} label="Kreis" />
                  <PanelBtn onClick={addLine} icon={Minus} label="Linie" />
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Rahmen</p>
                <div className="grid grid-cols-2 gap-2">
                  {FRAME_PRESETS.map((fp) => (
                    <PanelBtn key={fp.label} onClick={() => addFrame(fp)} icon={Frame} label={fp.label} />
                  ))}
                </div>
              </div>
            </>
          )}

          {panel === 'text' && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Text hinzufügen</p>
              <div className="space-y-2">
                <button onClick={() => addTextPreset(48)} className="w-full rounded-xl bg-white/60 px-3 py-3 text-left text-lg font-bold text-slate-800 transition hover:bg-white/90">
                  Überschrift
                </button>
                <button onClick={() => addTextPreset(30)} className="w-full rounded-xl bg-white/60 px-3 py-2.5 text-left text-base font-semibold text-slate-800 transition hover:bg-white/90">
                  Text
                </button>
                <button onClick={() => addTextPreset(20)} className="w-full rounded-xl bg-white/60 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white/90">
                  Kleiner Text
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Tipp: Doppelklick auf einen Text im Bild, um ihn direkt dort zu bearbeiten.
              </p>
            </div>
          )}

          {panel === 'uploads' && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  Array.from(e.target.files || []).forEach(handleUploadFile);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="glass-button-secondary flex w-full items-center justify-center gap-1.5 text-sm"
              >
                <ImagePlus className="h-4 w-4" /> Bild hochladen
              </button>

              {uploads.length === 0 ? (
                <p className="mt-3 text-xs text-slate-400">
                  Noch keine eigenen Bilder. Lade z. B. dein Logo hoch, um es hier wiederzuverwenden.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {uploads.map((u) => (
                    <div
                      key={u.id}
                      className="group relative overflow-hidden rounded-xl border border-white/50 bg-[conic-gradient(#e5e7eb_90deg,#fff_90deg_180deg,#e5e7eb_180deg_270deg,#fff_270deg)] bg-[length:10px_10px]"
                    >
                      <button onClick={() => insertUpload(u)} className="flex h-16 w-full items-center justify-center p-1.5" title={`${u.name} einfuegen`}>
                        <img src={u.img.src} alt={u.name} className="max-h-full max-w-full object-contain" />
                      </button>
                      <button
                        onClick={() => removeUpload(u.id)}
                        aria-label={`${u.name} loeschen`}
                        className="absolute right-1 top-1 hidden rounded-full bg-black/60 p-1 text-white hover:bg-rose-600 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {panel === 'ai' && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Overlay generieren</p>
              <div className="space-y-2">
                <input
                  value={genMessage}
                  onChange={(e) => setGenMessage(e.target.value)}
                  placeholder="Welche Nachricht möchtest du hinterlassen?"
                  className="glass-input w-full text-sm"
                />
                <textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  rows={3}
                  placeholder="Farben, Anlässe, Stil ... (optional)"
                  className="glass-input w-full text-sm"
                />
                {generateError && <p className="text-xs text-rose-600">{generateError}</p>}
                <button
                  onClick={() => void submitGenerate()}
                  disabled={generating || (!genMessage && !genPrompt)}
                  className="glass-button-primary flex w-full items-center justify-center gap-1.5 text-sm disabled:opacity-60"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generieren
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Griff zum Ein-/Ausklappen der Kategorien - durchgehend und eindeutig klickbar,
          statt einer kleinen Ecken-Schaltflaeche, die man leicht uebersieht. */}
      <button
        onClick={() => setPanelCollapsed((c) => !c)}
        title={panelCollapsed ? 'Kategorien einblenden' : 'Kategorien ausblenden'}
        className="hidden shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition hover:bg-slate-300 hover:text-slate-700 xl:flex xl:my-auto xl:h-14 xl:w-5"
      >
        {panelCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Zeichenflaeche */}
      <div className="min-w-0 flex-1 p-4">
        <div ref={previewShellRef} className="w-full overflow-x-auto pb-2">
          <div
            style={{ height: scaledHeight, minWidth: Math.max(280, DISPLAY_W * Math.min(canvasScale, 1)) }}
            className="relative w-full min-w-[280px] overflow-visible rounded-xl"
          >
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
                <div
                  key={el.id}
                  onPointerDown={(e) => startDrag(e, el, 'move')}
                  onDoubleClick={() => el.type === 'text' && setEditingTextId(el.id)}
                  style={elStyle(el)}
                >
                  {el.type === 'text' &&
                    (editingTextId === el.id ? (
                      <textarea
                        autoFocus
                        value={el.text}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => update(el.id, { text: e.target.value })}
                        onBlur={() => setEditingTextId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            setEditingTextId(null);
                          }
                          if (e.key === 'Escape') setEditingTextId(null);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        rows={1}
                        style={{
                          font: `700 ${el.fontSize}px ${el.fontFamily}, sans-serif`,
                          color: el.fill,
                          background: 'rgba(255,255,255,0.15)',
                          border: '1px dashed #f97316',
                          borderRadius: 4,
                          padding: 0,
                          resize: 'none',
                          outline: 'none',
                          lineHeight: 1.25,
                          minWidth: 60,
                          width: Math.max(80, el.text.length * el.fontSize * 0.62),
                        }}
                      />
                    ) : (
                      el.text
                    ))}
                  {el.type === 'image' && <img src={images[el.id]?.src} alt="" draggable={false} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />}
                  {selectedId === el.id && (
                    <div
                      onPointerDown={(e) => startDrag(e, el, 'resize')}
                      style={{
                        position: 'absolute',
                        right: -14,
                        bottom: -14,
                        width: 28,
                        height: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'nwse-resize',
                        touchAction: 'none',
                        // Skaliert entgegen der Flaechen-Verkleinerung, damit der
                        // Punkt auf dem Handy nicht zu einem Mini-Ziel schrumpft.
                        transform: `scale(${1 / canvasScale})`,
                      }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: 8, background: '#f97316', border: '2px solid #fff', pointerEvents: 'none' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Ziehen zum Verschieben, am orangen Punkt skalieren, Doppelklick auf Text zum Bearbeiten. Karierter Bereich = transparent.
        </p>
      </div>

      {/* Element-Eigenschaften */}
      <div className="shrink-0 space-y-3 border-t border-white/30 bg-white/25 p-4 xl:w-60 xl:max-h-[640px] xl:overflow-y-auto xl:border-t-0 xl:border-l">
        {selected ? (
          <div className="space-y-3 rounded-xl bg-white/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">Element</p>
              <div className="flex flex-wrap items-center gap-1">
                <button onClick={centerHorizontal} title="Horizontal zentrieren" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800">
                  <AlignCenterHorizontal className="h-3.5 w-3.5" />
                </button>
                <button onClick={centerVertical} title="Vertikal zentrieren" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800">
                  <AlignCenterVertical className="h-3.5 w-3.5" />
                </button>
                <button onClick={sendBackward} title="Nach hinten" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={bringForward} title="Nach vorne" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={duplicateSel} title="Duplizieren" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/60 hover:text-slate-800">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button onClick={deleteSel} title="Löschen" className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {selected.type === 'text' && (
              <>
                <button
                  onClick={() => setEditingTextId(selected.id)}
                  className="w-full rounded-lg border border-dashed border-slate-300 bg-white/70 p-2 text-left text-sm text-slate-700 hover:border-brand-300"
                >
                  {selected.text || 'Text eingeben...'}
                </button>
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

            <label className="block border-t border-white/40 pt-3 text-xs text-slate-500">
              Deckkraft: {Math.round(selected.opacity * 100)}%
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(selected.opacity * 100)}
                onChange={(e) => patchSel({ opacity: Number(e.target.value) / 100 })}
                className="w-full"
              />
            </label>
          </div>
        ) : (
          <div className="rounded-xl bg-white/30 p-4 text-xs text-slate-400">
            Element anklicken, um Farbe, Größe, Schrift und mehr zu ändern.
          </div>
        )}

        <button onClick={handleExport} disabled={saving || els.length === 0} className="glass-button-primary flex w-full items-center justify-center gap-2 text-sm disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Als Overlay speichern
        </button>

        {previewUrl && (
          <button
            onClick={() => setShowPhoto((v) => !v)}
            className={`glass-button-secondary flex w-full items-center justify-center gap-1.5 text-sm ${showPhoto ? 'ring-2 ring-brand-500' : ''}`}
          >
            <ImgIcon className="h-4 w-4" /> Foto zum Vergleich
          </button>
        )}
      </div>
    </div>
  );
}

function PanelBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Type; label: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-xl bg-white/60 px-2 py-3 text-[11px] font-medium text-slate-700 transition hover:bg-white/90">
      <Icon className="h-5 w-5" />
      {label}
    </button>
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
