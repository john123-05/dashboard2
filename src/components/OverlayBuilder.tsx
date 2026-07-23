import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KImage, Text as KText, Transformer } from 'react-konva';
import type Konva from 'konva';
import { Type, ImagePlus, Trash2, Loader2, Download } from 'lucide-react';

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

// Checkerboard so the user sees where the overlay is transparent.
const CHECKER =
  'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 50% / 20px 20px';

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

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = els.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (selected && selected.type === 'image') {
      const node = stage.findOne('#' + selected.id);
      tr.nodes(node ? [node] : []);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, els]);

  function addText() {
    const id = crypto.randomUUID();
    setEls((p) => [
      ...p,
      { id, type: 'text', x: DISPLAY_W * 0.2, y: displayH * 0.42, text: 'Dein Text', fontSize: 34, fill: '#ffffff' },
    ]);
    setSelectedId(id);
  }

  function addImageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const id = crypto.randomUUID();
        const scale = Math.min((DISPLAY_W * 0.45) / img.width, (displayH * 0.45) / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        setImages((m) => ({ ...m, [id]: img }));
        setEls((p) => [...p, { id, type: 'image', x: (DISPLAY_W - w) / 2, y: (displayH - h) / 2, width: w, height: h }]);
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

  function setPos(id: string, x: number, y: number) {
    setEls((p) => p.map((e) => (e.id === id ? { ...e, x, y } : e)));
  }

  function deleteSel() {
    if (!selectedId) return;
    setEls((p) => p.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }

  async function handleExport() {
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null);
    await new Promise((r) => setTimeout(r, 40));
    const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio: format.w / DISPLAY_W });
    const blob = await (await fetch(dataUrl)).blob();
    await onSave(new File([blob], `overlay-${Date.now()}.png`, { type: 'image/png' }));
  }

  const selectedText = selected?.type === 'text' ? selected : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={formatId}
            onChange={(e) => setFormatId(e.target.value)}
            className="glass-input text-sm"
          >
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

        <div className="inline-block rounded-xl p-2 shadow-inner" style={{ background: CHECKER }}>
          <Stage
            ref={stageRef}
            width={DISPLAY_W}
            height={displayH}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage()) setSelectedId(null);
            }}
            onTouchStart={(e) => {
              if (e.target === e.target.getStage()) setSelectedId(null);
            }}
          >
            <Layer>
              {els.map((el) =>
                el.type === 'text' ? (
                  <KText
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    text={el.text}
                    fontSize={el.fontSize}
                    fontStyle="bold"
                    fill={el.fill}
                    shadowColor="#00000066"
                    shadowBlur={4}
                    draggable
                    onClick={() => setSelectedId(el.id)}
                    onTap={() => setSelectedId(el.id)}
                    onDragEnd={(ev) => setPos(el.id, ev.target.x(), ev.target.y())}
                  />
                ) : images[el.id] ? (
                  <KImage
                    key={el.id}
                    id={el.id}
                    image={images[el.id]}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    draggable
                    onClick={() => setSelectedId(el.id)}
                    onTap={() => setSelectedId(el.id)}
                    onDragEnd={(ev) => setPos(el.id, ev.target.x(), ev.target.y())}
                    onTransformEnd={(ev) => {
                      const node = ev.target;
                      const sx = node.scaleX();
                      const sy = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      setEls((p) =>
                        p.map((e) =>
                          e.id === el.id && e.type === 'image'
                            ? { ...e, x: node.x(), y: node.y(), width: Math.max(12, e.width * sx), height: Math.max(12, e.height * sy) }
                            : e,
                        ),
                      );
                    }}
                  />
                ) : null,
              )}
              <Transformer ref={trRef} rotateEnabled keepRatio={false} />
            </Layer>
          </Stage>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Elemente anklicken zum Auswählen, ziehen zum Verschieben, Bilder an den Ecken skalieren. Der karierte
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
