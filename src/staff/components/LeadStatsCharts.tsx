import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  LEAD_SOURCE_TABLE_LABELS,
  type ContactEvent,
  type EmailLead,
  type GermanWebsiteRequest,
  type LeadSourceTable,
  type ProductFinderSubmission,
  type WebsiteRequest,
} from '../lib/leads';

type StatsRange = '30d' | '90d' | 'all';

// Distinct hues, deliberately none of them red - red already means "heiß"
// everywhere else on this page, reusing it as a channel color here would
// collide with that meaning on the same screen.
const CHANNEL_COLORS: Record<LeadSourceTable, string> = {
  website_requests: '#3b82f6',
  german_website_requests: '#22c55e',
  email_leads: '#8b5cf6',
  product_finder_submissions: '#f97316',
};

const CONTACT_COLOR = '#0ea5e9';

function dayKey(value: string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(new Date(y, m - 1, d));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeStart(range: StatsRange, earliestKey: string | null, today: Date): Date {
  if (range === '30d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 29);
    return d;
  }
  if (range === '90d') {
    const d = new Date(today);
    d.setDate(d.getDate() - 89);
    return d;
  }
  if (earliestKey) {
    const [y, m, d] = earliestKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return today;
}

function buildDayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

interface LeadStatsChartsProps {
  website: WebsiteRequest[];
  german: GermanWebsiteRequest[];
  leads: EmailLead[];
  productFinder: ProductFinderSubmission[];
  contactEvents: ContactEvent[];
}

export default function LeadStatsCharts({ website, german, leads, productFinder, contactEvents }: LeadStatsChartsProps) {
  const [range, setRange] = useState<StatsRange>('30d');

  const volumeData = useMemo(() => {
    const submissions: Array<{ date: string; channel: LeadSourceTable }> = [
      ...website.map((r) => ({ date: r.submitted_at, channel: 'website_requests' as const })),
      ...german.map((r) => ({ date: r.submitted_at, channel: 'german_website_requests' as const })),
      // email_leads prefers spalte_1 over submitted_at when present - same
      // reasoning as the card date display and the list sort (see
      // sortLeadRows in leads.ts): CSV-imported rows source these from two
      // different sheet columns and they can disagree.
      ...leads.map((r) => ({ date: r.spalte_1 || r.submitted_at, channel: 'email_leads' as const })),
      ...productFinder.map((r) => ({ date: r.submitted_at, channel: 'product_finder_submissions' as const })),
    ];
    if (submissions.length === 0) return [];

    const earliestKey = submissions.map((s) => dayKey(s.date)).sort()[0];
    const today = startOfToday();
    const days = buildDayKeys(rangeStart(range, earliestKey, today), today);

    const counts = new Map<string, Record<LeadSourceTable, number>>(
      days.map((day) => [
        day,
        { website_requests: 0, german_website_requests: 0, email_leads: 0, product_finder_submissions: 0 },
      ]),
    );
    submissions.forEach(({ date, channel }) => {
      const bucket = counts.get(dayKey(date));
      if (bucket) bucket[channel] += 1;
    });

    return days.map((day) => ({ date: day, label: dayLabel(day), ...counts.get(day)! }));
  }, [website, german, leads, productFinder, range]);

  const contactData = useMemo(() => {
    if (contactEvents.length === 0) return [];

    const earliestKey = contactEvents.map((e) => dayKey(e.contacted_at)).sort()[0];
    const today = startOfToday();
    const days = buildDayKeys(rangeStart(range, earliestKey, today), today);

    const counts = new Map<string, number>(days.map((day) => [day, 0]));
    contactEvents.forEach((event) => {
      const key = dayKey(event.contacted_at);
      if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
    });

    return days.map((day) => ({ date: day, label: dayLabel(day), count: counts.get(day)! }));
  }, [contactEvents, range]);

  const hasAnyData = website.length + german.length + leads.length + productFinder.length > 0 || contactEvents.length > 0;

  if (!hasAnyData) {
    return (
      <div className="marketing-block lead-section-block">
        <h3>Statistik</h3>
        <p className="note">Noch keine Daten für die Statistik.</p>
      </div>
    );
  }

  return (
    <>
      <div className="marketing-block lead-section-block">
        <div className="lead-section-head">
          <div className="lead-section-title">
            <h3>Statistik</h3>
          </div>
          <div className="stats-range-toggle">
            <button type="button" className={range === '30d' ? 'active' : ''} onClick={() => setRange('30d')}>
              30 Tage
            </button>
            <button type="button" className={range === '90d' ? 'active' : ''} onClick={() => setRange('90d')}>
              90 Tage
            </button>
            <button type="button" className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
              Alle
            </button>
          </div>
        </div>
      </div>

      <div className="marketing-block lead-section-block">
        <h3>Eingehende Anfragen pro Kanal</h3>
        <div className="stats-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeData}>
              <defs>
                {(Object.keys(CHANNEL_COLORS) as LeadSourceTable[]).map((channel) => (
                  <linearGradient id={`stats-grad-${channel}`} key={channel} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS[channel]} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS[channel]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={24} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--text)' }}
                formatter={(value: number, name: string) => [value, LEAD_SOURCE_TABLE_LABELS[name as LeadSourceTable] || name]}
              />
              <Legend
                formatter={(value: string) => LEAD_SOURCE_TABLE_LABELS[value as LeadSourceTable] || value}
                wrapperStyle={{ fontSize: 12 }}
              />
              {(Object.keys(CHANNEL_COLORS) as LeadSourceTable[]).map((channel) => (
                <Area
                  key={channel}
                  type="monotone"
                  dataKey={channel}
                  name={channel}
                  stroke={CHANNEL_COLORS[channel]}
                  strokeWidth={2}
                  fill={`url(#stats-grad-${channel})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="marketing-block lead-section-block">
        <h3>Kontaktierte Leads</h3>
        <div className="stats-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={contactData}>
              <defs>
                <linearGradient id="stats-grad-contacts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CONTACT_COLOR} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={CONTACT_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} minTickGap={24} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--hairline)',
                  borderRadius: '10px',
                  fontSize: '12px',
                }}
                labelStyle={{ color: 'var(--text)' }}
                formatter={(value: number) => [value, 'Kontakte']}
              />
              <Area type="monotone" dataKey="count" stroke={CONTACT_COLOR} strokeWidth={2} fill="url(#stats-grad-contacts)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
