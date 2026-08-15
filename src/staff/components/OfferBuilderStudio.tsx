import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowRight,
  Briefcase,
  Check,
  Download,
  ImagePlus,
  LayoutTemplate,
  Minus,
  Palette,
  Plus,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';

export interface OfferLeadOption {
  id: string;
  label: string;
  company: string;
  email: string;
  sourceLabel: string;
  projectType: string;
  country: string;
  note: string;
}

type OfferTemplate = {
  id: string;
  label: string;
  kicker: string;
  accent: string;
  accentSoft: string;
  surface: string;
  pageGlow: string;
  title: string;
  intro: string;
  modules: Array<{ id: string; title: string; description: string }>;
  lineItems: Array<{ label: string; qty: number; unitPrice: number; note: string }>;
};

type OfferBlockType = 'logo' | 'hero' | 'headline' | 'intro' | 'modules' | 'pricing' | 'next' | 'badge' | 'text' | 'image';

type OfferBlock = {
  id: string;
  type: OfferBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  title?: string;
  body?: string;
  fill?: string;
  color?: string;
  imageUrl?: string | null;
};

type OfferItem = {
  id: string;
  label: string;
  qty: number;
  unitPrice: number;
  note: string;
};

type OfferModule = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

type OfferForm = {
  offerTitle: string;
  clientName: string;
  company: string;
  email: string;
  projectName: string;
  location: string;
  validUntil: string;
  intro: string;
  nextSteps: string;
  accent: string;
  accentSoft: string;
  surface: string;
  pageGlow: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
};

const PAGE_W = 760;
const PAGE_H = 1075;

const templatePresets: OfferTemplate[] = [
  {
    id: 'livepictures',
    label: 'Live Pictures Sales',
    kicker: 'Schneller Vertriebsabschluss',
    accent: '#ff7b29',
    accentSoft: '#ffe8da',
    surface: '#fff8f2',
    pageGlow: 'linear-gradient(180deg, #fffaf5 0%, #fff3e7 100%)',
    title: 'Live Pictures Angebot',
    intro:
      'Wir kombinieren Verkaufsfläche, Live-Erlebnis und sofortigen Upsell in einem kompakten Setup, das sich schnell einführen und sauber branden lässt.',
    modules: [
      { id: 'm1', title: 'Individuelle Angebotsstruktur', description: 'Vorbereitete Text- und Leistungsblöcke passend zur Anfrage.' },
      { id: 'm2', title: 'Branding & Logo-Tausch', description: 'Farben, Logo, Bildwelt und Claim in Minuten anpassen.' },
      { id: 'm3', title: 'PDF & Präsentationsansicht', description: 'Direkt aus dem Vertriebstool als saubere A4-Seite exportierbar.' },
    ],
    lineItems: [
      { label: 'Konzept & Angebotserstellung', qty: 1, unitPrice: 950, note: 'Vorlage, Storyline, Angebotsaufbau' },
      { label: 'Individuelle Markenanpassung', qty: 1, unitPrice: 420, note: 'Logo, Farben, Bilder, Angebotscover' },
      { label: 'Launch-Paket Vertrieb', qty: 1, unitPrice: 680, note: 'Feinschliff, PDF, finale Verkaufsfassung' },
    ],
  },
  {
    id: 'premium',
    label: 'Premium Pitch',
    kicker: 'Visuell stark',
    accent: '#1953ff',
    accentSoft: '#e4ebff',
    surface: '#f6f9ff',
    pageGlow: 'linear-gradient(180deg, #ffffff 0%, #eef4ff 100%)',
    title: 'Premium Angebot',
    intro:
      'Für anspruchsvolle Projekte mit stärkerem Pitch-Charakter: klare Struktur, große Visuals und ein prägnanter Business Case auf einer Seite.',
    modules: [
      { id: 'm1', title: 'Executive Summary', description: 'Kernaussage, Nutzenbild und Ziele direkt im ersten Sichtfeld.' },
      { id: 'm2', title: 'Projektmodule', description: 'Leistungspakete mit klarer Differenzierung und Verkaufslogik.' },
      { id: 'm3', title: 'Abschlussorientierter CTA', description: 'Nächster Schritt, Timing und Abschlussfenster klar benannt.' },
    ],
    lineItems: [
      { label: 'Premium Angebotsdesign', qty: 1, unitPrice: 1250, note: 'Pitchstruktur und Premium-Gestaltung' },
      { label: 'Bild- und Content-Adaption', qty: 1, unitPrice: 540, note: 'Visuals, Sprachton, Markenfit' },
      { label: 'Vertriebsfreigabe final', qty: 1, unitPrice: 390, note: 'Finalisierung für Versand oder Termin' },
    ],
  },
];

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function toCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.readAsDataURL(file);
  });
}

