// Katalog der Pakete und Preise (docs/AUSBAU_PLAN.md, PK3). Gepflegt im Liftpictures-CRM („Pakete & Preise“),
// hier nur gelesen. Ist der Katalog leer oder nicht erreichbar, gelten die eingebauten Werte der Seiten.

import { useEffect, useState } from 'react';
import { usePark } from '../contexts/ParkContext';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';
import type { Language } from './i18n';
import type { CompareCell, CompareColumn, CompareRow } from '../components/upgrade/CompareTable';

type Texts = Record<string, string>;
export type CatalogPackage = {
  key: string;
  grp: 'plan' | 'shop' | 'speed' | 'software' | 'system' | 'addon';
  sort: number;
  highlight: boolean;
  price_cents: number | null;
  price_unit: 'month' | 'once' | 'share';
  term_months: number | null;
  free_months: number;
  setup_cents: number | null;
  texts: Record<string, { name?: string; tagline?: string; badge?: string; price_note?: string }>;
  bullets: { texts: Texts; included: boolean }[];
  meta: { share_percent?: number; year2_cents?: number; display_cents?: number };
  /** Kundenpreis oder Aktion: Preise oben sind schon angepasst, der Listenpreis steht hier. */
  deal?: {
    source: 'override' | 'promotion';
    name: string | null;
    promotion_id: string | null;
    percent: number | null;
    fixed: boolean;
    extra_free_months: number;
    valid_until: string | null;
    list_price_cents: number | null;
    list_free_months: number;
  } | null;
};
export type CatalogPromotion = {
  id: string;
  name: string;
  texts: Record<string, { title?: string; banner?: string }>;
  discount_percent: number | null;
  free_months: number;
  ends_on: string | null;
  package_keys: string[];
};
export type CatalogPoint = {
  key: string;
  grp: string;
  sort: number;
  kind: 'text' | 'setup' | 'monthly' | 'prepay' | 'share' | 'year2' | 'term' | 'free_months' | 'display_monthly';
  soon: boolean;
  texts: Texts;
};
export type CatalogCell = { package_key: string; point_key: string; included: boolean; value: Texts | null };
export type Catalog = { packages: CatalogPackage[]; points: CatalogPoint[]; cells: CatalogCell[]; promotions?: CatalogPromotion[] };

const cache = new Map<string, { at: number; promise: Promise<Catalog | null> }>();
const MAX_AGE_MS = 60_000;

async function load(parkId: string): Promise<Catalog | null> {
  try {
    const {
      data: { session },
    } = await getFunctionSession();
    if (!session?.access_token) return null;
    const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-catalog?park_id=${encodeURIComponent(parkId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const data = body?.data as Catalog | undefined;
    return data && data.packages?.length ? data : null;
  } catch {
    return null;
  }
}

/** Katalog des Parks, `null` solange er lädt oder wenn es keinen gibt (dann gelten die eingebauten Werte). */
export function useCatalog(): Catalog | null {
  const { parkId } = usePark();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!parkId) return;
    let active = true;
    const hit = cache.get(parkId);
    const entry = hit && Date.now() - hit.at < MAX_AGE_MS ? hit : { at: Date.now(), promise: load(parkId) };
    cache.set(parkId, entry);
    void entry.promise.then((value) => active && setCatalog(value));
    return () => {
      active = false;
    };
  }, [parkId]);
  return catalog;
}

export function catalogPackage(catalog: Catalog | null, key: string): CatalogPackage | undefined {
  return catalog?.packages.find((p) => p.key === key);
}

/** Aktive Pakete einer Gruppe, sortiert. */
export function catalogGroup(catalog: Catalog | null, grp: CatalogPackage['grp']): CatalogPackage[] {
  return (catalog?.packages ?? []).filter((p) => p.grp === grp).sort((a, b) => a.sort - b.sort);
}

