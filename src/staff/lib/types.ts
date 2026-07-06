export interface Park {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ParkPathPrefix {
  id: string;
  park_id: string;
  path_prefix: string;
  is_active: boolean;
}

export interface Attraction {
  id: string;
  park_id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ParkCamera {
  id: string;
  park_id: string;
  customer_code: string;
  camera_name: string | null;
  attraction_id: string | null;
  is_active: boolean;
}

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'critical';
export type SupportTicketAuthorRole = 'operator' | 'support';

export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by: string | null;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  organization_id: string;
  author_id: string | null;
  author_role: SupportTicketAuthorRole;
  message: string;
  created_at: string;
  updated_at: string;
}
