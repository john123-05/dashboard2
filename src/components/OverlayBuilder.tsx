import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowUp,
  Bold,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Eye,
  EyeOff,
  FilePlus2,
  FlipHorizontal,
  Frame,
  GripVertical,
  Image as ImgIcon,
  ImagePlus,
  Italic,
  LayoutTemplate,
  Loader2,
  Lock,
  Minus,
  Redo2,
  RotateCw,
  Save,
  Shapes,
  Sparkles,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import {
  DISPLAY_W,
  FONTS,
  FORMATS,
  SWATCHES,
  closestFormat,
  displayHeight,
  hasBox,
  makeEllipse,
  makeFrame,
  makeImage,
  makeLine,
  makeRect,
  makeStar,
  makeText,
  makeTriangle,
  uid,
  type El,
  type GradientDir,
  type TextEl,
} from './overlay/model';
import { ElementBody, OverlayThumb, boxStyle } from './overlay/render';
import { exportPng, loadImage, type Measured } from './overlay/exportPng';
import { TEMPLATES } from './overlay/templates';
import { listLibrary, removeStored, signPath, uploadToLibrary, type StoredImage } from '../lib/overlayLibrary';

// Overlay-Studio: Canva-artiger Editor für Foto-Overlays, ohne externe
// Bibliothek (läuft sicher auf bolt). Darstellung: overlay/render.tsx,
// PNG-Ausgabe: overlay/exportPng.ts, Vorlagen: overlay/templates.ts.
//
// Wichtig beim Ziehen: Zeiger-Deltas kommen in Bildschirm-Pixeln, die Elemente
// leben im Entwurfsraster (DISPLAY_W). Deshalb jedes Delta durch canvasScale
// teilen, sonst laufen Elemente schneller als Maus/Finger.

type PanelId = 'templates' | 'elements' | 'text' | 'library' | 'ai';
type BgMode = 'transparent' | 'white' | 'color';
type DragMode = 'move' | 'resize' | 'resize-x' | 'resize-y' | 'rotate';
type LibraryEntry = StoredImage & { sessionOnly?: boolean };

export type OpenRequest = { url: string; nonce: number };

const CHECKER = 'repeating-conic-gradient(#e5e9f0 0% 25%, #ffffff 0% 50%) 50% / 12px 12px';
const SNAP_PX = 6;
const HISTORY_LIMIT = 80;

