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

export interface SystemHealthEvent {
  id: string;
  park_id: string | null;
  event_type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KPIData {
  totalRevenue: number;
  totalPurchases: number;
  conversionRate: number;
  activeAttractions: number;
  todayRevenue: number;
  weeklyTrend: { date: string; revenue: number; purchases: number }[];
}
