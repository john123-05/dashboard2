import { useI18n } from '../lib/i18n';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Gauge, Printer, Server, ShoppingBag } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import OrderStatusStepper from '../components/ui/OrderStatusStepper';
import { usePark } from '../contexts/ParkContext';
import { fetchParkEquipment, type EquipmentItem } from '../lib/equipment';

const KATEGORIE_ICON: Record<string, typeof Camera> = {
  Automat: Server,
  Kamera: Camera,
  Zubehoer: Printer,
  Verkauf: ShoppingBag,
  Software: Gauge,
  Webshop: ShoppingBag,
  Sonstiges: Gauge,
};

/** Eigene Seite fuer die Bestellverfolgung, erreichbar ueber den Button auf "Konfiguration". */
export default function ConfigurationOrders() {
  const { t } = useI18n();
  const { parkId } = usePark();
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!parkId) return;
    let active = true;
    setLoading(true);
    fetchParkEquipment(parkId)
      .then((rows) => active && setItems(rows))
      .catch((e) => active && setError(e instanceof Error ? e.message : t('survey.load_failed')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [parkId]);

  const bestellt = items.filter((i) => i.status === 'bestellt');

  return (
    <div className="space-y-6">
      <div>
        <Link to="/configuration" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-3.5 w-3.5" />
          Zurück zur Konfiguration
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{t('orders.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('orders.subtitle')}</p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <GlassCard className="p-5 sm:p-6">
        {loading ? (
          <p className="text-sm text-slate-400">{t('orders.loading')}</p>
        ) : bestellt.length === 0 ? (
          <p className="text-sm text-slate-400">{t('orders.none')}</p>
        ) : (
          <div className="space-y-5">
            {bestellt.map((item) => {
              const Icon = KATEGORIE_ICON[item.kategorie] ?? Gauge;
              return (
                <div key={item.id} className="rounded-xl bg-white/60 p-5">
                  <div className="flex items-center gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.titel} className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="rounded-lg bg-sky-50 p-2.5">
                        <Icon className="h-5 w-5 text-sky-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.titel}</p>
                      <p className="text-xs text-slate-500">{item.kategorie}</p>
                    </div>
                  </div>
                  <div className="mt-5 overflow-x-auto">
                    <OrderStatusStepper status={item.bestellstatus ?? 'bestellung_erhalten'} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
