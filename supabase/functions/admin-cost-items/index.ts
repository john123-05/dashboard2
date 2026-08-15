import {
  handleOptions,
  json,
  requireAdminFromRequest,
  supabaseService,
} from "../_shared/sameProjectAdminAuth.ts";

type IncomingCostItem = {
  vendor?: unknown;
  vendor_purpose?: unknown;
  payer?: unknown;
  item_name?: unknown;
  item_group?: unknown;
  amount?: unknown;
  currency?: unknown;
  cycle?: unknown;
  next_due_date?: unknown;
  note?: unknown;
  sort_order?: unknown;
};

const CURRENCIES = new Set(["EUR", "USD"]);
const CYCLES = new Set(["monthly", "yearly"]);
const columns =
  "id, vendor, vendor_purpose, payer, item_name, item_group, amount, currency, cycle, next_due_date, note, sort_order, created_at, updated_at";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const text = asText(value);
  return text || null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseSortOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

async function nextSortOrder(): Promise<number> {
  const { data, error } = await supabaseService
    .from("cost_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return ((data?.sort_order as number | null) ?? 0) + 10;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  if (req.method === "GET") {
    const { data, error } = await supabaseService.from("cost_items").select(
      columns,
    ).order("sort_order", { ascending: true });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data: data || [] });
  }

  if (req.method === "POST") {
    const payload = (await req.json().catch(() => null)) as
      | IncomingCostItem
      | null;
    if (!payload) return json({ error: "Ungültige Eingabe" }, 400);

    const vendor = asText(payload.vendor);
    const vendorPurpose = asText(payload.vendor_purpose);
    const itemName = asText(payload.item_name);
    const amount = parseAmount(payload.amount);
    const currency = asText(payload.currency).toUpperCase();
    const cycle = asText(payload.cycle).toLowerCase();

    if (!vendor || !vendorPurpose || !itemName || amount === null) {
      return json({
        error: "Anbieter, Beschreibung, Name und Betrag sind erforderlich",
      }, 400);
    }
    if (!CURRENCIES.has(currency)) {
      return json({ error: "Ungültige Währung" }, 400);
    }
    if (!CYCLES.has(cycle)) return json({ error: "Ungültiger Zyklus" }, 400);

    const sortOrder = parseSortOrder(payload.sort_order) ??
      (await nextSortOrder());

    const insertRow = {
      vendor,
      vendor_purpose: vendorPurpose,
      payer: optionalText(payload.payer),
      item_name: itemName,
      item_group: optionalText(payload.item_group),
      amount,
      currency,
      cycle,
      next_due_date: parseDate(payload.next_due_date),
      note: optionalText(payload.note),
      sort_order: sortOrder,
    };

    const { data, error } = await supabaseService.from("cost_items").insert(
      insertRow,
    ).select(columns).maybeSingle();
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, data });
  }

  if (req.method === "PATCH") {
    const payload = (await req.json().catch(() => null)) as
      | (IncomingCostItem & { id?: unknown })
      | null;
    const id = typeof payload?.id === "string" ? payload.id : null;
    if (!id) return json({ error: "Missing id" }, 400);

    const update: Record<string, unknown> = {};

    if ("vendor" in (payload || {})) {
      const value = asText(payload?.vendor);
      if (!value) return json({ error: "Anbieter darf nicht leer sein" }, 400);
      update.vendor = value;
    }
    if ("vendor_purpose" in (payload || {})) {
      const value = asText(payload?.vendor_purpose);
      if (!value) {
        return json({ error: "Beschreibung darf nicht leer sein" }, 400);
      }
      update.vendor_purpose = value;
    }
    if ("payer" in (payload || {})) update.payer = optionalText(payload?.payer);
    if ("item_name" in (payload || {})) {
      const value = asText(payload?.item_name);
      if (!value) return json({ error: "Name darf nicht leer sein" }, 400);
      update.item_name = value;
    }
    if ("item_group" in (payload || {})) {
      update.item_group = optionalText(payload?.item_group);
    }
    if ("amount" in (payload || {})) {
      const amount = parseAmount(payload?.amount);
      if (amount === null) return json({ error: "Ungültiger Betrag" }, 400);
      update.amount = amount;
    }
    if ("currency" in (payload || {})) {
      const value = asText(payload?.currency).toUpperCase();
      if (!CURRENCIES.has(value)) {
        return json({ error: "Ungültige Währung" }, 400);
      }
      update.currency = value;
    }
    if ("cycle" in (payload || {})) {
      const value = asText(payload?.cycle).toLowerCase();
      if (!CYCLES.has(value)) return json({ error: "Ungültiger Zyklus" }, 400);
      update.cycle = value;
    }
    if ("next_due_date" in (payload || {})) {
      const parsed = parseDate(payload?.next_due_date);
      if (payload?.next_due_date && !parsed) {
        return json({ error: "Ungültiges Datum" }, 400);
      }
      update.next_due_date = parsed;
    }
    if ("note" in (payload || {})) update.note = optionalText(payload?.note);
    if ("sort_order" in (payload || {})) {
      const value = parseSortOrder(payload?.sort_order);
      if (value === null) return json({ error: "Ungültige Sortierung" }, 400);
      update.sort_order = value;
    }

    if (Object.keys(update).length === 0) {
      return json({ error: "Nothing to update" }, 400);
    }

    const { data, error } = await supabaseService
      .from("cost_items")
      .update(update)
      .eq("id", id)
      .select(columns)
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: "Not found" }, 404);
    return json({ ok: true, data });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return json({ error: "Missing id" }, 400);

    const { error } = await supabaseService.from("cost_items").delete().eq(
      "id",
      id,
    );
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
});
