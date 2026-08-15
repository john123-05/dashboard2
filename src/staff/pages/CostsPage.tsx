import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ChevronDown, ChevronRight, PencilLine, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { appendActivityEvent } from '../lib/activity-feed';
import {
  createCostItem,
  deleteCostItem,
  fetchCostItems,
  type CostCycle,
  type CostCurrency,
  type CostItemDraft,
  type CostItemRow,
  updateCostItem,
} from '../lib/costItems';

type PayerFilter = 'all' | 'Tom' | 'John' | 'unclear';
type CycleFilter = 'all' | CostCycle;
type CostSortKey = 'due' | 'vendor' | 'monthly' | 'yearly';

type CostDisplayEntry =
  | { kind: 'item'; item: CostItemRow }
  | { kind: 'group'; label: string; items: CostItemRow[] };

type VendorSummary = {
  vendor: string;
  displayVendor: string;
  purpose: string | null;
  items: CostItemRow[];
  monthlyEur: number;
  yearlyEur: number;
  nextDueItem: CostItemRow | null;
  payers: string[];
};

type CostFormState = {
  vendor: string;
  vendorPurpose: string;
  payer: string;
  itemName: string;
  itemGroup: string;
  amount: string;
  currency: CostCurrency;
  cycle: CostCycle;
  nextDueDate: string;
  note: string;
};

const USD_TO_EUR_RATE = 0.875;

const EMPTY_FORM: CostFormState = {
  vendor: '',
  vendorPurpose: '',
  payer: '',
  itemName: '',
  itemGroup: '',
  amount: '',
  currency: 'EUR',
  cycle: 'monthly',
  nextDueDate: '',
  note: '',
};

const SORT_LABELS: Record<CostSortKey, string> = {
  due: 'Nächste Fälligkeit',
  vendor: 'Anbieter',
  monthly: 'Monatlich teuerste',
  yearly: 'Jährlich teuerste',
};

function toEur(amount: number, currency: CostCurrency): number {
  return currency === 'USD' ? amount * USD_TO_EUR_RATE : amount;
}

function formatMoney(amount: number, currency: CostCurrency = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(amount);
}

function sumEur(items: CostItemRow[], cycle: CostCycle): number {
  return items
    .filter((item) => item.cycle === cycle)
    .reduce((sum, item) => sum + toEur(Number(item.amount), item.currency), 0);
}