function createDefaultBlocks(): OfferBlock[] {
  return [
    { id: 'logo', type: 'logo', x: 42, y: 34, w: 120, h: 58, label: 'Logo' },
    { id: 'badge', type: 'badge', x: 528, y: 36, w: 168, h: 34, label: 'Badge', title: 'Bereit in wenigen Minuten' },
    { id: 'headline', type: 'headline', x: 42, y: 114, w: 360, h: 150, label: 'Titel' },
    { id: 'hero', type: 'hero', x: 440, y: 108, w: 260, h: 184, label: 'Hero' },
    { id: 'intro', type: 'intro', x: 42, y: 292, w: 658, h: 118, label: 'Intro' },
    { id: 'modules', type: 'modules', x: 42, y: 436, w: 314, h: 378, label: 'Leistungsblöcke' },
    { id: 'pricing', type: 'pricing', x: 382, y: 436, w: 318, h: 378, label: 'Preise' },
    { id: 'next', type: 'next', x: 42, y: 842, w: 658, h: 176, label: 'Nächste Schritte' },
  ];
}

function clampBlock(block: OfferBlock): OfferBlock {
  return {
    ...block,
    x: Math.min(Math.max(16, block.x), PAGE_W - block.w - 16),
    y: Math.min(Math.max(16, block.y), PAGE_H - block.h - 16),
    w: Math.min(Math.max(72, block.w), PAGE_W - 32),
    h: Math.min(Math.max(44, block.h), PAGE_H - 32),
  };
}

function buildFormFromTemplate(template: OfferTemplate): OfferForm {
  const in14Days = new Date();
  in14Days.setDate(in14Days.getDate() + 14);
  return {
    offerTitle: template.title,
    clientName: '',
    company: '',
    email: '',
    projectName: '',
    location: '',
    validUntil: in14Days.toISOString().slice(0, 10),
    intro: template.intro,
    nextSteps: '1. Angebot intern abstimmen\n2. Gewünschte Module bestätigen\n3. Finale PDF-Version freigeben',
    accent: template.accent,
    accentSoft: template.accentSoft,
    surface: template.surface,
    pageGlow: template.pageGlow,
    logoUrl: null,
    heroImageUrl: null,
  };
}

