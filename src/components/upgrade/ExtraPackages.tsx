import { useState } from 'react';
import { usePark } from '../../contexts/ParkContext';
import { meldeAusstattungsInteresse } from '../../lib/equipment';
import { useI18n, useLocaleTag } from '../../lib/i18n';
import { bulletList, catalogGroup, fillText, packageText, reportDealRequest, useCatalog, type CatalogPackage } from '../../lib/catalog';
import PlanCard, { PlanAction, PriceFigure } from './PlanCard';
import DealNote from './DealNote';

// Preiskarten, die im CRM zusätzlich angelegt wurden (docs/AUSBAU_PLAN.md, PK9). Die eingebauten Karten (Pläne,
// Shop-Wege, Speedmessung, Software, Zusatzleistungen) haben eigene Bausteine; alles andere aus dem Katalog
// erscheint hier als normale Karte mit „Anfragen“.
const BUILT_IN = new Set([
  'basis', 'marketing_starter', 'marketing_pro',
  'shop_monthly', 'shop_year', 'shop_full',
  'speed_basis', 'speed_display', 'speed_long',
  'software_monthly', 'software_year', 'software_two_years',
  'addon_shop', 'addon_speed', 'addon_mail', 'addon_hardware',
]);

export default function ExtraPackages({ grp }: { grp: string }) {
  const { t, language } = useI18n();
  const locale = useLocaleTag();
  const { parkId } = usePark();
  const catalog = useCatalog();
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const extras = catalogGroup(catalog, grp).filter((pkg) => !BUILT_IN.has(pkg.key));
  if (extras.length === 0) return null;

  const money = (cents: number) => (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });

  async function request(pkg: CatalogPackage) {
    if (!parkId) return;
    setBusy(pkg.key);
    setError(null);
    try {
      const name = packageText(pkg, 'name', 'de') ?? pkg.key;
      const price = pkg.price_unit === 'share' ? `${pkg.meta.share_percent ?? 0} % Umsatzanteil` : pkg.price_cents != null ? `${pkg.price_cents / 100} €${pkg.price_unit === 'month' ? '/Monat' : ' einmalig'}` : 'Preis auf Anfrage';
      await meldeAusstattungsInteresse(parkId, { label: `Paket anfragen: ${name} (${price}${pkg.deal ? ', Aktion/Kundenpreis' : ''})` });
      void reportDealRequest(parkId, pkg);
      setRequested((prev) => [...prev, pkg.key]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crm_pricing.request_failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <div className="grid items-stretch gap-5 pt-3 md:grid-cols-2 lg:grid-cols-3">
        {extras.map((pkg) => {
          const badge = packageText(pkg, 'badge', language);
          const notes = [
            packageText(pkg, 'tagline', language),
            pkg.setup_cents ? t('pp.extra_setup', { amount: money(pkg.setup_cents) }) : null,
            pkg.term_months ? t('pp.extra_term', { months: pkg.term_months }) : null,
            pkg.free_months > 0 ? t('pp.extra_free', { months: pkg.free_months }) : null,
          ].filter(Boolean);
          return (
            <PlanCard
              key={pkg.key}
              highlight={pkg.highlight}
              badge={badge ? fillText(badge, { months: pkg.free_months }) : undefined}
              badgeTone={pkg.highlight ? 'brand' : 'positive'}
              name={packageText(pkg, 'name', language) ?? pkg.key}
              price={
                <>
                  <DealNote pkg={pkg} />
                  {pkg.price_unit === 'share' ? (
                    <PriceFigure value={`${pkg.meta.share_percent ?? 0} %`} suffix={t('shop_pricing.share_label')} />
                  ) : pkg.price_cents != null ? (
                    <PriceFigure value={money(pkg.price_cents)} suffix={pkg.price_unit === 'month' ? t('crm_pricing.per_month') : t('pp.extra_once')} />
                  ) : (
                    <PriceFigure value={packageText(pkg, 'price_note', language) ?? t('pp.addon_mail_price')} />
                  )}
                </>
              }
              priceNote={notes.join(' · ') || undefined}
              includedLabel={t('crm_pricing.included')}
              points={bulletList(pkg, language, true) ?? []}
              excluded={bulletList(pkg, language, false)}
              action={
                <PlanAction
                  highlight={pkg.highlight}
                  done={requested.includes(pkg.key)}
                  doneLabel={t('crm_pricing.requested')}
                  busy={busy === pkg.key}
                  disabled={busy !== null}
                  label={t('pp.extra_request')}
                  busyLabel={t('crm_pricing.sending')}
                  onClick={() => void request(pkg)}
                />
              }
            />
          );
        })}
      </div>
    </>
  );
}
