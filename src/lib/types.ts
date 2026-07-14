export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Park {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  location: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Attraction {
  id: string;
  park_id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'maintenance';
  created_at: string;
  updated_at: string;
}

export interface OperatorProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'platform_admin' | 'org_owner' | 'park_manager' | 'marketing' | 'support_agent';
  created_at: string;
}

export interface Customer {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  opted_in_marketing: boolean;
  created_at: string;
}

export interface Photo {
  id: string;
  attraction_id: string;
  customer_id: string | null;
  image_url: string;
  thumbnail_url: string | null;
  taken_at: string;
  status: 'available' | 'purchased' | 'expired';
  metadata: Record<string, unknown>;
}

export interface Purchase {
  id: string;
  photo_id: string;
  customer_id: string;
  amount_cents: number;
  currency: string;
  stripe_payment_id: string | null;
  status: 'completed' | 'refunded' | 'pending';
  purchased_at: string;
}

export interface Lead {
  id: string;
  park_id: string;
  email: string;
  full_name: string | null;
  source: string;
  opted_in: boolean;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by: string;
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  organization_id: string;
  author_id: string | null;
  author_role: 'operator' | 'support';
  message: string;
  created_at: string;
  updated_at: string;
}

export interface SystemHealthEvent {
  id: string;
  park_id: string | null;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OverlayAsset {
  id: string;
  park_id: string;
  bucket: string;
  path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_by: string;
  created_at: string;
}

export interface OverlayCampaign {
  id: string;
  park_id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  priority: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export interface OverlayCampaignLayer {
  id: string;
  campaign_id: string;
  asset_id: string;
  z_index: number;
  opacity: number;
  blend_mode:
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'color-dodge'
    | 'color-burn'
    | 'hard-light'
    | 'soft-light';
  fit: 'contain' | 'cover' | 'fill';
  anchor:
    | 'center'
    | 'top_left'
    | 'top'
    | 'top_right'
    | 'left'
    | 'right'
    | 'bottom_left'
    | 'bottom'
    | 'bottom_right';
  scale: number;
}

export interface ResolvedOverlayLayer {
  asset_id: string;
  signed_url: string;
  z_index: number;
  opacity: number;
  blend_mode: string;
  fit: 'contain' | 'cover' | 'fill';
  anchor:
    | 'center'
    | 'top_left'
    | 'top'
    | 'top_right'
    | 'left'
    | 'right'
    | 'bottom_left'
    | 'bottom'
    | 'bottom_right';
  scale: number;
}

export interface ResolvedPhotoOverlays {
  photo_id: string;
  campaign_id: string | null;
  overlays: ResolvedOverlayLayer[];
}

export interface KPIData {
  totalRevenue: number;
  totalPurchases: number;
  conversionRate: number;
  activeAttractions: number;
  todayRevenue: number;
  weeklyTrend: { date: string; revenue: number; purchases: number }[];
}
