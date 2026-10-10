import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';

// E-Mail-Marketing der Parks (docs/PRODUKT_PLAN.md, F1/F2): Function `operator-email-campaigns`.

export type EmailBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' };

export type EmailStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface EmailCampaignSummary {
  id: string;
  name: string;
  subject: string;
  status: EmailStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipients: number;
  opened: number;
  language: string | null;
  updated_at: string;
}

export interface EmailSettings {
  sender_name: string;
  reply_to: string;
  footer_address: string;
}

export type AutomationType = 'welcome' | 'season_start';
export interface EmailAutomation {
  type: AutomationType;
  enabled: boolean;
  campaign_id: string | null;
  delay_hours: number;
}

export interface EmailOverview {
  campaigns: EmailCampaignSummary[];
  settings: EmailSettings | null;
  usage: { sent: number; quota: number; plan: string };
  automations?: EmailAutomation[];
  automations_allowed?: boolean;
  migration_pending?: boolean;
}

export interface EmailSegment {
  countries?: string[];
  since?: string;
}

export interface EmailCampaignFull extends EmailCampaignSummary {
  preheader: string;
  body_json: EmailBlock[];
  html: string;
  segment: EmailSegment;
}

export type EmailDraft = {
  id?: string;
  /** Neue Vorlage einer Automation (nur beim ersten Speichern). */
  template_for?: AutomationType;
  name: string;
  subject: string;
  preheader: string;
  language: string | null;
  body_json: EmailBlock[];
  html: string;
  segment: EmailSegment;
};

async function call<T>(init: RequestInit, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-email-campaigns?${new URLSearchParams(query).toString()}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: EXTERNAL_SUPABASE_ANON_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
  return body?.data as T;
}

const post = <T,>(parkId: string, payload: Record<string, unknown>) =>
  call<T>({ method: 'POST', body: JSON.stringify({ park_id: parkId, ...payload }) }, { park_id: parkId });

export const fetchEmailOverview = (parkId: string) => call<EmailOverview>({ method: 'GET' }, { park_id: parkId });
export const fetchEmailCampaign = (parkId: string, id: string) =>
  call<{ campaign: EmailCampaignFull }>({ method: 'GET' }, { park_id: parkId, id });
export const saveEmailCampaign = (parkId: string, campaign: EmailDraft) =>
  post<{ id: string }>(parkId, { action: 'save', campaign });
export const deleteEmailCampaign = (parkId: string, id: string) => post<unknown>(parkId, { action: 'delete', id });
export const saveEmailSettings = (parkId: string, settings: EmailSettings) =>
  post<{ settings: EmailSettings }>(parkId, { action: 'save_settings', settings });
export const previewAudience = (parkId: string, language: string | null, segment: EmailSegment) =>
  post<{ count: number }>(parkId, { action: 'preview_audience', language, segment });
export const sendTestEmail = (parkId: string, id: string) => post<{ to: string }>(parkId, { action: 'test', id });
export const sendEmailCampaign = (parkId: string, id: string, scheduledAt?: string) =>
  post<{ recipients: number }>(parkId, { action: 'send', id, scheduled_at: scheduledAt });
export const saveAutomation = (parkId: string, type: AutomationType, enabled: boolean, delayHours: number) =>
  post<EmailOverview>(parkId, { action: 'save_automation', type, enabled, delay_hours: delayHours });
export const sendSeasonStart = (parkId: string) => post<{ recipients: number }>(parkId, { action: 'send_template' });
