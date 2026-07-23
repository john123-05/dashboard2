import { invokeEdgeFunction } from './edgeFunctions';

export interface ParkDashboardFeatures {
  stripe: boolean;
  local_sales: boolean;
  operations: boolean;
  health: boolean;
  errors: boolean;
  printer: boolean;
  cash: boolean;
  terminal: boolean;
  source_kind: string;
  source_bucket: string;
  source_prefix: string;
}

export interface ParkDashboardSummary {
  local_sales_cents: number;
  local_transaction_count: number;
  local_confirmed_transaction_count: number;
  local_unconfirmed_transaction_count: number;
  local_unknown_amount_transaction_count: number;
  local_unconfirmed_amount_cents: number;
  local_unconfirmed_terminal_cents: number;
  cash_sales_cents: number;
  terminal_sales_cents: number;
  cash_transaction_count: number;
  terminal_transaction_count: number;
  payment_attempt_count: number;
  payment_success_count: number;
  payment_failed_count: number;
  payment_cancelled_count: number;
  error_count: number;
  warning_count: number;
  critical_count: number;
  printer_paper_remaining: number | null;
  print_count: number;
  rides_total?: number | null;
  photos_sold_total?: number | null;
  photo_conversion_total?: number | null;
  photos_taken_today?: number | null;
  photos_sold_today?: number | null;
  photo_conversion_today?: number | null;
  last_activity_at: string | null;
  last_data_at: string | null;
  success_rate: number | null;
  cancel_rate: number | null;
}

export interface ParkDashboardEvent {
  id: string;
  occurred_at: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  payment_method: string | null;
  status: string;
  amount_cents: number | null;
  amount_kind: 'confirmed' | 'detected' | 'unknown';
  purchase_signal:
    | 'confirmed_sale'
    | 'unconfirmed_sale'
    | 'manual_print'
    | 'payment_attempt'
    | 'cancelled_payment'
    | 'none';
  description: string;
  source_file: string;
  raw_excerpt: string;
  device: string | null;
  tags: string[];
}

export interface ParkDashboardService {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  detail?: string | null;
  last_seen_at?: string | null;
}

export interface ParkDashboardSalesDaily {
  date: string;
  local_cents: number;
  cash_cents: number;
  terminal_cents: number;
  transactions: number;
  cancels: number;
}

export interface ParkDashboardData {
  park_id: string;
  park_name: string;
  features: ParkDashboardFeatures;
  summary: ParkDashboardSummary;
  sales: {
    daily: ParkDashboardSalesDaily[];
    recent_transactions: ParkDashboardEvent[];
    channels: {
      local_cents: number;
      cash_cents: number;
      terminal_cents: number;
      total_transactions: number;
      unconfirmed_cents?: number;
      unconfirmed_transactions?: number;
      unknown_amount_transactions?: number;
      cash_transactions?: number;
      terminal_transactions?: number;
    };
  };
  health: {
    communication_status: 'operational' | 'degraded' | 'down' | string;
    services: ParkDashboardService[];
    events: ParkDashboardEvent[];
    devices: ParkDashboardService[];
    last_activity_at: string | null;
    last_data_at: string | null;
    printer: {
      paper_remaining: number | null;
      print_count: number;
    };
  };
  errors: ParkDashboardEvent[];
  operations: {
    activity: ParkDashboardEvent[];
    devices: ParkDashboardService[];
    printer: {
      paper_remaining: number | null;
      print_count: number;
    };
    payments: {
      attempts: number;
      succeeded: number;
      failed: number;
      cancelled: number;
      unconfirmed_sales?: number;
      unknown_amounts?: number;
      detected_but_unconfirmed_cents?: number;
      success_rate: number | null;
      cancel_rate: number | null;
    };
    cash: {
      events: number;
      amount_cents: number;
    };
    terminal: {
      events: number;
      amount_cents: number;
    };
  };
  sources: {
    files_scanned: number;
    recognized_files: number;
    latest_object_at: string | null;
    bucket?: string;
    prefix?: string;
    fingerprint?: string;
    matched_files?: Array<{
      path: string;
      kind: string;
      updated_at: string | null;
      size: number;
    }>;
  };
  refreshed_at: string;
}

export function createEmptyParkDashboardData(
  parkId: string,
  parkName = 'Selected park',
): ParkDashboardData {
  return {
    park_id: parkId,
    park_name: parkName,
    features: {
      stripe: false,
      local_sales: false,
      operations: false,
      health: false,
      errors: false,
      printer: false,
      cash: false,
      terminal: false,
      source_kind: 'external_storage',
      source_bucket: 'daten',
      source_prefix: '',
    },
    summary: {
      local_sales_cents: 0,
      local_transaction_count: 0,
      local_confirmed_transaction_count: 0,
      local_unconfirmed_transaction_count: 0,
      local_unknown_amount_transaction_count: 0,
      local_unconfirmed_amount_cents: 0,
      local_unconfirmed_terminal_cents: 0,
      cash_sales_cents: 0,
      terminal_sales_cents: 0,
      cash_transaction_count: 0,
      terminal_transaction_count: 0,
      payment_attempt_count: 0,
      payment_success_count: 0,
      payment_failed_count: 0,
      payment_cancelled_count: 0,
      error_count: 0,
      warning_count: 0,
      critical_count: 0,
      printer_paper_remaining: null,
      print_count: 0,
      rides_total: null,
      photos_sold_total: null,
      photo_conversion_total: null,
      photos_taken_today: null,
      photos_sold_today: null,
      photo_conversion_today: null,
      last_activity_at: null,
      last_data_at: null,
      success_rate: null,
      cancel_rate: null,
    },
    sales: {
      daily: [],
      recent_transactions: [],
      channels: {
        local_cents: 0,
        cash_cents: 0,
        terminal_cents: 0,
        total_transactions: 0,
        unconfirmed_cents: 0,
        unconfirmed_transactions: 0,
        unknown_amount_transactions: 0,
        cash_transactions: 0,
        terminal_transactions: 0,
      },
    },
    health: {
      communication_status: 'down',
      services: [],
      events: [],
      devices: [],
      last_activity_at: null,
      last_data_at: null,
      printer: {
        paper_remaining: null,
        print_count: 0,
      },
    },
    errors: [],
    operations: {
      activity: [],
      devices: [],
      printer: {
        paper_remaining: null,
        print_count: 0,
      },
      payments: {
        attempts: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        unconfirmed_sales: 0,
        unknown_amounts: 0,
        detected_but_unconfirmed_cents: 0,
        success_rate: null,
        cancel_rate: null,
      },
      cash: {
        events: 0,
        amount_cents: 0,
      },
      terminal: {
        events: 0,
        amount_cents: 0,
      },
    },
    sources: {
      files_scanned: 0,
      recognized_files: 0,
      latest_object_at: null,
      bucket: 'daten',
      prefix: '',
      fingerprint: '',
      matched_files: [],
    },
    refreshed_at: new Date().toISOString(),
  };
}

export async function loadParkDashboardData(
  parkId: string,
  refresh = false,
): Promise<{ data: ParkDashboardData | null; error: string | null }> {
  return invokeEdgeFunction<ParkDashboardData>('park-dashboard-data', {
    useSessionAuth: true,
    query: {
      park_id: parkId,
      ...(refresh ? { refresh: true } : {}),
    },
  });
}