export default function OfferBuilderStudio({ leadOptions }: { leadOptions: OfferLeadOption[] }) {
  const [activeTemplateId, setActiveTemplateId] = useState(templatePresets[0].id);
  const activeTemplate = useMemo(
    () => templatePresets.find((entry) => entry.id === activeTemplateId) ?? templatePresets[0],
    [activeTemplateId],
  );
  const [form, setForm] = useState<OfferForm>(() => buildFormFromTemplate(templatePresets[0]));
  const [modules, setModules] = useState<OfferModule[]>(
    () => templatePresets[0].modules.map((module) => ({ ...module, enabled: true })),
  );
  const [lineItems, setLineItems] = useState<OfferItem[]>(
    () => templatePresets[0].lineItems.map((item) => ({ id: uid('item'), ...item })),
  );
  const [blocks, setBlocks] = useState<OfferBlock[]>(() => createDefaultBlocks());
  const [selectedBlockId, setSelectedBlockId] = useState<string>('headline');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageBlockRef = useRef<string | null>(null);
  const dragStateRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    setForm((prev) => ({
      ...buildFormFromTemplate(activeTemplate),
      clientName: prev.clientName,
      company: prev.company,
      email: prev.email,
      projectName: prev.projectName,
      location: prev.location,
      logoUrl: prev.logoUrl,
      heroImageUrl: prev.heroImageUrl,
    }));
    setModules(activeTemplate.modules.map((module) => ({ ...module, enabled: true })));
    setLineItems(activeTemplate.lineItems.map((item) => ({ id: uid('item'), ...item })));
  }, [activeTemplate]);

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const enabledModules = modules.filter((module) => module.enabled);
  const subtotal = lineItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);

  const pageTitle = form.company ? `${form.offerTitle} für ${form.company}` : form.offerTitle;

  function updateForm<K extends keyof OfferForm>(key: K, value: OfferForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBlock(id: string, patch: Partial<OfferBlock>) {
    setBlocks((prev) => prev.map((block) => (block.id === id ? clampBlock({ ...block, ...patch }) : block)));
  }

  function startDrag(event: ReactPointerEvent, block: OfferBlock) {
    event.stopPropagation();
    setSelectedBlockId(block.id);
    dragStateRef.current = { id: block.id, sx: event.clientX, sy: event.clientY, ox: block.x, oy: block.y };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
  }

  function onPointerMove(event: PointerEvent) {
    const state = dragStateRef.current;
    if (!state) return;
    const dx = event.clientX - state.sx;
    const dy = event.clientY - state.sy;
    updateBlock(state.id, { x: state.ox + dx, y: state.oy + dy });
  }

  function stopDrag() {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
  }

  useEffect(() => () => stopDrag(), []);

  async function onUploadFile(
    event: ChangeEvent<HTMLInputElement>,
    onLoad: (value: string) => void,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onLoad(dataUrl);
    event.target.value = '';
  }

  function applyLead() {
    const match = leadOptions.find((entry) => entry.id === selectedLeadId);
    if (!match) return;
    setForm((prev) => ({
      ...prev,
      clientName: match.label,
      company: match.company || match.label,
      email: match.email,
      projectName: match.projectType || prev.projectName,
      location: [match.country, match.sourceLabel].filter(Boolean).join(' • '),
      intro: match.note ? `${prev.intro}\n\nAusgangslage: ${match.note}` : prev.intro,
    }));
  }

  function addTextBlock() {
    const block: OfferBlock = {
      id: uid('block'),
      type: 'text',
      x: 72,
      y: 716,
      w: 246,
      h: 108,
      label: 'Textblock',
      title: 'Neuer Textblock',
      body: 'Eigener Text oder Zusatzmodul',
      fill: '#ffffff',
      color: '#172033',
    };
    setBlocks((prev) => [...prev, block]);
    setSelectedBlockId(block.id);
  }

  function addBadgeBlock() {
    const block: OfferBlock = {
      id: uid('block'),
      type: 'badge',
      x: 496,
      y: 820,
      w: 196,
      h: 38,
      label: 'Badge',
      title: 'Optionales Extra',
    };
    setBlocks((prev) => [...prev, block]);
    setSelectedBlockId(block.id);
  }

  function addImageBlock() {
    const id = uid('block');
    const block: OfferBlock = {
      id,
      type: 'image',
      x: 468,
      y: 308,
      w: 190,
      h: 112,
      label: 'Bild',
      imageUrl: null,
    };
    setBlocks((prev) => [...prev, block]);
    setSelectedBlockId(block.id);
    pendingImageBlockRef.current = id;
    imageInputRef.current?.click();
  }

  function removeSelectedBlock() {
    if (!selectedBlock || ['logo', 'hero', 'headline', 'intro', 'modules', 'pricing', 'next'].includes(selectedBlock.type)) return;
    setBlocks((prev) => prev.filter((block) => block.id !== selectedBlock.id));
    setSelectedBlockId('headline');
  }

  function resetLayout() {
    setBlocks(createDefaultBlocks());
    setSelectedBlockId('headline');
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { id: uid('item'), label: 'Neue Position', qty: 1, unitPrice: 0, note: '' }]);
  }

  function openPrintView() {
    const previewNode = previewRef.current;
    if (!previewNode) return;
    const popup = window.open('', '_blank', 'width=980,height=1200');
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>${pageTitle}</title>
          <style>
            body { margin: 0; padding: 24px; background: #eef2f7; font-family: "SF Pro Text", "Avenir Next", "Segoe UI", sans-serif; }
            .offer-print-wrap { display: flex; justify-content: center; }
            .offer-proposal-page { box-shadow: none !important; }
            @media print {
              body { padding: 0; background: white; }
              .offer-print-wrap { display: block; }
              .offer-proposal-page { margin: 0 auto; }
            }
          </style>
        </head>
        <body>
          <div class="offer-print-wrap">${previewNode.outerHTML}</div>
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  function renderBlock(block: OfferBlock) {
    const sharedStyle = {
      left: block.x,
      top: block.y,
      width: block.w,
      height: block.h,
    };

    if (block.type === 'logo') {
      return (
        <div className="offer-canvas-block offer-canvas-block-ghost" style={sharedStyle}>
          {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="offer-canvas-logo" /> : <span>Logo</span>}
        </div>
      );
    }

    if (block.type === 'hero') {
      return (
        <div className="offer-canvas-block offer-canvas-block-hero" style={sharedStyle}>
          {form.heroImageUrl ? <img src={form.heroImageUrl} alt="" className="offer-canvas-image" /> : <span>Bildfläche</span>}
        </div>
      );
    }

    if (block.type === 'headline') {
      return (
        <div className="offer-canvas-block offer-canvas-block-headline" style={sharedStyle}>
          <span className="offer-canvas-kicker">{activeTemplate.kicker}</span>
          <h2>{pageTitle}</h2>
          <p>{form.projectName || 'Angebot für neue Anfrage'}</p>
          <div className="offer-canvas-meta">
            <span>{form.clientName || 'Kunde'}</span>
            <span>Gültig bis {form.validUntil}</span>
          </div>
        </div>
      );
    }

    if (block.type === 'intro') {
      return (
        <div className="offer-canvas-block offer-canvas-block-copy" style={sharedStyle}>
          <p>{form.intro}</p>
        </div>
      );
    }

    if (block.type === 'modules') {
      return (
        <div className="offer-canvas-block offer-canvas-block-surface" style={sharedStyle}>
          <div className="offer-mini-heading">
            <span>Leistungsblöcke</span>
            <strong>{enabledModules.length}</strong>
          </div>
          <div className="offer-module-stack">
            {enabledModules.map((module) => (
              <div key={module.id} className="offer-module-card">
                <div className="offer-module-icon">
                  <Check size={13} />
                </div>
                <div>
                  <strong>{module.title}</strong>
                  <p>{module.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (block.type === 'pricing') {
      return (
        <div className="offer-canvas-block offer-canvas-block-surface" style={sharedStyle}>
          <div className="offer-mini-heading">
            <span>Angebot</span>
            <strong>{toCurrency(subtotal)}</strong>
          </div>
          <div className="offer-pricing-stack">
            {lineItems.map((item) => (
              <div key={item.id} className="offer-pricing-row">
                <div>
                  <strong>{item.label}</strong>
                  {item.note && <p>{item.note}</p>}
                </div>
                <span>{toCurrency(item.qty * item.unitPrice)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (block.type === 'next') {
      return (
        <div className="offer-canvas-block offer-canvas-block-next" style={sharedStyle}>
          <div className="offer-mini-heading">
            <span>Nächste Schritte</span>
            <ArrowRight size={14} />
          </div>
          <div className="offer-next-copy">
            {form.nextSteps.split('\n').map((line) => (
              <div key={line} className="offer-next-line">
                <span className="offer-next-bullet" />
                <p>{line}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (block.type === 'badge') {
      return (
        <div className="offer-canvas-block offer-canvas-block-chip" style={sharedStyle}>
          {block.title || 'Badge'}
        </div>
      );
    }

    if (block.type === 'image') {
      return (
        <div className="offer-canvas-block offer-canvas-block-hero" style={sharedStyle}>
          {block.imageUrl ? <img src={block.imageUrl} alt="" className="offer-canvas-image" /> : <span>Bild</span>}
        </div>
      );
    }

    return (
      <div
        className="offer-canvas-block offer-canvas-block-note"
        style={{
          ...sharedStyle,
          background: block.fill || '#ffffff',
          color: block.color || '#172033',
        }}
      >
        {block.title && <strong>{block.title}</strong>}
        {block.body && <p>{block.body}</p>}
      </div>
    );
  }

  return (
    <div className="offer-studio-shell">
      <div className="offer-studio-sidebar">
        <section className="card offer-panel">
          <div className="offer-panel-head">
            <div>
              <p className="eyebrow">Angebot erstellen</p>
              <h3>Vertriebs-Studio</h3>
            </div>
            <div className="offer-panel-actions">
              <button type="button" className="secondary inline" onClick={resetLayout}>
                Layout reset
              </button>
              <button type="button" className="inline" onClick={openPrintView}>
                <Download size={14} />
                PDF
              </button>
            </div>
          </div>
          <div className="offer-kpi-row">
            <div className="offer-kpi-card">
              <span>Vorlagen</span>
              <strong>{templatePresets.length}</strong>
            </div>
            <div className="offer-kpi-card">
              <span>Aktive Blöcke</span>
              <strong>{blocks.length}</strong>
            </div>
            <div className="offer-kpi-card">
              <span>Summe</span>
              <strong>{toCurrency(subtotal)}</strong>
            </div>
          </div>
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <LayoutTemplate size={16} />
            <h4>Vorlage & Lead</h4>
          </div>
          <div className="offer-template-grid">
            {templatePresets.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`offer-template-card ${template.id === activeTemplateId ? 'active' : ''}`}
                onClick={() => setActiveTemplateId(template.id)}
              >
                <strong>{template.label}</strong>
                <span>{template.kicker}</span>
              </button>
            ))}
          </div>
          <div className="grid">
            <div>
              <label>Interessent übernehmen</label>
              <select value={selectedLeadId} onChange={(event) => setSelectedLeadId(event.target.value)}>
                <option value="">Lead auswählen</option>
                {leadOptions.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.label} · {lead.sourceLabel}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="secondary" onClick={applyLead} disabled={!selectedLeadId}>
              <Upload size={14} />
              Übernehmen
            </button>
          </div>
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <Briefcase size={16} />
            <h4>Stammdaten</h4>
          </div>
          <div className="grid two">
            <div>
              <label>Angebotstitel</label>
              <input value={form.offerTitle} onChange={(event) => updateForm('offerTitle', event.target.value)} />
            </div>
            <div>
              <label>Gültig bis</label>
              <input type="date" value={form.validUntil} onChange={(event) => updateForm('validUntil', event.target.value)} />
            </div>
            <div>
              <label>Ansprechpartner</label>
              <input value={form.clientName} onChange={(event) => updateForm('clientName', event.target.value)} />
            </div>
            <div>
              <label>Firma</label>
              <input value={form.company} onChange={(event) => updateForm('company', event.target.value)} />
            </div>
            <div>
              <label>E-Mail</label>
              <input value={form.email} onChange={(event) => updateForm('email', event.target.value)} />
            </div>
            <div>
              <label>Projekt</label>
              <input value={form.projectName} onChange={(event) => updateForm('projectName', event.target.value)} />
            </div>
          </div>
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <Palette size={16} />
            <h4>Design & Medien</h4>
          </div>
          <div className="grid three offer-color-grid">
            <div>
              <label>Akzent</label>
              <input type="color" value={form.accent} onChange={(event) => updateForm('accent', event.target.value)} />
            </div>
            <div>
              <label>Soft</label>
              <input type="color" value={form.accentSoft} onChange={(event) => updateForm('accentSoft', event.target.value)} />
            </div>
            <div>
              <label>Fläche</label>
              <input type="color" value={form.surface} onChange={(event) => updateForm('surface', event.target.value)} />
            </div>
          </div>
          <div className="offer-media-actions">
            <button type="button" className="secondary" onClick={() => logoInputRef.current?.click()}>
              <Upload size={14} />
              Logo tauschen
            </button>
            <button type="button" className="secondary" onClick={() => heroInputRef.current?.click()}>
              <ImagePlus size={14} />
              Hero-Bild
            </button>
          </div>
          <input
            ref={logoInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => void onUploadFile(event, (value) => updateForm('logoUrl', value))}
          />
          <input
            ref={heroInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => void onUploadFile(event, (value) => updateForm('heroImageUrl', value))}
          />
          <input
            ref={imageInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) =>
              void onUploadFile(event, (value) => {
                const blockId = pendingImageBlockRef.current;
                if (blockId) updateBlock(blockId, { imageUrl: value });
              })
            }
          />
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <Sparkles size={16} />
            <h4>Bausteine</h4>
          </div>
          <div className="offer-module-config">
            {modules.map((module) => (
              <label key={module.id} className={`offer-toggle-row ${module.enabled ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={module.enabled}
                  onChange={(event) =>
                    setModules((prev) =>
                      prev.map((entry) => (entry.id === module.id ? { ...entry, enabled: event.target.checked } : entry)),
                    )
                  }
                />
                <div>
                  <strong>{module.title}</strong>
                  <span>{module.description}</span>
                </div>
              </label>
            ))}
          </div>
          <div>
            <label>Einleitung</label>
            <textarea rows={5} value={form.intro} onChange={(event) => updateForm('intro', event.target.value)} />
          </div>
          <div>
            <label>Nächste Schritte</label>
            <textarea rows={4} value={form.nextSteps} onChange={(event) => updateForm('nextSteps', event.target.value)} />
          </div>
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <Minus size={16} />
            <h4>Positionen</h4>
          </div>
          <div className="offer-line-item-stack">
            {lineItems.map((item) => (
              <div key={item.id} className="offer-line-item-card">
                <div className="grid two">
                  <div>
                    <label>Leistung</label>
                    <input
                      value={item.label}
                      onChange={(event) =>
                        setLineItems((prev) =>
                          prev.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label>Notiz</label>
                    <input
                      value={item.note}
                      onChange={(event) =>
                        setLineItems((prev) =>
                          prev.map((entry) => (entry.id === item.id ? { ...entry, note: event.target.value } : entry)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label>Menge</label>
                    <input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(event) =>
                        setLineItems((prev) =>
                          prev.map((entry) => (entry.id === item.id ? { ...entry, qty: Number(event.target.value) } : entry)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <label>Einzelpreis</label>
                    <input
                      type="number"
                      min="0"
                      value={item.unitPrice}
                      onChange={(event) =>
                        setLineItems((prev) =>
                          prev.map((entry) =>
                            entry.id === item.id ? { ...entry, unitPrice: Number(event.target.value) } : entry,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addLineItem}>
            <Plus size={14} />
            Position hinzufügen
          </button>
        </section>

        <section className="card offer-panel">
          <div className="offer-section-title">
            <Type size={16} />
            <h4>Editor</h4>
          </div>
          <div className="offer-editor-actions">
            <button type="button" className="secondary" onClick={addTextBlock}>
              <Plus size={14} />
              Textblock
            </button>
            <button type="button" className="secondary" onClick={addBadgeBlock}>
              <Plus size={14} />
              Badge
            </button>
            <button type="button" className="secondary" onClick={addImageBlock}>
              <ImagePlus size={14} />
              Bild
            </button>
          </div>
          {selectedBlock && (
            <div className="offer-selected-card">
              <div className="offer-selected-head">
                <strong>{selectedBlock.label}</strong>
                <button type="button" className="danger inline" onClick={removeSelectedBlock}>
                  Entfernen
                </button>
              </div>
              {(selectedBlock.type === 'text' || selectedBlock.type === 'badge') && (
                <>
                  <label>Titel</label>
                  <input value={selectedBlock.title || ''} onChange={(event) => updateBlock(selectedBlock.id, { title: event.target.value })} />
                </>
              )}
              {selectedBlock.type === 'text' && (
                <>
                  <label>Text</label>
                  <textarea rows={4} value={selectedBlock.body || ''} onChange={(event) => updateBlock(selectedBlock.id, { body: event.target.value })} />
                  <div className="grid three offer-color-grid">
                    <div>
                      <label>Fläche</label>
                      <input type="color" value={selectedBlock.fill || '#ffffff'} onChange={(event) => updateBlock(selectedBlock.id, { fill: event.target.value })} />
                    </div>
                    <div>
                      <label>Text</label>
                      <input type="color" value={selectedBlock.color || '#172033'} onChange={(event) => updateBlock(selectedBlock.id, { color: event.target.value })} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="offer-studio-preview-shell">
        <div className="offer-preview-toolbar">
          <div className="offer-preview-chip">{activeTemplate.label}</div>
          <div className="offer-preview-chip">{form.company || 'Ohne Firma'}</div>
          <div className="offer-preview-chip">{toCurrency(subtotal)}</div>
        </div>

        <div
          ref={previewRef}
          className="offer-proposal-page"
          style={
            {
              '--offer-accent': form.accent,
              '--offer-accent-soft': form.accentSoft,
              '--offer-surface': form.surface,
              '--offer-page-glow': form.pageGlow,
            } as CSSProperties
          }
          onPointerDown={() => setSelectedBlockId('')}
        >
          <div className="offer-page-wash" />
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={`offer-block-button ${block.id === selectedBlockId ? 'active' : ''}`}
              style={{ left: block.x, top: block.y, width: block.w, height: block.h }}
              onPointerDown={(event) => startDrag(event, block)}
              onClick={() => setSelectedBlockId(block.id)}
            >
              {renderBlock(block)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
