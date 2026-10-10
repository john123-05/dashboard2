import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from './supabase';
import { getFunctionSession } from './functionAuth';
import type { Localized } from './surveyApi';

// Kampagnen (docs/PRODUKT_PLAN.md, E1–E3). Function `operator-social-campaigns` im shared-Projekt.

export type CampaignType = 'share_unlock' | 'giveaway' | 'record';
export type CampaignStatus = 'draft' | 'active' | 'ended';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  hashtag: string | null;
  mention: string | null;
  prize: string | null;
  rules_text: Localized;
  starts_at: string | null;
  ends_at: string | null;
  winner_entry_id: string | null;
  drawn_at: string | null;
  created_at: string;
  entries_total?: number;
  entries_verified?: number;
}

export interface CampaignList {
  campaigns: Campaign[];
  active_id: string | null;
  migration_pending?: boolean;
}

export interface CampaignEntry {
  id: string;
  name: string | null;
  handle: string | null;
  platform: string | null;
  post_url: string | null;
  giveaway_opt_in: boolean;
  verified_at: string | null;
  photo_rights: boolean;
  approved_at: string | null;
  created_at: string;
  email_masked: string | null;
  phone_masked: string | null;
  visitors: number;
}

export interface CampaignDetail {
  campaign: Campaign;
  entries: CampaignEntry[];
  leaderboard: CampaignEntry[];
}

export type CampaignDraft = Pick<Campaign, 'name' | 'type' | 'status' | 'hashtag' | 'mention' | 'prize' | 'rules_text' | 'starts_at' | 'ends_at'> & {
  id?: string;
};

async function call<T>(init: RequestInit, query: Record<string, string>): Promise<T> {
  const {
    data: { session },
  } = await getFunctionSession();
  if (!session?.access_token) throw new Error('Sitzung abgelaufen. Bitte neu anmelden.');
  const params = new URLSearchParams(query);
  const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/operator-social-campaigns?${params.toString()}`, {
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

export const fetchCampaigns = (parkId: string) => call<CampaignList>({ method: 'GET' }, { park_id: parkId });

export const fetchCampaign = (parkId: string, campaignId: string) =>
  call<CampaignDetail>({ method: 'GET' }, { park_id: parkId, campaign_id: campaignId });

export const saveCampaign = (parkId: string, campaign: CampaignDraft) =>
  post<CampaignList>(parkId, { action: 'save', campaign });

export const verifyEntry = (parkId: string, entryId: string, verified: boolean) =>
  post<{ ok: true }>(parkId, { action: 'verify', entry_id: entryId, verified });

export const approveEntry = (parkId: string, entryId: string, approved: boolean) =>
  post<{ ok: true }>(parkId, { action: 'approve', entry_id: entryId, approved });

export const drawWinner = (parkId: string, campaignId: string, options: { redraw?: boolean; weighted?: boolean } = {}) =>
  post<{ winner_entry_id: string }>(parkId, { action: 'draw', campaign_id: campaignId, ...options });