function isTypingTarget() {
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

export default function OverlayBuilder({
  onSave,
  saving,
  previewUrl,
  onGenerate,
  generating,
  generateError,
  parkId,
  brandName,
  openRequest,
}: {
  onSave: (file: File) => void | Promise<void>;
  saving?: boolean;
  previewUrl?: string | null;
  onGenerate: (message: string, prompt: string) => void | Promise<void>;
  generating?: boolean;
  generateError?: string | null;
  parkId?: string | null;
  brandName?: string | null;
  openRequest?: OpenRequest | null;
}) {
  const { t } = useI18n();
  const [formatId, setFormatId] = useState('4:3');
  const format = FORMATS.find((f) => f.id === formatId) ?? FORMATS[0];
  const displayH = displayHeight(format);

  const [els, setEls] = useState<El[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [measured, setMeasured] = useState<Measured>({});
  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoOpacity, setPhotoOpacity] = useState(1);
  const [panel, setPanel] = useState<PanelId>('templates');
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [librarySessionOnly, setLibrarySessionOnly] = useState(false);
  const [genMessage, setGenMessage] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);

  const fileRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());

  const selected = els.find((e) => e.id === selectedId) ?? null;
  const title = brandName || t('builder.your_text');

  // --- Verlauf (Rückgängig / Wiederholen) ---------------------------------
  const past = useRef<El[][]>([]);
  const future = useRef<El[][]>([]);
  const lastPush = useRef<{ key: string; at: number } | null>(null);
  const elsRef = useRef(els);
  elsRef.current = els;
  const [, forceHistoryRender] = useState(0);

  /** Aktuellen Stand merken, bevor er sich ändert. Gleiche `coalesceKey`
   *  innerhalb kurzer Zeit (z. B. Schieberegler) ergeben nur einen Schritt. */
  const pushHistory = useCallback((coalesceKey?: string) => {
    const now = Date.now();
    if (coalesceKey && lastPush.current?.key === coalesceKey && now - lastPush.current.at < 800) {
      lastPush.current.at = now;
      return;
    }
    lastPush.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    past.current = [...past.current.slice(-HISTORY_LIMIT + 1), elsRef.current];
    future.current = [];
    forceHistoryRender((n) => n + 1);
  }, []);

  function undo() {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(elsRef.current);
    lastPush.current = null;
    setEls(prev);
    forceHistoryRender((n) => n + 1);
  }
  function redo() {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(elsRef.current);
    lastPush.current = null;
    setEls(next);
    forceHistoryRender((n) => n + 1);
  }

  function commit(next: El[] | ((prev: El[]) => El[]), coalesceKey?: string) {
    pushHistory(coalesceKey);
    setEls(next);
  }
  function update(id: string, patch: Partial<El>, coalesceKey?: string) {
    commit((p) => p.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)), coalesceKey);
  }
  function patchSel(patch: Partial<El>, coalesceKey?: string) {
    if (selectedId) update(selectedId, patch, coalesceKey ? `${selectedId}:${coalesceKey}` : undefined);
  }

  // --- Flächengröße --------------------------------------------------------
  useEffect(() => {
    const node = shellRef.current;
    if (!node) return;
    const updateScale = () => {
      const available = node.clientWidth;
      if (available) setCanvasScale(Math.min(1, available / DISPLAY_W));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // --- Texte messen (für Export, Ausrichten, Vorlagen-Anker) ---------------
  useLayoutEffect(() => {
    const next: Measured = {};
    let changed = false;
    for (const el of els) {
      if (el.type !== 'text') continue;
      const node = nodeRefs.current.get(el.id);
      if (!node) continue;
      const size = { w: node.offsetWidth, h: node.offsetHeight };
      next[el.id] = size;
      const prev = measured[el.id];
      if (!prev || prev.w !== size.w || prev.h !== size.h) changed = true;
    }
    if (changed || Object.keys(next).length !== Object.keys(measured).length) setMeasured(next);

    const anchored = els.filter((el): el is TextEl => el.type === 'text' && !!el.autoAnchor && !!next[el.id]);
    if (anchored.length > 0) {
      setEls((p) =>
        p.map((el) => {
          if (el.type !== 'text' || !el.autoAnchor || !next[el.id]) return el;
          const w = next[el.id].w;
          const x = el.autoAnchor === 'center' ? el.x - w / 2 : el.x - w;
          return { ...el, x: Math.round(x), autoAnchor: undefined };
        }),
      );
    }
  }, [els, measured]);

  function sizeOf(el: El) {
    if (el.type === 'text') return measured[el.id] ?? { w: 0, h: 0 };
    if (el.type === 'line') return { w: el.width, h: el.strokeWidth };
    return { w: el.width, h: el.height };
  }

  // --- Entwurf automatisch sichern (pro Park, nur in diesem Browser) --------
  const draftKey = parkId ? `lp-overlay-draft:${parkId}` : null;
  const restoredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!draftKey || restoredFor.current === draftKey) return;
    restoredFor.current = draftKey;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(draftKey);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { formatId?: string; els?: El[]; bgMode?: BgMode; bgColor?: string };
      if (draft.formatId && FORMATS.some((f) => f.id === draft.formatId)) setFormatId(draft.formatId);
      if (draft.bgMode) setBgMode(draft.bgMode);
      if (draft.bgColor) setBgColor(draft.bgColor);
      const restored = draft.els ?? [];
      setEls(restored);
      // Signierte Links laufen ab - für Bilder aus der Ablage neu holen.
      void Promise.all(
        restored.map(async (el) => (el.type === 'image' && el.storagePath ? { id: el.id, url: await signPath(el.storagePath) } : null)),
      ).then((fresh) => {
        const map = new Map(fresh.filter(Boolean).map((f) => [f!.id, f!.url]));
        if (map.size === 0) return;
        setEls((p) => p.map((el) => (el.type === 'image' && map.get(el.id) ? { ...el, src: map.get(el.id)! } : el)));
      });
    } catch {
      // kaputter Entwurf - ignorieren
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    const timer = window.setTimeout(() => {
      try {
        const keep = els.filter((el) => !(el.type === 'image' && el.src.startsWith('data:') && el.src.length > 1_500_000));
        localStorage.setItem(draftKey, JSON.stringify({ formatId, els: keep, bgMode, bgColor }));
      } catch {
        // Speicher voll oder gesperrt - Entwurf nur nicht gesichert
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftKey, els, formatId, bgMode, bgColor]);

  // --- Bibliothek -----------------------------------------------------------
  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLibraryBusy(true);
    listLibrary(parkId)
      .then((items) => active && (setLibrary(items), setLibrarySessionOnly(false)))
      .catch(() => active && setLibrarySessionOnly(true))
      .finally(() => active && setLibraryBusy(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  async function handleLibraryFiles(files: File[]) {
    if (files.length === 0) return;
    setLibraryBusy(true);
    for (const file of files) {
      let entry: LibraryEntry | null = null;
      if (parkId && !librarySessionOnly) {
        try {
          entry = await uploadToLibrary(parkId, file);
        } catch {
          setLibrarySessionOnly(true);
        }
      }
      if (!entry) {
        const url = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        entry = { path: `session/${uid()}`, name: file.name, url, createdAt: null, sessionOnly: true };
      }
      setLibrary((list) => [entry!, ...list]);
    }
    setLibraryBusy(false);
  }

  async function deleteLibraryItem(item: LibraryEntry) {
    if (!item.sessionOnly) {
      try {
        await removeStored(item.path);
      } catch {
        setNotice(t('builder.library_delete_failed'));
        return;
      }
    }
    setLibrary((list) => list.filter((x) => x.path !== item.path));
  }

  async function insertImage(src: string, storagePath?: string) {
    try {
      const img = await loadImage(src);
      const scale = Math.min((DISPLAY_W * 0.45) / img.width, (displayH * 0.45) / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      add(makeImage(Math.round((DISPLAY_W - w) / 2), Math.round((displayH - h) / 2), w, h, src, storagePath));
    } catch {
      setNotice(t('builder.image_load_failed'));
    }
  }

  // Ein vorhandenes Overlay (Galerie oder Automat) als Grundlage öffnen.
  useEffect(() => {
    if (!openRequest) return;
    let active = true;
    loadImage(openRequest.url)
      .then((img) => {
        if (!active) return;
        const next = closestFormat(img.width, img.height);
        const h = displayHeight(next);
        setFormatId(next.id);
        commit([makeImage(0, 0, DISPLAY_W, h, openRequest.url)]);
        setSelectedId(null);
        setNotice(t('builder.opened'));
        studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(() => active && setNotice(t('builder.image_load_failed')));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // --- Elemente hinzufügen ----------------------------------------------------
  const cx = Math.round(DISPLAY_W * 0.35);
  const cy = Math.round(displayH * 0.35);

  function add(el: El) {
    commit((p) => [...p, el]);
    setSelectedId(el.id);
  }

  function addText(size: number, extra: Partial<TextEl> = {}) {
    const el = makeText(cx, cy, t('builder.your_text'), size, extra);
    add(el);
    setEditingTextId(el.id);
  }

  function applyTemplate(id: string) {
    const tpl = TEMPLATES.find((x) => x.id === id);
    if (!tpl) return;
    commit(tpl.build(displayH, title, t('builder.tpl_tagline')));
    setSelectedId(null);
  }

  // --- Auswahl-Aktionen -------------------------------------------------------
  function deleteSel() {
    if (!selectedId) return;
    commit((p) => p.filter((e) => e.id !== selectedId));
    setSelectedId(null);
  }
  function duplicateSel() {
    if (!selected) return;
    const copy = { ...selected, id: uid(), x: selected.x + 24, y: selected.y + 24 } as El;
    add(copy);
  }
  function moveLayer(dir: 1 | -1) {
    if (!selectedId) return;
    commit((p) => {
      const i = p.findIndex((e) => e.id === selectedId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  function centerSel(axis: 'x' | 'y') {
    if (!selected) return;
    const { w, h } = sizeOf(selected);
    patchSel(axis === 'x' ? { x: Math.round((DISPLAY_W - w) / 2) } : { y: Math.round((displayH - h) / 2) });
  }

  // --- Tastatur ---------------------------------------------------------------
  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      if (!studioRef.current || isTypingTarget() || editingTextId) return;
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
        return;
      }
      if (!selectedId) return;
      const el = elsRef.current.find((e) => e.id === selectedId);
      if (!el) return;
      if (mod && ev.key.toLowerCase() === 'd') {
        ev.preventDefault();
        duplicateSel();
      } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        deleteSel();
      } else if (ev.key === 'Escape') {
        setSelectedId(null);
      } else if (ev.key.startsWith('Arrow') && !el.locked) {
        ev.preventDefault();
        const step = ev.shiftKey ? 10 : 1;
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
        const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
        update(el.id, { x: el.x + dx, y: el.y + dy }, `${el.id}:nudge`);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // --- Ziehen, Skalieren, Drehen ---------------------------------------------
  const drag = useRef<{
    id: string;
    mode: DragMode;
    sx: number;
    sy: number;
    start: El;
    w: number;
    h: number;
    centerX: number;
    centerY: number;
    moved: boolean;
  } | null>(null);
  const pending = useRef<{ x: number; y: number; shift: boolean; alt: boolean } | null>(null);
  const raf = useRef<number | null>(null);

  function lockPageScroll(on: boolean) {
    // Auf iOS reicht touch-action am Element nicht, wenn es in einem skalierten
    // Container steckt - die Seite scrollt sonst mit.
    document.documentElement.style.touchAction = on ? 'none' : '';
    document.body.style.touchAction = on ? 'none' : '';
    document.body.style.overscrollBehavior = on ? 'none' : '';
  }
  useEffect(() => () => lockPageScroll(false), []);

  function snap(value: number, size: number, targets: number[], threshold: number) {
    for (const [offset, kind] of [[0, 0], [size / 2, 1], [size, 2]] as const) {
      for (const target of targets) {
        if (Math.abs(value + offset - target) <= threshold) return { value: target - offset, guide: target, kind };
      }
    }
    return { value, guide: null as number | null, kind: -1 };
  }

  function applyDrag() {
    raf.current = null;
    const d = drag.current;
    const p = pending.current;
    if (!d || !p) return;
    const dx = (p.x - d.sx) / canvasScale;
    const dy = (p.y - d.sy) / canvasScale;
    const s = d.start;
    if (Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) > 1) d.moved = true;
    if (!d.moved) return;

    if (d.mode === 'move') {
      let nx = s.x + dx;
      let ny = s.y + dy;
      const v: number[] = [];
      const hz: number[] = [];
      if (!p.alt) {
        const others = elsRef.current.filter((e) => e.id !== d.id && !e.hidden);
        const xs = [0, DISPLAY_W / 2, DISPLAY_W];
        const ys = [0, displayH / 2, displayH];
        for (const o of others) {
          const { w, h } = sizeOf(o);
          xs.push(o.x, o.x + w / 2, o.x + w);
          ys.push(o.y, o.y + h / 2, o.y + h);
        }
        const th = SNAP_PX / canvasScale;
        const sx = snap(nx, d.w, xs, th);
        const sy = snap(ny, d.h, ys, th);
        nx = sx.value;
        ny = sy.value;
        if (sx.guide !== null) v.push(sx.guide);
        if (sy.guide !== null) hz.push(sy.guide);
      }
      setGuides({ v, h: hz });
      setEls((list) => list.map((e) => (e.id === d.id ? { ...e, x: Math.round(nx), y: Math.round(ny) } : e)));
      return;
    }

    if (d.mode === 'rotate') {
      let angle = (Math.atan2(p.y - d.centerY, p.x - d.centerX) * 180) / Math.PI + 90;
      if (angle > 180) angle -= 360;
      if (p.shift) angle = Math.round(angle / 15) * 15;
      else {
        const near = Math.round(angle / 45) * 45;
        if (Math.abs(angle - near) < 4) angle = near;
      }
      setEls((list) => list.map((e) => (e.id === d.id ? { ...e, rotation: Math.round(angle) } : e)));
      return;
    }

    // Größe ändern: Delta in die gedrehten Achsen des Elements umrechnen.
    const rad = (s.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
    const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);

    setEls((list) =>
      list.map((e) => {
        if (e.id !== d.id) return e;
        if (s.type === 'text') {
          const factor = Math.max(0.1, (d.h + (d.mode === 'resize-x' ? lx * (d.h / Math.max(d.w, 1)) : ly)) / Math.max(d.h, 1));
          return { ...e, fontSize: Math.max(8, Math.round(s.fontSize * factor)) } as El;
        }
        if (s.type === 'line') return { ...e, width: Math.max(10, Math.round(s.width + lx)) } as El;
        if (!hasBox(s)) return e;
        let w = d.mode === 'resize-y' ? s.width : Math.max(12, s.width + lx);
        let h = d.mode === 'resize-x' ? s.height : Math.max(12, s.height + ly);
        const keepRatio = d.mode === 'resize' && (s.type === 'image' || s.type === 'star' ? !p.shift : p.shift);
        if (keepRatio) {
          const ratio = s.width / s.height;
          if (w / h > ratio) h = w / ratio;
          else w = h * ratio;
        }
        return { ...e, width: Math.round(w), height: Math.round(h) } as El;
      }),
    );
  }

  function onPointerMove(ev: PointerEvent) {
    if (!drag.current) return;
    ev.preventDefault();
    pending.current = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey, alt: ev.altKey };
    if (raf.current == null) raf.current = requestAnimationFrame(applyDrag);
  }

  function endDrag(ev?: PointerEvent) {
    // Letzte Bewegung noch anwenden - bei schnellem Ziehen käme das Loslassen
    // sonst vor dem nächsten Bild, und das Element spränge zurück.
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (drag.current && ev && ev.type === 'pointerup') {
      pending.current = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey, alt: ev.altKey };
    }
    if (drag.current && pending.current) applyDrag();
    // Nur angeklickt, nicht bewegt: den vorsorglich gemerkten Schritt wieder verwerfen.
    if (drag.current && !drag.current.moved) {
      past.current.pop();
      forceHistoryRender((n) => n + 1);
    }
    drag.current = null;
    pending.current = null;
    setGuides({ v: [], h: [] });
    lockPageScroll(false);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }

  function startDrag(ev: ReactPointerEvent, el: El, mode: DragMode) {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    setSelectedId(el.id);
    if (el.locked) return;
    ev.preventDefault();
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    const node = nodeRefs.current.get(el.id);
    const rect = node?.getBoundingClientRect();
    const { w, h } = sizeOf(el);
    pushHistory();
    drag.current = {
      id: el.id,
      mode,
      sx: ev.clientX,
      sy: ev.clientY,
      start: el,
      w,
      h,
      centerX: rect ? rect.left + rect.width / 2 : ev.clientX,
      centerY: rect ? rect.top + rect.height / 2 : ev.clientY,
      moved: false,
    };
    lockPageScroll(true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  }

  // --- Ebenen per Ziehen sortieren -------------------------------------------
  const layerRows = useRef(new Map<string, HTMLDivElement>());
  const [layerDrag, setLayerDrag] = useState<{ id: string; gap: number } | null>(null);
  const layersTopFirst = useMemo(() => [...els].reverse(), [els]);

  function layerGap(clientY: number) {
    let gap = 0;
    for (const el of layersTopFirst) {
      const r = layerRows.current.get(el.id)?.getBoundingClientRect();
      if (r && clientY > r.top + r.height / 2) gap += 1;
    }
    return gap;
  }
  function finishLayerDrag() {
    if (!layerDrag) return;
    const order = layersTopFirst.map((e) => e.id);
    const from = order.indexOf(layerDrag.id);
    let to = layerDrag.gap;
    setLayerDrag(null);
    if (from < 0) return;
    if (to > from) to -= 1;
    if (to === from) return;
    order.splice(from, 1);
    order.splice(to, 0, layerDrag.id);
    const byId = new Map(els.map((e) => [e.id, e]));
    commit(order.reverse().map((id) => byId.get(id)!));
  }

  // --- Speichern --------------------------------------------------------------
  const background = bgMode === 'white' ? '#ffffff' : bgMode === 'color' ? bgColor : null;

  async function handleSave() {
    setExporting(true);
    setNotice(null);
    try {
      const blob = await exportPng(els, format, measured, background);
      await onSave(new File([blob], `overlay-${Date.now()}.png`, { type: 'image/png' }));
    } catch {
      setNotice(t('builder.export_failed'));
    } finally {
      setExporting(false);
    }
  }

  function clearAll() {
    if (els.length === 0) return;
    commit([]);
    setSelectedId(null);
  }

  function selectPanel(id: PanelId) {
    if (panel === id && !panelCollapsed) setPanelCollapsed(true);
    else {
      setPanel(id);
      setPanelCollapsed(false);
    }
  }

  const RAIL: { id: PanelId; icon: typeof Type; label: string }[] = [
    { id: 'templates', icon: LayoutTemplate, label: t('builder.cat_templates') },
    { id: 'elements', icon: Shapes, label: t('builder.cat_elements') },
    { id: 'text', icon: Type, label: t('builder.cat_text') },
    { id: 'library', icon: ImagePlus, label: t('builder.cat_library') },
    { id: 'ai', icon: Sparkles, label: t('builder.cat_ai') },
  ];

  const scaledH = Math.round(displayH * canvasScale);
  const handleScale = 1 / canvasScale;

  function layerLabel(el: El) {
    if (el.type === 'text') return el.text.split('\n')[0] || t('builder.cat_text');
    return t(`builder.type_${el.type}`);
  }

  return (
    <div ref={studioRef} className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-white">
      {/* Werkzeugleiste */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--line)] px-3 py-2.5">
        <label className="flex items-center gap-2 text-xs text-[color:var(--ink-3)]">
          {t('builder.cat_format')}
          <select
            value={formatId}
            onChange={(e) => {
              setFormatId(e.target.value);
            }}
            className="rounded-md border border-[color:var(--line-strong)] bg-white px-2 py-1 text-xs text-[color:var(--ink)]"
          >
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label.startsWith('builder.') ? t(f.label) : f.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1.5 text-xs text-[color:var(--ink-3)]">
          {t('builder.background')}
          <Segmented
            value={bgMode}
            onChange={(v) => setBgMode(v)}
            options={[
              { value: 'transparent', label: t('builder.bg_transparent') },
              { value: 'white', label: t('builder.bg_white') },
              { value: 'color', label: t('builder.bg_color') },
            ]}
          />
          {bgMode === 'color' && (
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-[color:var(--line)]" />
          )}
        </div>

        {previewUrl && (
          <div className="flex items-center gap-2 text-xs text-[color:var(--ink-3)]">
            <button
              type="button"
              onClick={() => setShowPhoto((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition ${
                showPhoto ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50'
              }`}
            >
              <ImgIcon className="h-3.5 w-3.5" />
              {t('builder.show_photo')}
            </button>
            {showPhoto && (
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(photoOpacity * 100)}
                onChange={(e) => setPhotoOpacity(Number(e.target.value) / 100)}
                aria-label={t('builder.photo_opacity')}
                title={t('builder.photo_opacity')}
                className="w-24 accent-[#c2410c]"
              />
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <IconBtn label={t('builder.undo')} onClick={undo} disabled={past.current.length === 0}>
            <Undo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={t('builder.redo')} onClick={redo} disabled={future.current.length === 0}>
            <Redo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={t('builder.new_design')} onClick={clearAll} disabled={els.length === 0}>
            <FilePlus2 className="h-4 w-4" />
          </IconBtn>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || exporting || els.length === 0}
            className="glass-button-primary ml-2 py-1.5 text-sm disabled:opacity-60"
          >
            {saving || exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('builder.save_overlay')}
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] bg-slate-50 px-4 py-2 text-xs text-[color:var(--ink-2)]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
            ×
          </button>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-stretch">
        {/* Kategorien */}
        <div className="flex shrink-0 flex-row gap-1 border-b border-[color:var(--line)] bg-slate-50 p-2 xl:w-[76px] xl:flex-col xl:border-b-0 xl:border-r">
          {RAIL.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPanel(item.id)}
              className={`relative flex flex-1 flex-col items-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-medium transition xl:flex-none ${
                panel === item.id && !panelCollapsed
                  ? 'bg-white text-brand-700 shadow-[0_1px_2px_rgba(16,24,40,0.08)]'
                  : 'text-[color:var(--ink-3)] hover:bg-white hover:text-[color:var(--ink)]'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
              {item.id === 'library' && library.length > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[9px] font-semibold text-white">
                  {library.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {!panelCollapsed && (
          <div className="shrink-0 space-y-4 border-b border-[color:var(--line)] p-3 xl:max-h-[720px] xl:w-60 xl:overflow-y-auto xl:border-b-0 xl:border-r">
            {panel === 'templates' && (
              <div>
                <PanelTitle>{t('builder.cat_templates')}</PanelTitle>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((tpl) => {
                    const preview = tpl.build(displayH, title, t('builder.tpl_tagline'));
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => applyTemplate(tpl.id)}
                        className="group overflow-hidden rounded-lg border border-[color:var(--line)] text-left transition hover:border-brand-300"
                      >
                        <div className="bg-slate-700">
                          <OverlayThumb els={preview} height={displayH} width={104} />
                        </div>
                        <p className="truncate px-1.5 py-1 text-[11px] font-medium text-[color:var(--ink-2)] group-hover:text-brand-700">{t(tpl.label)}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">{t('builder.tpl_hint')}</p>
              </div>
            )}

            {panel === 'elements' && (
              <>
                <div>
                  <PanelTitle>{t('builder.shapes')}</PanelTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    <PanelBtn onClick={() => add(makeRect(cx, cy, 240, 90))} icon={Square} label={t('builder.bar')} />
                    <PanelBtn
                      onClick={() => add(makeRect(0, displayH - 180, DISPLAY_W, 180, { fill: 'rgba(0,0,0,0)', gradientTo: '#000000', radius: 0, opacity: 0.8 }))}
                      icon={Minus}
                      label={t('builder.gradient_bar')}
                    />
                    <PanelBtn onClick={() => add(makeEllipse(cx, cy, 140))} icon={Circle} label={t('builder.circle')} />
                    <PanelBtn onClick={() => add(makeTriangle(cx, cy, 140))} icon={Triangle} label={t('builder.triangle')} />
                    <PanelBtn onClick={() => add(makeStar(cx, cy, 140))} icon={Star} label={t('builder.star')} />
                    <PanelBtn onClick={() => add(makeLine(cx, cy, 260))} icon={Minus} label={t('builder.line')} />
                  </div>
                </div>
                <div>
                  <PanelTitle>{t('builder.frames')}</PanelTitle>
                  <div className="grid grid-cols-3 gap-1.5">
                    <PanelBtn onClick={() => add(makeFrame(20, DISPLAY_W, displayH, { strokeWidth: 6 }))} icon={Frame} label={t('builder.frame_thin')} />
                    <PanelBtn onClick={() => add(makeFrame(20, DISPLAY_W, displayH, { strokeWidth: 18 }))} icon={Frame} label={t('builder.frame_thick')} />
                    <PanelBtn onClick={() => add(makeFrame(20, DISPLAY_W, displayH, { strokeWidth: 12, radius: 40 }))} icon={Frame} label={t('builder.frame_round')} />
                  </div>
                </div>
              </>
            )}

            {panel === 'text' && (
              <div>
                <PanelTitle>{t('builder.add_text')}</PanelTitle>
                <div className="space-y-1.5">
                  <button type="button" onClick={() => addText(56, { fontWeight: 900 })} className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2.5 text-left text-lg font-bold text-[color:var(--ink)] hover:border-brand-300">
                    {t('builder.heading')}
                  </button>
                  <button type="button" onClick={() => addText(32)} className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-left text-base font-semibold text-[color:var(--ink)] hover:border-brand-300">
                    {t('builder.cat_text')}
                  </button>
                  <button type="button" onClick={() => addText(20, { fontWeight: 400 })} className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-left text-sm text-[color:var(--ink-2)] hover:border-brand-300">
                    {t('builder.small_text')}
                  </button>
                  <button
                    type="button"
                    onClick={() => addText(26, { bgColor: '#c2410c', shadow: false })}
                    className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-left text-sm hover:border-brand-300"
                  >
                    <span className="rounded bg-brand-600 px-2 py-0.5 font-semibold text-white">{t('builder.label_text')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addText(30, { text: title } as Partial<TextEl>)}
                    className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2 text-left text-sm text-[color:var(--ink-2)] hover:border-brand-300"
                  >
                    {title}
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-[color:var(--ink-3)]">{t('builder.tip_dblclick')}</p>
              </div>
            )}

            {panel === 'library' && (
              <div>
                <PanelTitle>{t('builder.cat_library')}</PanelTitle>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleLibraryFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={libraryBusy} className="glass-button-secondary w-full py-1.5 text-sm">
                  {libraryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {t('builder.upload_image')}
                </button>
                <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">
                  {librarySessionOnly ? t('builder.library_session_only') : t('builder.library_hint')}
                </p>
                {library.length === 0 ? (
                  <p className="mt-3 text-xs text-[color:var(--ink-3)]">{t('builder.no_uploads')}</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {library.map((item) => (
                      <div key={item.path} className="group relative overflow-hidden rounded-lg border border-[color:var(--line)]" style={{ background: CHECKER }}>
                        <button
                          type="button"
                          onClick={() => void insertImage(item.url, item.sessionOnly ? undefined : item.path)}
                          className="flex h-20 w-full items-center justify-center p-1.5"
                          title={t('builder.insert', { name: item.name })}
                        >
                          <img src={item.url} alt={item.name} crossOrigin="anonymous" className="max-h-full max-w-full object-contain" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteLibraryItem(item)}
                          aria-label={t('perso.delete_asset', { name: item.name })}
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
                <PanelTitle>{t('builder.generate_title')}</PanelTitle>
                <div className="space-y-2">
                  <input value={genMessage} onChange={(e) => setGenMessage(e.target.value)} placeholder={t('builder.message_ph')} className="glass-input w-full text-sm" />
                  <textarea value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} rows={3} placeholder={t('builder.prompt_ph')} className="glass-input w-full text-sm" />
                  {generateError && <p className="text-xs text-rose-600">{generateError}</p>}
                  <button
                    type="button"
                    onClick={() => void onGenerate(genMessage, genPrompt)}
                    disabled={generating || (!genMessage && !genPrompt)}
                    className="glass-button-primary w-full py-1.5 text-sm disabled:opacity-60"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {t('builder.generate')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPanelCollapsed((c) => !c)}
          title={panelCollapsed ? t('builder.show_categories') : t('builder.hide_categories')}
          aria-label={panelCollapsed ? t('builder.show_categories') : t('builder.hide_categories')}
          className="hidden shrink-0 items-center justify-center border-r border-[color:var(--line)] text-[color:var(--ink-3)] transition hover:bg-slate-50 hover:text-[color:var(--ink)] xl:flex xl:w-4"
        >
          {panelCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {/* Zeichenfläche */}
        <div className="min-w-0 flex-1 bg-[color:var(--canvas)] p-4 sm:p-6">
          <div ref={shellRef} className="w-full">
            <div style={{ height: scaledH }} className="relative w-full">
              <div
                className="relative select-none overflow-hidden rounded-md shadow-[0_1px_3px_rgba(16,24,40,0.12)]"
                style={{
                  width: DISPLAY_W,
                  height: displayH,
                  background: background ?? CHECKER,
                  transform: `scale(${canvasScale})`,
                  transformOrigin: 'top left',
                }}
                onPointerDown={() => {
                  setSelectedId(null);
                  setEditingTextId(null);
                }}
              >
                {showPhoto && previewUrl && (
                  <img
                    src={previewUrl}
                    alt=""
                    draggable={false}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: photoOpacity, pointerEvents: 'none' }}
                  />
                )}

                {els.map((el) => {
                  if (el.hidden) return null;
                  const isSel = selectedId === el.id;
                  return (
                    <div
                      key={el.id}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(el.id, node);
                        else nodeRefs.current.delete(el.id);
                      }}
                      onPointerDown={(e) => startDrag(e, el, 'move')}
                      onDoubleClick={() => el.type === 'text' && !el.locked && setEditingTextId(el.id)}
                      style={{
                        ...boxStyle(el),
                        cursor: el.locked ? 'default' : 'move',
                        touchAction: 'none',
                        outline: isSel ? `${2 * handleScale}px solid #c2410c` : undefined,
                        outlineOffset: 2 * handleScale,
                      }}
                    >
                      {el.type === 'text' && editingTextId === el.id ? (
                        <textarea
                          autoFocus
                          value={el.text}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => update(el.id, { text: e.target.value }, `${el.id}:text`)}
                          onBlur={() => setEditingTextId(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) setEditingTextId(null);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          rows={Math.max(1, el.text.split('\n').length)}
                          style={{
                            font: `${el.italic ? 'italic ' : ''}${el.fontWeight} ${el.fontSize}px '${el.fontFamily}', sans-serif`,
                            color: el.fill,
                            background: 'rgba(255,255,255,0.12)',
                            border: '1px dashed #c2410c',
                            padding: 0,
                            resize: 'none',
                            outline: 'none',
                            lineHeight: 1.2,
                            textAlign: el.align,
                            letterSpacing: el.letterSpacing,
                            minWidth: 80,
                            width: Math.max(80, Math.max(...el.text.split('\n').map((l) => l.length)) * el.fontSize * 0.62),
                          }}
                        />
                      ) : (
                        <ElementBody el={el} />
                      )}

                      {isSel && !el.locked && editingTextId !== el.id && (
                        <>
                          <Handle scale={handleScale} pos="br" cursor="nwse-resize" onPointerDown={(e) => startDrag(e, el, 'resize')} />
                          {el.type !== 'text' && (
                            <Handle scale={handleScale} pos="r" cursor="ew-resize" onPointerDown={(e) => startDrag(e, el, 'resize-x')} />
                          )}
                          {hasBox(el) && (
                            <Handle scale={handleScale} pos="b" cursor="ns-resize" onPointerDown={(e) => startDrag(e, el, 'resize-y')} />
                          )}
                          <Handle scale={handleScale} pos="rotate" cursor="grab" onPointerDown={(e) => startDrag(e, el, 'rotate')} />
                        </>
                      )}
                    </div>
                  );
                })}

                {guides.v.map((x) => (
                  <div key={`v${x}`} style={{ position: 'absolute', left: x, top: 0, bottom: 0, width: handleScale, background: '#e11d48', pointerEvents: 'none' }} />
                ))}
                {guides.h.map((y) => (
                  <div key={`h${y}`} style={{ position: 'absolute', top: y, left: 0, right: 0, height: handleScale, background: '#e11d48', pointerEvents: 'none' }} />
                ))}

                {els.length === 0 && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <p className="rounded-full bg-white/90 px-5 py-2.5 text-[18px] text-[color:var(--ink-3)] shadow-sm">{t('builder.empty_canvas')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-[color:var(--ink-3)]">{t('builder.canvas_help')}</p>
        </div>

        {/* Eigenschaften und Ebenen */}
        <div className="shrink-0 border-t border-[color:var(--line)] xl:max-h-[720px] xl:w-72 xl:overflow-y-auto xl:border-l xl:border-t-0">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-0.5 border-b border-[color:var(--line)] px-3 py-2">
                <IconBtn label={t('builder.forward')} onClick={() => moveLayer(1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={t('builder.backward')} onClick={() => moveLayer(-1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={t('builder.duplicate')} onClick={duplicateSel}>
                  <Copy className="h-4 w-4" />
                </IconBtn>
                <IconBtn label={selected.locked ? t('builder.unlock') : t('builder.lock')} onClick={() => patchSel({ locked: !selected.locked })}>
                  {selected.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </IconBtn>
                <IconBtn label={t('builder.delete')} onClick={deleteSel} danger>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>

              {selected.type === 'text' && (
                <Section title={t('builder.cat_text')}>
                  <textarea
                    value={selected.text}
                    onChange={(e) => patchSel({ text: e.target.value }, 'text')}
                    rows={2}
                    className="glass-input w-full py-1.5 text-sm"
                  />
                  <select value={selected.fontFamily} onChange={(e) => patchSel({ fontFamily: e.target.value })} className="glass-input w-full py-1.5 text-sm">
                    {FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <Segmented
                      value={String(selected.fontWeight)}
                      onChange={(v) => patchSel({ fontWeight: Number(v) as TextEl['fontWeight'] })}
                      options={[
                        { value: '400', label: t('builder.weight_regular') },
                        { value: '700', label: <Bold className="h-3.5 w-3.5" /> },
                        { value: '900', label: t('builder.weight_black') },
                      ]}
                    />
                    <ToggleBtn active={selected.italic} label={t('builder.italic')} onClick={() => patchSel({ italic: !selected.italic })}>
                      <Italic className="h-3.5 w-3.5" />
                    </ToggleBtn>
                  </div>
                  <Segmented
                    value={selected.align}
                    onChange={(v) => patchSel({ align: v as TextEl['align'] })}
                    options={[
                      { value: 'left', label: <AlignLeft className="h-3.5 w-3.5" /> },
                      { value: 'center', label: <AlignCenter className="h-3.5 w-3.5" /> },
                      { value: 'right', label: <AlignRight className="h-3.5 w-3.5" /> },
                    ]}
                  />
                  <Slider label={t('builder.size_px', { value: selected.fontSize })} min={8} max={240} value={selected.fontSize} onChange={(v) => patchSel({ fontSize: v }, 'fontSize')} />
                  <Slider label={t('builder.letter_spacing', { value: selected.letterSpacing })} min={-4} max={30} value={selected.letterSpacing} onChange={(v) => patchSel({ letterSpacing: v }, 'ls')} />
                  <ColorField label={t('builder.color')} value={selected.fill} onChange={(v) => patchSel({ fill: v }, 'fill')} />
                  <Check label={t('builder.shadow')} checked={selected.shadow} onChange={(v) => patchSel({ shadow: v })} />
                  <Slider label={t('builder.outline', { value: selected.strokeWidth })} min={0} max={20} value={selected.strokeWidth} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} />
                  {selected.strokeWidth > 0 && (
                    <ColorField label={t('builder.outline_color')} value={selected.strokeColor} onChange={(v) => patchSel({ strokeColor: v }, 'sc')} />
                  )}
                  <Check
                    label={t('builder.text_background')}
                    checked={selected.bgColor !== null}
                    onChange={(v) => patchSel({ bgColor: v ? '#c2410c' : null })}
                  />
                  {selected.bgColor !== null && (
                    <>
                      <ColorField label={t('builder.fill')} value={selected.bgColor} onChange={(v) => patchSel({ bgColor: v }, 'bg')} />
                      <Slider label={t('builder.padding', { value: selected.bgPadding })} min={0} max={60} value={selected.bgPadding} onChange={(v) => patchSel({ bgPadding: v }, 'pad')} />
                    </>
                  )}
                </Section>
              )}

              {selected.type !== 'text' && (
                <Section title={t('builder.appearance')}>
                  {(selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'triangle' || selected.type === 'star') && (
                    <ColorField label={t('builder.fill')} value={selected.fill} onChange={(v) => patchSel({ fill: v }, 'fill')} />
                  )}
                  {selected.type === 'rect' && (
                    <>
                      <Check
                        label={t('builder.gradient')}
                        checked={selected.gradientTo !== null}
                        onChange={(v) => patchSel({ gradientTo: v ? '#000000' : null })}
                      />
                      {selected.gradientTo !== null && (
                        <>
                          <ColorField label={t('builder.gradient_to')} value={selected.gradientTo} onChange={(v) => patchSel({ gradientTo: v }, 'gt')} />
                          <Segmented
                            value={selected.gradientDir}
                            onChange={(v) => patchSel({ gradientDir: v as GradientDir })}
                            options={[
                              { value: 'down', label: <ArrowDown className="h-3.5 w-3.5" /> },
                              { value: 'up', label: <ArrowUp className="h-3.5 w-3.5" /> },
                              { value: 'right', label: <ChevronRight className="h-3.5 w-3.5" /> },
                              { value: 'left', label: <ChevronLeft className="h-3.5 w-3.5" /> },
                            ]}
                          />
                        </>
                      )}
                    </>
                  )}
                  {(selected.type === 'rect' || selected.type === 'ellipse' || selected.type === 'frame' || selected.type === 'line') && (
                    <ColorField
                      label={selected.type === 'frame' || selected.type === 'line' ? t('builder.color') : t('builder.border')}
                      value={selected.stroke}
                      onChange={(v) => patchSel({ stroke: v }, 'stroke')}
                    />
                  )}
                  {(selected.type === 'rect' || selected.type === 'ellipse') && (
                    <Slider label={t('builder.border_width', { value: selected.strokeWidth })} min={0} max={40} value={selected.strokeWidth} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} />
                  )}
                  {(selected.type === 'frame' || selected.type === 'line') && (
                    <Slider label={t('builder.thickness', { value: selected.strokeWidth })} min={1} max={80} value={selected.strokeWidth} onChange={(v) => patchSel({ strokeWidth: v }, 'sw')} />
                  )}
                  {(selected.type === 'rect' || selected.type === 'frame' || selected.type === 'image') && (
                    <Slider label={t('builder.corner_radius', { value: selected.radius })} min={0} max={240} value={selected.radius} onChange={(v) => patchSel({ radius: v }, 'radius')} />
                  )}
                  {selected.type === 'image' && (
                    <button type="button" onClick={() => patchSel({ flipX: !selected.flipX })} className="glass-button-secondary w-full py-1.5 text-sm">
                      <FlipHorizontal className="h-4 w-4" />
                      {t('builder.flip')}
                    </button>
                  )}
                </Section>
              )}

              <Section title={t('builder.position_size')}>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="X" value={selected.x} onChange={(v) => patchSel({ x: v }, 'x')} />
                  <NumberField label="Y" value={selected.y} onChange={(v) => patchSel({ y: v }, 'y')} />
                  {selected.type !== 'text' && (
                    <NumberField label={t('builder.width')} value={selected.width} onChange={(v) => patchSel({ width: Math.max(4, v) }, 'w')} />
                  )}
                  {hasBox(selected) && (
                    <NumberField label={t('builder.height')} value={selected.height} onChange={(v) => patchSel({ height: Math.max(4, v) }, 'h')} />
                  )}
                </div>
                <Slider label={t('builder.rotation', { value: selected.rotation })} min={-180} max={180} value={selected.rotation} onChange={(v) => patchSel({ rotation: v }, 'rot')} />
                <Slider
                  label={t('builder.opacity', { value: Math.round(selected.opacity * 100) })}
                  min={5}
                  max={100}
                  value={Math.round(selected.opacity * 100)}
                  onChange={(v) => patchSel({ opacity: v / 100 }, 'op')}
                />
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => centerSel('x')} className="glass-button-secondary flex-1 px-2 py-1.5 text-xs">
                    <AlignCenterHorizontal className="h-3.5 w-3.5" />
                    {t('builder.center_h')}
                  </button>
                  <button type="button" onClick={() => centerSel('y')} className="glass-button-secondary flex-1 px-2 py-1.5 text-xs">
                    <AlignCenterVertical className="h-3.5 w-3.5" />
                    {t('builder.center_v')}
                  </button>
                </div>
                {selected.rotation !== 0 && (
                  <button type="button" onClick={() => patchSel({ rotation: 0 })} className="flex items-center gap-1.5 text-xs text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
                    <RotateCw className="h-3.5 w-3.5" />
                    {t('builder.reset_rotation')}
                  </button>
                )}
              </Section>
            </>
          ) : (
            <p className="border-b border-[color:var(--line)] px-4 py-4 text-xs text-[color:var(--ink-3)]">{t('builder.select_hint')}</p>
          )}

          <Section title={t('builder.layers', { count: els.length })}>
            {els.length === 0 ? (
              <p className="text-xs text-[color:var(--ink-3)]">{t('builder.no_layers')}</p>
            ) : (
              <div className={`space-y-0.5 ${layerDrag ? 'select-none' : ''}`}>
                {layersTopFirst.map((el, index) => (
                  <div key={el.id}>
                    {layerDrag && layerDrag.gap === index && <div className="mx-1 h-0.5 rounded-full bg-brand-500" />}
                    <div
                      ref={(node) => {
                        if (node) layerRows.current.set(el.id, node);
                        else layerRows.current.delete(el.id);
                      }}
                      onClick={() => setSelectedId(el.id)}
                      className={`group/layer flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition ${
                        selectedId === el.id ? 'bg-brand-50 text-brand-700' : 'text-[color:var(--ink-2)] hover:bg-slate-50'
                      } ${layerDrag?.id === el.id ? 'opacity-40' : ''}`}
                    >
                      <span
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          setLayerDrag({ id: el.id, gap: index });
                        }}
                        onPointerMove={(e) => {
                          if (!layerDrag) return;
                          const gap = layerGap(e.clientY);
                          if (gap !== layerDrag.gap) setLayerDrag({ ...layerDrag, gap });
                        }}
                        onPointerUp={finishLayerDrag}
                        onPointerCancel={() => setLayerDrag(null)}
                        style={{ touchAction: 'none' }}
                        className="cursor-grab text-[color:var(--ink-3)] active:cursor-grabbing"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                      <LayerIcon el={el} />
                      <span className={`min-w-0 flex-1 truncate ${el.hidden ? 'opacity-40' : ''}`}>{layerLabel(el)}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          update(el.id, { locked: !el.locked });
                        }}
                        aria-label={el.locked ? t('builder.unlock') : t('builder.lock')}
                        className={`rounded p-0.5 hover:bg-white ${el.locked ? '' : 'opacity-0 group-hover/layer:opacity-100'}`}
                      >
                        {el.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          update(el.id, { hidden: !el.hidden });
                        }}
                        aria-label={el.hidden ? t('builder.show') : t('builder.hide')}
                        className="rounded p-0.5 hover:bg-white"
                      >
                        {el.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {layerDrag && index === layersTopFirst.length - 1 && layerDrag.gap === layersTopFirst.length && (
                      <div className="mx-1 h-0.5 rounded-full bg-brand-500" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// --- Kleine Bausteine ----------------------------------------------------------

function Handle({
  pos,
  cursor,
  scale,
  onPointerDown,
}: {
  pos: 'br' | 'r' | 'b' | 'rotate';
  cursor: string;
  scale: number;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  const size = 26;
  const place: Record<string, CSSProperties> = {
    br: { right: -size / 2, bottom: -size / 2 },
    r: { right: -size / 2, top: '50%', marginTop: -size / 2 },
    b: { bottom: -size / 2, left: '50%', marginLeft: -size / 2 },
    rotate: { top: -size / 2 - 34 * scale, left: '50%', marginLeft: -size / 2 },
  };
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor,
        touchAction: 'none',
        transform: `scale(${scale})`,
        ...place[pos],
      }}
    >
      {pos === 'rotate' ? (
        <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', border: '2px solid #c2410c', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RotateCw style={{ width: 9, height: 9, color: '#c2410c' }} />
        </div>
      ) : (
        <div
          style={{
            width: pos === 'br' ? 13 : pos === 'r' ? 6 : 16,
            height: pos === 'br' ? 13 : pos === 'r' ? 16 : 6,
            borderRadius: 4,
            background: '#fff',
            border: '2px solid #c2410c',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-semibold text-[color:var(--ink-2)]">{children}</p>;
}

function PanelBtn({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Type; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-[color:var(--line)] px-1 py-2.5 text-[11px] font-medium text-[color:var(--ink-2)] transition hover:border-brand-300 hover:text-brand-700"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition disabled:opacity-30 ${
        danger ? 'text-rose-600 hover:bg-rose-50' : 'text-[color:var(--ink-3)] hover:bg-slate-100 hover:text-[color:var(--ink)]'
      }`}
    >
      {children}
    </button>
  );
}

function ToggleBtn({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`rounded-md border px-2 py-1 transition ${
        active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-[color:var(--line-strong)] text-[color:var(--ink-2)] hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-md border border-[color:var(--line-strong)] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center rounded px-2 py-0.5 text-xs transition ${
            value === o.value ? 'bg-[color:var(--ink)] text-white' : 'text-[color:var(--ink-2)] hover:bg-slate-100'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-[color:var(--line)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={`h-3.5 w-3.5 text-[color:var(--ink-3)] transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-xs text-[color:var(--ink-3)]">
      {label}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[#c2410c]" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-[11px] text-[color:var(--ink-3)]">
      {label}
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
        className="mt-0.5 w-full rounded-md border border-[color:var(--line-strong)] bg-white px-2 py-1 text-xs text-[color:var(--ink)]"
      />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-[color:var(--ink-3)]">{label}</span>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-[color:var(--line)]" />
      </div>
      <div className="flex flex-wrap gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={`h-5 w-5 rounded-full border ${hex.toLowerCase() === c ? 'ring-2 ring-brand-500 ring-offset-1' : 'border-black/10'}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-[color:var(--ink-2)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#c2410c]" />
      {label}
    </label>
  );
}

function LayerIcon({ el }: { el: El }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  switch (el.type) {
    case 'text':
      return <Type className={cls} />;
    case 'image':
      return <ImgIcon className={cls} />;
    case 'ellipse':
      return <Circle className={cls} />;
    case 'triangle':
      return <Triangle className={cls} />;
    case 'star':
      return <Star className={cls} />;
    case 'line':
      return <Minus className={cls} />;
    case 'frame':
      return <Frame className={cls} />;
    default:
      return <Square className={cls} />;
  }
}
