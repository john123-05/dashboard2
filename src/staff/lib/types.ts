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

export type LiftpicMachineMode = 'sold_only' | 'all_photos' | 'count_only';
export type LiftpicPairingStatus = 'ready' | 'paired' | 'disabled';

export interface LiftpicMachineConfig {
  id: string;
  park_id: string;
  attraction_id: string | null;
  machine_id: string;
  machine_label: string;
  camera_code: string;
  camera_label: string;
  legacy_customer_code: string;
  mode: LiftpicMachineMode;
  qr_enabled: boolean;
  speed_enabled: boolean;
  count_rides_enabled: boolean;
  upload_all_photos: boolean;
  shadow_mode: boolean;
  raw_dir: string;
  processed_dir: string;
  qrcode_dir: string;
  webout_dir: string;
  statistic_file: string;
  print_count_file: string;
  paper_warn_remaining: number;
  pairing_code: string;
  pairing_status: LiftpicPairingStatus;
  last_seen_at: string | null;
  last_status: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiftpicAssetDeployment {
  id: string;
  park_id: string;
  machine_config_id: string | null;
  machine_id: string | null;
  camera_code: string | null;
  slot: string;
  label: string | null;
  target_path: string;
  bucket: string;
  storage_path: string;
  sha256: string | null;
  content_type: string | null;
  file_size: number | null;
  restart_hint: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
