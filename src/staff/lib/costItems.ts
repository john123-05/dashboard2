import { edgeFetch } from './edge-fetch';
import { getApiErrorMessage } from './api-error';
import { supabaseBrowser } from './supabase';

export type CostCurrency = 'EUR' | 'USD';
export type CostCycle = 'monthly' | 'yearly';

export interface CostItemRow {
  id: string;
  vendor: string;
  vendor_purpose: string;
  payer: string | null;
  item_name: string;
  item_group: string | null;
  amount: number;
  currency: CostCurrency;
  cycle: CostCycle;
  next_due_date: string | null;
  note: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export type CostItemDraft = {
  vendor: string;
  vendor_purpose: string;
  payer: string | null;
  item_name: string;
  item_group: string | null;
  amount: number | string;
  currency: CostCurrency;
  cycle: CostCycle;
  next_due_date: string | null;
  note: string | null;
  sort_order?: number | string | null;
};

const COST_ITEM_COLUMNS =
  'id, vendor, vendor_purpose, payer, item_name, item_group, amount, currency, cycle, next_due_date, note, sort_order, created_at, updated_at';

function asReadableNetworkError(error: unknown, fallback: string): Error {
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return new Error(fallback);
  }
  return error instanceof Error ? error : new Error(fallback);
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getApiErrorMessage(body, fallback));
  }
  return body as T;
}

export async function fetchCostItems(): Promise<CostItemRow[]> {
  try {
    const response = await edgeFetch('/api/admin/cost-items');
    const body = await readJson<{ data?: CostItemRow[] }>(response, 'Kosten konnten nicht geladen werden');
    return body.data || [];
  } catch (error) {
    const { data, error: fallbackError } = await supabaseBrowser
      .from('cost_items')
      .select(COST_ITEM_COLUMNS)
      .order('sort_order', { ascending: true });

    if (fallbackError) {
      throw error instanceof Error ? error : new Error('Kosten konnten nicht geladen werden');
    }

    return (data as CostItemRow[] | null) || [];
  }
}

export async function createCostItem(draft: CostItemDraft): Promise<CostItemRow> {
  try {
    const response = await edgeFetch('/api/admin/cost-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const body = await readJson<{ data?: CostItemRow }>(response, 'Kostenposition konnte nicht angelegt werden');
    if (!body.data) throw new Error('Kostenposition konnte nicht angelegt werden');
    return body.data;
  } catch (error) {
    throw asReadableNetworkError(error, 'Kostenposition konnte gerade nicht gespeichert werden');
  }
}

export async function updateCostItem(id: string, draft: Partial<CostItemDraft>): Promise<CostItemRow> {
  try {
    const response = await edgeFetch('/api/admin/cost-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...draft }),
    });
    const body = await readJson<{ data?: CostItemRow }>(response, 'Kostenposition konnte nicht aktualisiert werden');
    if (!body.data) throw new Error('Kostenposition konnte nicht aktualisiert werden');
    return body.data;
  } catch (error) {
    throw asReadableNetworkError(error, 'Kostenposition konnte gerade nicht aktualisiert werden');
  }
}

export async function deleteCostItem(id: string): Promise<void> {
  try {
    const response = await edgeFetch(`/api/admin/cost-items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await readJson(response, 'Kostenposition konnte nicht gelöscht werden');
  } catch (error) {
    throw asReadableNetworkError(error, 'Kostenposition konnte gerade nicht gelöscht werden');
  }
}