/** Text in der Sprache des Nutzers, sonst Deutsch (Deutsch ist die Quelle). */
export function packageText(pkg: CatalogPackage | undefined, field: 'name' | 'tagline' | 'badge' | 'price_note', language: Language): string | undefined {
  return (pkg?.texts?.[language]?.[field] || pkg?.texts?.de?.[field]) || undefined;
}

export function bulletList(pkg: CatalogPackage | undefined, language: Language, included: boolean): string[] | undefined {
  if (!pkg || !pkg.bullets?.length) return undefined;
  return pkg.bullets.filter((b) => b.included === included).map((b) => b.texts?.[language] || b.texts?.de || '').filter(Boolean);
}

const eur = (cents: number, locale: string) =>
  (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Vergleichstabelle einer Gruppe aus dem Katalog. `null`, wenn der Katalog dafür nichts enthält –
 * dann zeigt die Seite ihre eingebaute Tabelle.
 */
export function catalogCompare(
  catalog: Catalog | null,
  grp: CatalogPackage['grp'],
  ctx: { language: Language; locale: string; t: (key: string, params?: Record<string, string | number>) => string },
): { columns: CompareColumn[]; rows: CompareRow[] } | null {
  const packages = catalogGroup(catalog, grp);
  const points = (catalog?.points ?? []).filter((p) => p.grp === grp).sort((a, b) => a.sort - b.sort);
  if (!catalog || packages.length === 0 || points.length === 0) return null;
  const { language, locale, t } = ctx;
  const text = (texts: Texts | null | undefined) => texts?.[language] || texts?.de || '';

  const cell = (pkg: CatalogPackage, point: CatalogPoint): CompareCell => {
    const price = pkg.price_cents;
    switch (point.kind) {
      case 'setup': return pkg.setup_cents != null ? eur(pkg.setup_cents, locale) : '—';
      case 'monthly': return price != null ? eur(price, locale) : '—';
      case 'prepay':
        return pkg.free_months > 0 && pkg.term_months && price != null ? eur((pkg.term_months - pkg.free_months) * price, locale) : '—';
      case 'share': return `${pkg.meta.share_percent ?? 0} %`;
      case 'year2': return pkg.meta.year2_cents != null ? eur(pkg.meta.year2_cents, locale) : price != null ? eur(price, locale) : '—';
      case 'term': return pkg.term_months ? t('pp.cell_months', { months: pkg.term_months }) : '—';
      case 'free_months': return String(pkg.free_months ?? 0);
      case 'display_monthly': return pkg.meta.display_cents != null ? eur(pkg.meta.display_cents, locale) : '—';
      default: {
        const found = catalog.cells.find((c) => c.package_key === pkg.key && c.point_key === point.key);
        if (!found || !found.included) return false;
        const value = text(found.value);
        return value || true;
      }
    }
  };

  return {
    columns: packages.map((pkg) => ({
      label: packageText(pkg, 'name', language) ?? pkg.key,
      sub: grp === 'plan' ? (pkg.price_cents ? `${eur(pkg.price_cents, locale)} ${t('crm_pricing.per_month')}` : t('fs.free')) : undefined,
      highlight: pkg.highlight,
    })),
    rows: points.map((point) => ({
      label: text(point.texts),
      soon: point.soon,
      cells: packages.map((pkg) => cell(pkg, point)),
    })),
  };
}

/** Platzhalter {months}, {paid} … in Texten aus dem Katalog füllen. */
export function fillText(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** Meldet, dass der Park wegen einer Aktion eine Anfrage geschickt hat (für die Zähler im CRM). */
export async function reportDealRequest(parkId: string, pkg: CatalogPackage | undefined): Promise<void> {
  const promotionId = pkg?.deal?.promotion_id;
  if (!promotionId) return;
  try {
    const {
      data: { session },
    } = await getFunctionSession();
    if (!session?.access_token) return;
    await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: EXTERNAL_SUPABASE_ANON_KEY },
      body: JSON.stringify({ park_id: parkId, promotion_id: promotionId, event: 'requested' }),
    });
  } catch {
    // Zähler ist nur eine Zugabe, die Anfrage selbst ist schon raus.
  }
}