function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${dateStr}T00:00:00`),
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function dueLabel(dateStr: string | null): string {
  if (!dateStr) return 'Kein Termin';
  const diff = daysUntil(dateStr);
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff < 0) return `vor ${Math.abs(diff)} Tagen`;
  return `in ${diff} Tagen`;
}

function dueTone(dateStr: string | null): 'none' | 'overdue' | 'today' | 'soon' | 'later' {
  if (!dateStr) return 'none';
  const diff = daysUntil(dateStr);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'soon';
  return 'later';
}

function payerLabel(payer: string | null): string {
  return payer ?? 'Unklar';
}

function matchesQuery(item: CostItemRow, query: string): boolean {
  if (!query) return true;
  const haystack = [item.vendor, item.vendor_purpose, item.payer, item.item_name, item.item_group, item.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function sortItems(items: CostItemRow[]): CostItemRow[] {
  return [...items].sort((a, b) => {
    const aDue = a.next_due_date ?? '9999-12-31';
    const bDue = b.next_due_date ?? '9999-12-31';
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    return a.sort_order - b.sort_order || a.item_name.localeCompare(b.item_name, 'de');
  });
}

function nextPaymentForItems(items: CostItemRow[]): CostItemRow | null {
  const todayStr = new Date().toISOString().slice(0, 10);
  return (
    sortItems(items).find((item) => item.next_due_date && item.next_due_date >= todayStr) ??
    sortItems(items).find((item) => item.next_due_date) ??
    null
  );
}

function displayVendorName(vendor: string): string {
  if (vendor === 'Domains (weitere)') return 'Weitere Domains';
  return vendor;
}

function cleanPurpose(purpose: string | null): string | null {
  if (!purpose) return null;
  const cleaned = purpose.replace(/\s*\([^)]*kundennummer[^)]*\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned === 'Zusätzlich registrierte Domains') return 'Zusätzliche Domains';
  if (cleaned === 'Domain-Registrierungen und E-Mail-Postfächer') return 'Domains & E-Mail';
  if (cleaned === 'Website-Hosting, Domain lift.pictures, E-Mail-Marketing') return 'Hosting, Domain & Marketing';
  return cleaned;
}

function cleanNote(note: string | null): string | null {
  if (!note) return null;
  const normalized = note.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (/^verlängerung:/i.test(normalized) || /^laufzeit bis/i.test(normalized)) return null;
  if (/genaues abrechnungsdatum noch nicht bekannt/i.test(normalized)) return 'Abrechnungsdatum noch offen';
  if (/kostenloser testzeitraum/i.test(normalized)) return 'Testzeitraum aktiv';
  if (/google workspace starter/i.test(normalized)) return 'Google Workspace Starter';
  const shortened = normalized
    .replace(/,?\s*Rechnung\s*#?[0-9A-Za-z-]+.*$/i, '')
    .replace(/,?\s*Zahlungsmethode.*$/i, '')
    .replace(/\s*\(Wix\.com LTD\)\s*/gi, ' ')
    .trim();
  if (!shortened || shortened.length > 72) return null;
  return shortened;
}

function payerSummary(items: CostItemRow[]): string {
  return Array.from(new Set(items.map((item) => payerLabel(item.payer)))).join(' · ');
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function groupByVendor(items: CostItemRow[]): VendorSummary[] {
  const map = new Map<string, CostItemRow[]>();
  for (const item of items) {
    if (!map.has(item.vendor)) map.set(item.vendor, []);
    map.get(item.vendor)!.push(item);
  }

  return Array.from(map.entries()).map(([vendor, vendorItems]) => ({
    vendor,
    displayVendor: displayVendorName(vendor),
    purpose: cleanPurpose(vendorItems[0]?.vendor_purpose ?? null),
    items: sortItems(vendorItems),
    monthlyEur: sumEur(vendorItems, 'monthly'),
    yearlyEur: sumEur(vendorItems, 'yearly'),
    nextDueItem: nextPaymentForItems(vendorItems),
    payers: Array.from(new Set(vendorItems.map((item) => payerLabel(item.payer)))),
  }));
}

function sortVendors(vendors: VendorSummary[], sortKey: CostSortKey): VendorSummary[] {
  const sorted = [...vendors];
  sorted.sort((a, b) => {
    if (sortKey === 'vendor') return a.displayVendor.localeCompare(b.displayVendor, 'de');
    if (sortKey === 'monthly') return b.monthlyEur - a.monthlyEur || a.displayVendor.localeCompare(b.displayVendor, 'de');
    if (sortKey === 'yearly') return b.yearlyEur - a.yearlyEur || a.displayVendor.localeCompare(b.displayVendor, 'de');
    const aDue = a.nextDueItem?.next_due_date ?? '9999-12-31';
    const bDue = b.nextDueItem?.next_due_date ?? '9999-12-31';
    return aDue.localeCompare(bDue) || a.displayVendor.localeCompare(b.displayVendor, 'de');
  });
  return sorted;
}

function groupedDisplayEntries(items: CostItemRow[]): CostDisplayEntry[] {
  const sorted = sortItems(items);
  const counts = new Map<string, number>();
  const groupedItems = new Map<string, CostItemRow[]>();

  for (const item of sorted) {
    const label = item.item_group?.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (!groupedItems.has(label)) groupedItems.set(label, []);
    groupedItems.get(label)!.push(item);
  }

  const seen = new Set<string>();
  const entries: CostDisplayEntry[] = [];

  for (const item of sorted) {
    const label = item.item_group?.trim();
    if (label && (counts.get(label) ?? 0) > 1) {
      if (seen.has(label)) continue;
      seen.add(label);
      entries.push({ kind: 'group', label, items: groupedItems.get(label) ?? [] });
      continue;
    }
    entries.push({ kind: 'item', item });
  }

  return entries;
}

function formToDraft(form: CostFormState): CostItemDraft {
  return {
    vendor: form.vendor.trim(),
    vendor_purpose: form.vendorPurpose.trim(),
    payer: form.payer.trim() || null,
    item_name: form.itemName.trim(),
    item_group: form.itemGroup.trim() || null,
    amount: form.amount.trim(),
    currency: form.currency,
    cycle: form.cycle,
    next_due_date: form.nextDueDate.trim() || null,
    note: form.note.trim() || null,
  };
}

function itemToFormState(item: CostItemRow): CostFormState {
  return {
    vendor: item.vendor,
    vendorPurpose: item.vendor_purpose,
    payer: item.payer ?? '',
    itemName: item.item_name,
    itemGroup: item.item_group ?? '',
    amount: Number(item.amount).toFixed(2).replace('.', ','),
    currency: item.currency,
    cycle: item.cycle,
    nextDueDate: item.next_due_date ?? '',
    note: item.note ?? '',
  };
}

export default function CostsPage() {
  const [items, setItems] = useState<CostItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payerFilter, setPayerFilter] = useState<PayerFilter>('all');
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>('all');
  const [sortKey, setSortKey] = useState<CostSortKey>('due');
  const [query, setQuery] = useState('');

  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(new Set());
  const [editingVendor, setEditingVendor] = useState<string | null>(null);
  const [editForms, setEditForms] = useState<Record<string, CostFormState>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<CostFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchCostItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kosten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const payerMatches =
        payerFilter === 'all'
          ? true
          : payerFilter === 'unclear'
            ? !item.payer
            : item.payer === payerFilter;
      const cycleMatches = cycleFilter === 'all' ? true : item.cycle === cycleFilter;
      return payerMatches && cycleMatches && matchesQuery(item, normalizedQuery);
    });
  }, [items, payerFilter, cycleFilter, normalizedQuery]);

  const vendorSummaries = useMemo(() => sortVendors(groupByVendor(filteredItems), sortKey), [filteredItems, sortKey]);
  const nextPayment = useMemo(() => nextPaymentForItems(filteredItems), [filteredItems]);
  const visibleMonthlyEur = useMemo(() => sumEur(filteredItems, 'monthly'), [filteredItems]);
  const visibleYearlyEur = useMemo(() => sumEur(filteredItems, 'yearly'), [filteredItems]);
  const allPayerTotals = useMemo(
    () =>
      (['Tom', 'John'] as const).map((payer) => {
        const payerItems = items.filter((item) => item.payer === payer);
        return {
          payer,
          monthlyEur: sumEur(payerItems, 'monthly'),
          yearlyEur: sumEur(payerItems, 'yearly'),
          vendorCount: new Set(payerItems.map((item) => item.vendor)).size,
        };
      }),
    [items],
  );

  useEffect(() => {
    const visibleVendors = new Set(vendorSummaries.map((vendor) => vendor.vendor));
    setExpandedVendors((prev) => {
      const next = new Set(Array.from(prev).filter((vendor) => visibleVendors.has(vendor)));
      if (vendorSummaries.length > 0 && next.size === 0) next.add(vendorSummaries[0].vendor);
      return sameStringSet(prev, next) ? prev : next;
    });
  }, [vendorSummaries]);

  function toggleVendor(vendor: string) {
    setExpandedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(vendor)) next.delete(vendor);
      else next.add(vendor);
      return next;
    });
  }

  function togglePanel(key: string) {
    setExpandedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startVendorEdit(vendor: VendorSummary) {
    setExpandedVendors((prev) => new Set(prev).add(vendor.vendor));
    setEditingVendor((prev) => (prev === vendor.vendor ? null : vendor.vendor));
    setEditForms((prev) => {
      const next = { ...prev };
      for (const item of vendor.items) {
        next[item.id] = itemToFormState(item);
      }
      return next;
    });
  }

  function updateEditForm(itemId: string, patch: Partial<CostFormState>) {
    setEditForms((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] ?? EMPTY_FORM),
        ...patch,
      },
    }));
  }

  function startCreate(prefill?: { vendor?: string; vendorPurpose?: string }) {
    setForm({
      ...EMPTY_FORM,
      vendor: prefill?.vendor ?? '',
      vendorPurpose: prefill?.vendorPurpose ?? '',
    });
    setFormError(null);
    setStatusMessage(null);
    setShowCreateForm(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreateForm(false);
  }

  async function onCreateItem() {
    setSaving(true);
    setFormError(null);
    setStatusMessage(null);
    try {
      const created = await createCostItem(formToDraft(form));
      setItems((prev) => [...prev, created]);
      setShowCreateForm(false);
      setForm(EMPTY_FORM);
      setStatusMessage('Kostenposition angelegt');
      appendActivityEvent({ title: 'Kostenposition angelegt', details: created.item_name, level: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Kostenposition konnte nicht angelegt werden');
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteItem(item: CostItemRow) {
    const confirmed = window.confirm(`"${item.item_name}" wirklich löschen?`);
    if (!confirmed) return;

    setDeletingId(item.id);
    setStatusMessage(null);
    try {
      await deleteCostItem(item.id);
      setItems((prev) => prev.filter((entry) => entry.id !== item.id));
      setStatusMessage('Kostenposition gelöscht');
      appendActivityEvent({ title: 'Kostenposition gelöscht', details: item.item_name, level: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kostenposition konnte nicht gelöscht werden');
    } finally {
      setDeletingId(null);
    }
  }

  async function onSaveItem(item: CostItemRow) {
    const form = editForms[item.id];
    if (!form) return;

    setSavingItemId(item.id);
    setError(null);
    setStatusMessage(null);
    try {
      const updated = await updateCostItem(item.id, formToDraft(form));
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
      setStatusMessage('Kostenposition aktualisiert');
      appendActivityEvent({ title: 'Kostenposition aktualisiert', details: updated.item_name, level: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kostenposition konnte nicht aktualisiert werden');
    } finally {
      setSavingItemId(null);
    }
  }

  function renderItemRow(item: CostItemRow, nested = false) {
    const note = cleanNote(item.note);

    return (
      <div key={item.id} className={`customer-simple-list-row cost-entry-row ${nested ? 'cost-entry-row-sub' : ''}`}>
        <div className="cost-entry-main">
          <strong>{item.item_name}</strong>
          <small>
            {payerLabel(item.payer)} · {item.cycle === 'monthly' ? 'Monatlich' : 'Jährlich'}
            {item.next_due_date ? ` · ${dueLabel(item.next_due_date)} · ${formatDateShort(item.next_due_date)}` : ''}
          </small>
          {note && <p className="note">{note}</p>}
        </div>
        <div className="cost-entry-side">
          <div className="cost-entry-price">
            <strong>{formatMoney(toEur(Number(item.amount), item.currency))}</strong>
            {item.currency === 'USD' && <small>≈ {formatMoney(Number(item.amount), 'USD')}</small>}
          </div>
          <button
            type="button"
            className="customer-icon-btn"
            onClick={() => void onDeleteItem(item)}
            disabled={deletingId === item.id}
            aria-label={`${item.item_name} löschen`}
            title="Löschen"
          >
            {deletingId === item.id ? '…' : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    );
  }

  function renderGroupAccordion(vendor: VendorSummary, label: string, groupItems: CostItemRow[], prefix: string, extraClass = '') {
    const key = `${prefix}:${vendor.vendor}:${label}`;
    const isOpen = expandedPanels.has(key);
    const nextDue = nextPaymentForItems(groupItems);
    const monthly = sumEur(groupItems, 'monthly');
    const yearly = sumEur(groupItems, 'yearly');

    return (
      <div key={key} className={`customer-accordion ${extraClass} ${isOpen ? 'open' : ''}`.trim()}>
        <button type="button" className="customer-accordion-trigger" onClick={() => togglePanel(key)}>
          <span className="customer-accordion-label">
            <span className="customer-accordion-icon">
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span className="customer-accordion-copy">
              <strong>{label}</strong>
              <small>
                {groupItems.length} Positionen · {payerSummary(groupItems)}
                {nextDue?.next_due_date ? ` · ${dueLabel(nextDue.next_due_date)}` : ''}
              </small>
            </span>
          </span>
          <span className="cost-accordion-total">
            {monthly > 0 && <small>{formatMoney(monthly)}/Monat</small>}
            {yearly > 0 && <small>{formatMoney(yearly)}/Jahr</small>}
          </span>
        </button>
        {isOpen && <div className="customer-accordion-body cost-entry-stack">{groupItems.map((item) => renderItemRow(item, true))}</div>}
      </div>
    );
  }

  function renderEditItemCard(item: CostItemRow) {
    const form = editForms[item.id] ?? itemToFormState(item);

    return (
      <div key={`edit:${item.id}`} className="customer-simple-card cost-edit-card">
        <div className="customer-inline-head">
          <div>
            <strong>{item.item_name}</strong>
            <small>{displayVendorName(item.vendor)}</small>
          </div>
        </div>

        <div className="grid two cost-form-grid cost-edit-grid">
          <div>
            <label>Name</label>
            <input value={form.itemName} onChange={(event) => updateEditForm(item.id, { itemName: event.target.value })} />
          </div>
          <div>
            <label>Wofür?</label>
            <input value={form.vendorPurpose} onChange={(event) => updateEditForm(item.id, { vendorPurpose: event.target.value })} />
          </div>
          <div>
            <label>Gruppe</label>
            <input value={form.itemGroup} onChange={(event) => updateEditForm(item.id, { itemGroup: event.target.value })} />
          </div>
          <div>
            <label>Zahler</label>
            <select value={form.payer} onChange={(event) => updateEditForm(item.id, { payer: event.target.value })}>
              <option value="">Unklar</option>
              <option value="Tom">Tom</option>
              <option value="John">John</option>
            </select>
          </div>
          <div className="row">
            <div>
              <label>Betrag</label>
              <input value={form.amount} onChange={(event) => updateEditForm(item.id, { amount: event.target.value })} />
            </div>
            <div>
              <label>Währung</label>
              <select value={form.currency} onChange={(event) => updateEditForm(item.id, { currency: event.target.value as CostCurrency })}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>
          <div>
            <label>Zyklus</label>
            <select value={form.cycle} onChange={(event) => updateEditForm(item.id, { cycle: event.target.value as CostCycle })}>
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          </div>
          <div>
            <label>Nächste Fälligkeit</label>
            <input type="date" value={form.nextDueDate} onChange={(event) => updateEditForm(item.id, { nextDueDate: event.target.value })} />
          </div>
          <div className="cost-form-note">
            <label>Notiz</label>
            <input value={form.note} onChange={(event) => updateEditForm(item.id, { note: event.target.value })} placeholder="Optional" />
          </div>
        </div>

        <div className="customer-row-actions cost-edit-actions">
          <button type="button" className="customer-quiet-btn" onClick={() => void onDeleteItem(item)} disabled={deletingId === item.id}>
            <Trash2 size={14} />
            {deletingId === item.id ? 'Löscht...' : 'Löschen'}
          </button>
          <button type="button" className="customer-open-btn" onClick={() => void onSaveItem(item)} disabled={savingItemId === item.id}>
            <PencilLine size={14} />
            {savingItemId === item.id ? 'Speichert...' : 'Speichern'}
          </button>
        </div>
      </div>
    );
  }

  function renderVendorRow(vendor: VendorSummary) {
    const entries = groupedDisplayEntries(vendor.items);
    const isOpen = expandedVendors.has(vendor.vendor);
    const isEditing = editingVendor === vendor.vendor;

    return (
      <article key={vendor.vendor} className={`customer-row-card ${isOpen ? 'open' : ''}`}>
        <div className="cost-vendor-row-main">
          <div className="customer-row-content">
            <div className="customer-row-head">
              <div>
                <h3>{vendor.displayVendor}</h3>
                {vendor.purpose && <p className="customer-row-slug">{vendor.purpose}</p>}
              </div>
            </div>

            <div className="customer-row-meta">
              <span>{vendor.items.length} Positionen</span>
              <span>{formatMoney(vendor.monthlyEur)}/Monat</span>
              <span>{formatMoney(vendor.yearlyEur)}/Jahr</span>
              <span>{vendor.payers.join(' · ')}</span>
              {vendor.nextDueItem?.next_due_date && <span>{dueLabel(vendor.nextDueItem.next_due_date)}</span>}
            </div>

            <div className="customer-row-actions">
              <button type="button" className="customer-open-btn" onClick={() => toggleVendor(vendor.vendor)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Details
              </button>
              <button
                type="button"
                className="customer-icon-btn"
                onClick={() => startVendorEdit(vendor)}
                aria-label={`${vendor.displayVendor} bearbeiten`}
                title="Bearbeiten"
              >
                <PencilLine size={14} />
              </button>
            </div>
          </div>

          <aside className="customer-row-side cost-vendor-row-side">
            <span className={`badge ${vendor.nextDueItem?.next_due_date ? dueTone(vendor.nextDueItem.next_due_date) : ''}`}>
              {vendor.nextDueItem?.next_due_date ? dueLabel(vendor.nextDueItem.next_due_date) : 'Ohne Termin'}
            </span>
          </aside>
        </div>

        {isOpen && (
          <div className="customer-expand-wrap">
            {isEditing ? (
              <div className="customer-section-stack">
                <div className="customer-inline-head">
                  <div>
                    <strong>Positionen bearbeiten</strong>
                    <small>{vendor.items.length} Einträge für {vendor.displayVendor}</small>
                  </div>
                </div>
                <div className="cost-edit-stack">{vendor.items.map((item) => renderEditItemCard(item))}</div>
              </div>
            ) : (
              <>
                <div className="customer-inline-head">
                  <div>
                    <strong>Positionen</strong>
                    <small>{vendor.items.length} Einträge für {vendor.displayVendor}</small>
                  </div>
                </div>
                <div className="customer-section-stack">
                  {entries.map((entry) =>
                    entry.kind === 'group'
                      ? renderGroupAccordion(vendor, entry.label, entry.items, 'vendor-group')
                      : renderItemRow(entry.item),
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </article>
    );
  }

  if (loading) {
    return (
      <div className="customer-management-page">
        <div className="card customer-directory-shell costs-shell">
          <div className="customer-directory-head">
            <div>
              <h2>Kosten</h2>
            </div>
          </div>
          <p className="note">Lädt...</p>
        </div>
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="customer-management-page">
        <div className="card customer-directory-shell costs-shell">
          <div className="customer-directory-head">
            <div>
              <h2>Kosten</h2>
            </div>
          </div>
          <p className="support-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-management-page">
      <div className="card customer-directory-shell costs-shell">
        <div className="customer-directory-head">
          <div>
            <h2>Kosten</h2>
          </div>
          <div className="customer-directory-view-switch" role="tablist" aria-label="Zahler">
            <button type="button" className={`customer-directory-view-btn ${payerFilter === 'all' ? 'active' : ''}`} onClick={() => setPayerFilter('all')}>
              Alle
            </button>
            <button type="button" className={`customer-directory-view-btn ${payerFilter === 'Tom' ? 'active' : ''}`} onClick={() => setPayerFilter('Tom')}>
              Tom zahlt
            </button>
            <button type="button" className={`customer-directory-view-btn ${payerFilter === 'John' ? 'active' : ''}`} onClick={() => setPayerFilter('John')}>
              John zahlt
            </button>
            <button
              type="button"
              className={`customer-directory-view-btn ${payerFilter === 'unclear' ? 'active' : ''}`}
              onClick={() => setPayerFilter('unclear')}
            >
              Unklar
            </button>
          </div>
        </div>

        <div className="costs-overview-panel">
          <div className="costs-overview-strip">
            <div className="costs-overview-metric">
              <span>Monatlich</span>
              <strong>{formatMoney(visibleMonthlyEur)}</strong>
            </div>
            <div className="costs-overview-metric">
              <span>Jährlich</span>
              <strong>{formatMoney(visibleYearlyEur)}</strong>
            </div>
            <div className="costs-overview-metric costs-overview-metric-due">
              <span>Als Nächstes fällig</span>
              <strong className="costs-overview-due-title">{nextPayment?.item_name ?? 'Keine offene Fälligkeit'}</strong>
              <p className="note costs-overview-due-note">
                {nextPayment?.next_due_date ? `${dueLabel(nextPayment.next_due_date)} · ${formatDateShort(nextPayment.next_due_date)}` : 'Kein Termin hinterlegt'}
              </p>
            </div>
          </div>

          <div className="costs-payer-strip">
            <div className="costs-payer-cell costs-payer-cell-tom">
              <span>Tom zahlt</span>
              <strong>{formatMoney(allPayerTotals[0].monthlyEur)}</strong>
              <p className="note">
                {formatMoney(allPayerTotals[0].yearlyEur)} jährlich · {allPayerTotals[0].vendorCount} Anbieter
              </p>
            </div>
            <div className="costs-payer-cell costs-payer-cell-john">
              <span>John zahlt</span>
              <strong>{formatMoney(allPayerTotals[1].monthlyEur)}</strong>
              <p className="note">
                {formatMoney(allPayerTotals[1].yearlyEur)} jährlich · {allPayerTotals[1].vendorCount} Anbieter
              </p>
            </div>
            <div className="costs-payer-cell">
              <span>Gesamt</span>
              <strong>{formatMoney(sumEur(items, 'monthly'))}</strong>
              <p className="note">{formatMoney(sumEur(items, 'yearly'))} jährlich</p>
            </div>
          </div>
        </div>

        <div className="customer-directory-toolbar costs-toolbar">
          <label className="customer-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suche nach Anbieter, Domain, Abo oder Notiz..."
            />
          </label>

          <div className="costs-toolbar-actions">
            <div className="costs-toolbar-compact">
              <div className="costs-cycle-switch" role="tablist" aria-label="Zyklus">
                <button type="button" className={`customer-quiet-btn costs-cycle-btn ${cycleFilter === 'all' ? 'active' : ''}`} onClick={() => setCycleFilter('all')}>
                  Alle Zyklen
                </button>
                <button
                  type="button"
                  className={`customer-quiet-btn costs-cycle-btn ${cycleFilter === 'monthly' ? 'active' : ''}`}
                  onClick={() => setCycleFilter('monthly')}
                >
                  Monatlich
                </button>
                <button
                  type="button"
                  className={`customer-quiet-btn costs-cycle-btn ${cycleFilter === 'yearly' ? 'active' : ''}`}
                  onClick={() => setCycleFilter('yearly')}
                >
                  Jährlich
                </button>
              </div>

              <label className="costs-sort-control" aria-label="Sortieren nach">
                <span className="costs-sort-icon">
                  <ArrowUpDown size={14} />
                </span>
                <select className="costs-sort-select" value={sortKey} onChange={(event) => setSortKey(event.target.value as CostSortKey)}>
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="button" className="customer-open-btn" onClick={() => startCreate()}>
              <Plus size={14} />
              Neues Abo
            </button>
          </div>
        </div>

        {(statusMessage || (error && items.length > 0)) && (
          <div className="customer-inline-status" aria-live="polite">
            {statusMessage && <p className="success">{statusMessage}</p>}
            {error && items.length > 0 && <p className="error">{error}</p>}
          </div>
        )}

        {showCreateForm && (
          <div className="customer-simple-card customer-form-card cost-create-card">
          <div className="customer-inline-head">
            <div>
              <strong>Neues Abo / neue Position</strong>
              <small>Eintrag anlegen und direkt in die Kostenliste übernehmen.</small>
            </div>
            <button type="button" className="customer-icon-btn" onClick={resetForm} aria-label="Formular schließen" title="Schließen">
              <X size={14} />
            </button>
          </div>

          <div className="grid two cost-form-grid">
            <div>
              <label>Anbieter</label>
              <input value={form.vendor} onChange={(event) => setForm((prev) => ({ ...prev, vendor: event.target.value }))} placeholder="z. B. Domain Factory" />
            </div>
            <div>
              <label>Wofür?</label>
              <input
                value={form.vendorPurpose}
                onChange={(event) => setForm((prev) => ({ ...prev, vendorPurpose: event.target.value }))}
                placeholder="z. B. Domains und Mail"
              />
            </div>
            <div>
              <label>Name</label>
              <input
                value={form.itemName}
                onChange={(event) => setForm((prev) => ({ ...prev, itemName: event.target.value }))}
                placeholder="z. B. liftpictures.com oder Pro-Plan"
              />
            </div>
            <div>
              <label>Gruppe</label>
              <input
                value={form.itemGroup}
                onChange={(event) => setForm((prev) => ({ ...prev, itemGroup: event.target.value }))}
                placeholder="z. B. Domains"
              />
            </div>
            <div>
              <label>Zahler</label>
              <select value={form.payer} onChange={(event) => setForm((prev) => ({ ...prev, payer: event.target.value }))}>
                <option value="">Unklar</option>
                <option value="Tom">Tom</option>
                <option value="John">John</option>
              </select>
            </div>
            <div className="row">
              <div>
                <label>Betrag</label>
                <input
                  value={form.amount}
                  onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                  placeholder="z. B. 23,88"
                />
              </div>
              <div>
                <label>Währung</label>
                <select value={form.currency} onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value as CostCurrency }))}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div>
              <label>Zyklus</label>
              <select value={form.cycle} onChange={(event) => setForm((prev) => ({ ...prev, cycle: event.target.value as CostCycle }))}>
                <option value="monthly">Monatlich</option>
                <option value="yearly">Jährlich</option>
              </select>
            </div>
            <div>
              <label>Nächste Fälligkeit</label>
              <input
                type="date"
                value={form.nextDueDate}
                onChange={(event) => setForm((prev) => ({ ...prev, nextDueDate: event.target.value }))}
              />
            </div>
            <div className="cost-form-note">
              <label>Notiz</label>
              <input
                value={form.note}
                onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          {formError && <p className="error">{formError}</p>}

          <div className="customer-row-actions">
            <button type="button" className="customer-quiet-btn" onClick={resetForm}>
              Abbrechen
            </button>
            <button type="button" className="customer-open-btn" onClick={() => void onCreateItem()} disabled={saving}>
              <Plus size={14} />
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
          </div>
        )}

        <div className="customer-inline-head cost-section-head">
          <div className="cost-inline-head-copy">
            <span className="cost-inline-head-icon">
              <Receipt size={15} />
            </span>
            <div>
              <strong>Anbieter & Abos</strong>
            </div>
          </div>
          <span className="cost-section-head-total">
            {vendorSummaries.length} Anbieter · {filteredItems.length} Positionen
          </span>
        </div>

        {vendorSummaries.length > 0 ? (
          <div className="customer-directory-list cost-vendor-list">{vendorSummaries.map((vendor) => renderVendorRow(vendor))}</div>
        ) : (
          <div className="cost-empty-card">
            <h3>Keine Treffer</h3>
            <p className="note">Mit den aktuellen Filtern oder der Suche wurde keine Kostenposition gefunden.</p>
          </div>
        )}
      </div>
    </div>
  );
}
