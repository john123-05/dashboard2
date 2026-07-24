import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DASHBOARD_SUPABASE_URL =
  Deno.env.get("DASHBOARD_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const DASHBOARD_SUPABASE_SERVICE_KEY =
  Deno.env.get("DASHBOARD_SUPABASE_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DASHBOARD_SUPABASE_ANON_KEY =
  Deno.env.get("DASHBOARD_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");

const EXTERNAL_SUPABASE_URL =
  Deno.env.get("APP_SUPABASE_URL") ?? Deno.env.get("EXTERNAL_SUPABASE_URL");
const EXTERNAL_SUPABASE_SERVICE_KEY =
  Deno.env.get("APP_SUPABASE_SERVICE_KEY") ?? Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY");
// The shared project's anon key. machine_status has an anon read policy, so an
// anon key is enough to read it - and avoids depending on the service key
// secret being correctly configured.
const EXTERNAL_SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_ANON_KEY") ??
  Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ??
  EXTERNAL_SUPABASE_SERVICE_KEY;

const DEFAULT_OPERATIONS_BUCKET = Deno.env.get("OPERATIONS_BUCKET") ?? "daten";
const MAX_FILES_TO_PARSE = 36;
const MAX_OBJECTS_PER_PREFIX = 160;
const MAX_RECURSION_DEPTH = 4;
const MAX_LINES_PER_FILE = 2500;
// Ignore recognized log files older than this. A park that switched to the
// Liftpic Sync agent (machine_status heartbeats) stops writing to the ops
// storage bucket, leaving months-old files behind (e.g. Imst's dead March
// upload chain) - without this the System Health page keeps resurrecting
// those stale "events"/devices. Files with unknown age are kept.
const MAX_RECOGNIZED_FILE_AGE_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

type JsonRecord = Record<string, unknown>;

type ParkRow = {
  id: string;
  slug: string;
  name: string;
  organization_id: string | null;
};

type ParkFeatureSettings = {
  park_id: string;
  stripe_mode: "auto" | "enabled" | "disabled";
  local_sales_mode: "auto" | "enabled" | "disabled";
  operations_mode: "auto" | "enabled" | "disabled";
  health_mode: "auto" | "enabled" | "disabled";
  errors_mode: "auto" | "enabled" | "disabled";
  operations_source: "external_storage" | "dashboard_storage";
  operations_bucket: string;
  operations_prefix: string | null;
  settings: JsonRecord;
};

type StorageObject = {
  name: string;
  id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
};

type RecognizedKind =
  | "statistic"
  | "debug_log"
  | "errors_log"
  | "threeger_log"
  | "zvt_log"
  | "coin_log"
  | "generic_log";

type RecognizedObject = {
  path: string;
  name: string;
  updated_at: string | null;
  size: number;
  mime_type: string | null;
  kind: RecognizedKind;
};

type ParsedEvent = {
  id: string;
  occurred_at: string;
  severity: "info" | "warning" | "error" | "critical";
  category:
    | "sale"
    | "payment"
    | "terminal"
    | "cash"
    | "printer"
    | "system"
    | "error"
    | "warning"
    | "photo"
    | "log";
  payment_method: "cash" | "coin" | "terminal" | "card" | "unknown" | null;
  status: "completed" | "failed" | "cancelled" | "warning" | "info" | "unknown" | "pending";
  amount_cents: number | null;
  amount_kind: "confirmed" | "detected" | "unknown";
  purchase_signal:
    | "confirmed_sale"
    | "unconfirmed_sale"
    | "manual_print"
    | "payment_attempt"
    | "cancelled_payment"
    | "none";
  description: string;
  source_file: string;
  raw_excerpt: string;
  device: string | null;
  tags: string[];
};

type ParsedAggregate = {
  feature_flags: JsonRecord;
  summary: JsonRecord;
  sales: JsonRecord;
  health: JsonRecord;
  errors: ParsedEvent[];
  operations: JsonRecord;
  sources: JsonRecord;
};

type MachineStatusRow = {
  machine_id: string;
  park_id: string;
  park_slug: string;
  app_version: string | null;
  last_seen_at: string | null;
  queue_count: number | null;
  disk_free_mb: number | null;
  camera_status: string | null;
  paper_status: string | null;
  paper_remaining: number | null;
  last_error: string | null;
  camera_code?: string | null;
  photos_taken_today?: number | null;
  photos_sold_today?: number | null;
  photo_conversion_today?: number | null;
  payload?: JsonRecord | null;
};

const PARSE_LIMITS_BY_KIND: Record<RecognizedKind, number> = {
  statistic: 8,
  debug_log: 4,
  errors_log: 4,
  threeger_log: 4,
  zvt_log: 8,
  coin_log: 8,
  generic_log: 4,
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, status = 500, details?: string) {
  return jsonResponse(
    {
      error,
      ...(details ? { details } : {}),
    },
    status,
  );
}

function normalizePathSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function ensureTrailingSlash(value: string) {
  if (!value) return "";
  return value.endsWith("/") ? value : `${value}/`;
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function basename(path: string) {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function parseIsoOrNull(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeDate(value?: string | null, fallback?: string | null) {
  return parseIsoOrNull(value) ?? parseIsoOrNull(fallback) ?? new Date().toISOString();
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .map((value) => parseIsoOrNull(value))
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function pushMax<T>(list: T[], item: T, max: number) {
  list.push(item);
  if (list.length > max) {
    list.shift();
  }
}

function parseFlexibleNumber(value: string) {
  const raw = value.trim().replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      const normalized = raw.replace(/\./g, "").replace(",", ".");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const normalized = raw.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (commaCount === 1 && dotCount === 0) {
    const normalized = raw.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (dotCount > 1 && commaCount === 0) {
    const normalized = raw.replace(/\./g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractAmountCents(line: string) {
  const lower = line.toLowerCase();
  if (
    !/(€|eur|amount|betrag|total|sum|umsatz|sale|verkauf|payment|paid|price|cash|coin|card|terminal|zvt)/i.test(
      lower,
    )
  ) {
    return null;
  }

  const amountMatches = [
    ...line.matchAll(/(?:€|eur|amount|betrag|total|sum|umsatz|sale|verkauf|payment|paid|price)[^\d-]*(-?\d{1,7}(?:[.,]\d{1,2})?)/gi),
    ...line.matchAll(/\b(-?\d{1,7}[.,]\d{2})\s*(?:€|eur)\b/gi),
  ];

  for (const match of amountMatches) {
    const parsed = parseFlexibleNumber(match[1]);
    if (parsed === null) continue;
    if (Math.abs(parsed) > 0 && Math.abs(parsed) < 500000) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

function extractOperationalSignalCents(line: string, kind: RecognizedKind) {
  if (kind !== "coin_log") return null;

  const acceptedMatch = line.match(/accepted\s*-\s*(\d{1,6})/i);
  if (acceptedMatch) {
    const value = Number.parseInt(acceptedMatch[1], 10);
    return Number.isFinite(value) && value > 0 && value <= 100000 ? value : null;
  }

  const payoutMatch = line.match(/setpaymentmanager\(1,0,(\d{1,6}),0\)/i);
  if (payoutMatch) {
    const value = Number.parseInt(payoutMatch[1], 10);
    return Number.isFinite(value) && value > 0 && value <= 100000 ? value : null;
  }

  return null;
}

function isOperationalControlLine(kind: RecognizedKind, lower: string) {
  if (kind === "coin_log") {
    return /(setpaymentmanager|openpaymentmanager|closepaymentmanager|stoppaymentmanager|startpaymentmanager|status - ready|enable all|disable all|payment unit disabled|validator reset|reset\)|ready\))/i.test(
      lower,
    );
  }

  if (kind === "zvt_log") {
    return /(initialisierung|verbinde|verbindung|terminal bereit|bereit|statusabfrage)/i.test(
      lower,
    );
  }

  return false;
}

function isPaymentEventLine(
  kind: RecognizedKind,
  lower: string,
  amountCents: number | null,
  paymentMethod: ParsedEvent["payment_method"],
  status: ParsedEvent["status"],
) {
  const hasTransactionKeyword = /(verkauf|sale|umsatz|betrag|amount|total|price|paid|approved|declined|ergebnistext|transaktion|transaction|cancel|abbruch|storno|timeout|purchase|zahlung)/i.test(
    lower,
  );

  if (kind === "zvt_log") {
    return /(betrag|ergebnistext|transaktion|transaction|zahlung|payment)/i.test(lower);
  }

  if (kind === "coin_log") {
    if (isOperationalControlLine(kind, lower)) return false;
    return hasTransactionKeyword && (amountCents !== null || paymentMethod !== null || status !== "unknown");
  }

  return hasTransactionKeyword && (amountCents !== null || paymentMethod !== null || status !== "unknown");
}

function extractInteger(line: string) {
  const match = line.match(/(-?\d{1,9})/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractTimestamp(line: string, fallbackIso: string) {
  const patterns = [
    /\b(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\b/,
    /\b(\d{2}\.\d{2}\.\d{4}[ T]\d{2}:\d{2}:\d{2})\b/,
    /\b(\d{2}\/\d{2}\/\d{4}[ T]\d{2}:\d{2}:\d{2})\b/,
    /\b(\d{2}\.\d{2}\.\d{4})\b/,
    /\b(\d{2}\/\d{2}\/\d{4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match) continue;
    const raw = match[1];
    const parsed = parseFlexibleTimestamp(raw);
    if (parsed) return parsed;
  }

  return fallbackIso;
}

function parseFlexibleTimestamp(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const parsed = new Date(trimmed.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const germanMatch = trimmed.match(
    /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (germanMatch) {
    const [, dd, mm, yyyy, hh, min, ss] = germanMatch;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const slashMatch = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (slashMatch) {
    const [, dd, mm, yyyy, hh, min, ss] = slashMatch;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const germanDateOnly = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (germanDateOnly) {
    const [, dd, mm, yyyy] = germanDateOnly;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const slashDateOnly = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDateOnly) {
    const [, dd, mm, yyyy] = slashDateOnly;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function inferSeverity(line: string): ParsedEvent["severity"] {
  const lower = line.toLowerCase();
  if (
    /(critical|fatal|panic|device lost|watchdog|system halted|communication lost|offline|paper empty|printer offline)/i.test(
      lower,
    )
  ) {
    return "critical";
  }
  if (/(error|exception|failed|declined|timeout|disconnect|stopped|fault)/i.test(lower)) {
    return "error";
  }
  if (/(warn|warning|retry|degraded|cancel|abbruch|aborted|storno)/i.test(lower)) {
    return "warning";
  }
  return "info";
}

function inferPaymentMethod(line: string): ParsedEvent["payment_method"] {
  const lower = line.toLowerCase();
  if (/(coinchanger|coin charger|coin|m[uü]nz|muenz|nri)/i.test(lower)) return "coin";
  if (/(cash|barzahlung|bar | banknote|schein)/i.test(lower)) return "cash";
  if (/(terminal|zvt|ec |credit|card|kreditkarte|karte)/i.test(lower)) return "terminal";
  return null;
}

function inferStatus(line: string, severity: ParsedEvent["severity"]): ParsedEvent["status"] {
  const lower = line.toLowerCase();
  if (/(cancel|cancelled|abbruch|abgebrochen|storno|aborted)/i.test(lower)) return "cancelled";
  if (/(success|successful|approved|completed|paid|verkauft|done|ok\b)/i.test(lower)) {
    return "completed";
  }
  if (/(failed|declined|error|timeout|fault)/i.test(lower)) return "failed";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return "unknown";
}

function inferCategory(kind: RecognizedKind, line: string): ParsedEvent["category"] {
  const lower = line.toLowerCase();
  if (kind === "errors_log") return "error";
  if (kind === "zvt_log") return "terminal";
  if (kind === "coin_log") return "cash";
  if (kind === "statistic") return "system";
  if (/(paper|papier|print|druck|printer|consumable|ribbon)/i.test(lower)) return "printer";
  if (/(sale|verkauf|umsatz|payment|paid|betrag|amount|purchase)/i.test(lower)) {
    return "payment";
  }
  if (/(terminal|zvt|ec |credit|card|kreditkarte|karte)/i.test(lower)) return "terminal";
  if (/(cash|coin|bar|nri|coinchanger)/i.test(lower)) return "cash";
  if (/(camera|photo|image|capture)/i.test(lower)) return "photo";
  if (/(error|exception|failed|fault)/i.test(lower)) return "error";
  if (/(warn|warning|retry)/i.test(lower)) return "warning";
  return "system";
}

function inferDevice(kind: RecognizedKind, line: string, path: string) {
  if (kind === "zvt_log") return "Payment Terminal";
  if (kind === "coin_log") return "Coin Changer";
  if (/(paper|printer|drucker|print)/i.test(line)) return "Printer";
  if (/(camera|capture|photo)/i.test(line)) return "Camera";

  const pathMatch = path.match(/(terminal|printer|coin|camera|device|pc|kasse)[-_ ]?([a-z0-9]+)/i);
  if (pathMatch) {
    return `${pathMatch[1]} ${pathMatch[2]}`.replace(/\b\w/g, (part) => part.toUpperCase());
  }

  return null;
}

function detectKind(name: string): RecognizedKind | null {
  if (/statistic\.txt$/i.test(name)) return "statistic";
  if (/debug\.log$/i.test(name)) return "debug_log";
  if (/errors?\.log$/i.test(name)) return "errors_log";
  if (/3gerlog\.txt$/i.test(name)) return "threeger_log";
  if (/^zvtlog_.*\.txt$/i.test(name)) return "zvt_log";
  if (/^nri\.coincharger_.*\.txt$/i.test(name)) return "coin_log";
  if (/\.(txt|log)$/i.test(name)) return "generic_log";
  return null;
}

function prioritizeRecognizedObjects(objects: RecognizedObject[]) {
  const sorted = [...objects].sort((a, b) => {
    const left = new Date(b.updated_at ?? 0).getTime();
    const right = new Date(a.updated_at ?? 0).getTime();
    return left - right;
  });

  const kindCounts = new Map<RecognizedKind, number>();
  const selected: RecognizedObject[] = [];

  for (const item of sorted) {
    const current = kindCounts.get(item.kind) ?? 0;
    const limit = PARSE_LIMITS_BY_KIND[item.kind] ?? 4;
    if (current >= limit) continue;
    selected.push(item);
    kindCounts.set(item.kind, current + 1);
  }

  return selected.slice(0, MAX_FILES_TO_PARSE);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function trimLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function decodeContent(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount <= 6) return utf8;
  return new TextDecoder("latin1").decode(buffer);
}

async function fetchJson<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${details}`);
  }
  return (await response.json()) as T;
}

function buildDashboardReadHeaders(userAuthHeader: string | null) {
  if (userAuthHeader && DASHBOARD_SUPABASE_ANON_KEY) {
    return {
      Authorization: userAuthHeader,
      apikey: DASHBOARD_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
  }

  if (DASHBOARD_SUPABASE_SERVICE_KEY) {
    return {
      Authorization: `Bearer ${DASHBOARD_SUPABASE_SERVICE_KEY}`,
      apikey: DASHBOARD_SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
    };
  }

  return null;
}

function buildDashboardWriteHeaders() {
  if (!DASHBOARD_SUPABASE_URL || !DASHBOARD_SUPABASE_SERVICE_KEY) return null;
  return {
    Authorization: `Bearer ${DASHBOARD_SUPABASE_SERVICE_KEY}`,
    apikey: DASHBOARD_SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
}

function buildDashboardServiceReadHeaders() {
  if (!DASHBOARD_SUPABASE_URL || !DASHBOARD_SUPABASE_SERVICE_KEY) return null;
  return {
    Authorization: `Bearer ${DASHBOARD_SUPABASE_SERVICE_KEY}`,
    apikey: DASHBOARD_SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
  };
}

function buildExternalHeaders() {
  if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_SERVICE_KEY) return null;
  return {
    Authorization: `Bearer ${EXTERNAL_SUPABASE_SERVICE_KEY}`,
    apikey: EXTERNAL_SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
  };
}

function buildExternalAnonHeaders() {
  if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_ANON_KEY) return null;
  return {
    Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
    apikey: EXTERNAL_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}

async function fetchDashboardRows<T>(
  path: string,
  userAuthHeader: string | null,
): Promise<T> {
  if (!DASHBOARD_SUPABASE_URL) {
    throw new Error("Dashboard Supabase URL is not configured.");
  }

  const headers = buildDashboardReadHeaders(userAuthHeader);
  if (!headers) {
    throw new Error("Dashboard read credentials are not configured.");
  }

  return fetchJson<T>(`${DASHBOARD_SUPABASE_URL}${path}`, {
    headers,
  });
}

async function fetchDashboardServiceRows<T>(path: string): Promise<T> {
  if (!DASHBOARD_SUPABASE_URL) {
    throw new Error("Dashboard Supabase URL is not configured.");
  }

  const headers = buildDashboardServiceReadHeaders();
  if (!headers) {
    throw new Error("Dashboard service read credentials are not configured.");
  }

  return fetchJson<T>(`${DASHBOARD_SUPABASE_URL}${path}`, {
    headers,
  });
}

async function fetchExternalRows<T>(path: string, useAnon = false): Promise<T> {
  if (!EXTERNAL_SUPABASE_URL) {
    throw new Error("External Supabase URL is not configured.");
  }

  const headers = useAnon ? buildExternalAnonHeaders() : buildExternalHeaders();
  if (!headers) {
    throw new Error("External Supabase credentials are not configured.");
  }

  return fetchJson<T>(`${EXTERNAL_SUPABASE_URL}/rest/v1/${path}`, {
    headers,
  });
}

async function fetchExternalStorageList(
  baseUrl: string,
  headers: HeadersInit,
  bucket: string,
  prefix: string,
) {
  const body = {
    prefix,
    limit: 100,
    sortBy: {
      column: "updated_at",
      order: "desc",
    },
  };

  return fetchJson<StorageObject[]>(`${baseUrl}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function downloadStorageObject(
  baseUrl: string,
  headers: HeadersInit,
  bucket: string,
  path: string,
) {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const response = await fetch(
    `${baseUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`,
    {
      headers,
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to download ${bucket}/${path}: ${response.status} ${details}`);
  }

  return response.arrayBuffer();
}

async function listObjectsRecursive(
  baseUrl: string,
  headers: HeadersInit,
  bucket: string,
  prefix: string,
  depth = 0,
  seen = new Set<string>(),
): Promise<StorageObject[]> {
  if (depth > MAX_RECURSION_DEPTH) return [];
  const normalizedPrefix = prefix ? ensureTrailingSlash(prefix) : "";
  if (seen.has(normalizedPrefix)) return [];
  seen.add(normalizedPrefix);

  const listed = await fetchExternalStorageList(baseUrl, headers, bucket, normalizedPrefix);
  const objects: StorageObject[] = [];

  for (const item of listed) {
    const itemPath = normalizedPrefix ? `${normalizedPrefix}${item.name}` : item.name;
    const isFolder =
      !item.id &&
      !item.updated_at &&
      !item.created_at &&
      (!item.metadata || Object.keys(item.metadata).length === 0);

    if (isFolder) {
      const childObjects = await listObjectsRecursive(
        baseUrl,
        headers,
        bucket,
        itemPath,
        depth + 1,
        seen,
      );
      objects.push(...childObjects);
      if (objects.length >= MAX_OBJECTS_PER_PREFIX) {
        return objects.slice(0, MAX_OBJECTS_PER_PREFIX);
      }
      continue;
    }

    objects.push({
      ...item,
      name: itemPath,
    });

    if (objects.length >= MAX_OBJECTS_PER_PREFIX) {
      return objects.slice(0, MAX_OBJECTS_PER_PREFIX);
    }
  }

  return objects;
}

async function findRelevantObjects(
  sourceKind: "external_storage" | "dashboard_storage",
  bucket: string,
  prefixCandidates: string[],
  userAuthHeader: string | null,
) {
  const externalHeaders = buildExternalHeaders();
  const dashboardHeaders = buildDashboardReadHeaders(userAuthHeader);

  const baseUrl =
    sourceKind === "external_storage" ? EXTERNAL_SUPABASE_URL : DASHBOARD_SUPABASE_URL;
  const headers =
    sourceKind === "external_storage" ? externalHeaders : dashboardHeaders;

  if (!baseUrl || !headers) {
    throw new Error(
      sourceKind === "external_storage"
        ? "External storage credentials are not configured."
        : "Dashboard storage credentials are not configured.",
    );
  }

  for (const prefixCandidate of prefixCandidates) {
    const objects = await listObjectsRecursive(
      baseUrl,
      headers,
      bucket,
      prefixCandidate,
    );

    const recognized = objects
      .map((item) => {
        const name = basename(item.name);
        const kind = detectKind(name);
        if (!kind) return null;
        const updatedAt = parseIsoOrNull(item.updated_at ?? item.created_at);
        // Drop long-dead log files so old data (e.g. March) can't resurface.
        if (updatedAt && Date.now() - new Date(updatedAt).getTime() > MAX_RECOGNIZED_FILE_AGE_MS) {
          return null;
        }
        return {
          path: item.name,
          name,
          updated_at: updatedAt,
          size: Number(item.metadata?.size ?? 0),
          mime_type: typeof item.metadata?.mimetype === "string" ? item.metadata.mimetype : null,
          kind,
        } as RecognizedObject;
      })
      .filter(Boolean) as RecognizedObject[];

    if (recognized.length > 0) {
      return {
        prefix: ensureTrailingSlash(prefixCandidate),
        all_objects: objects,
        recognized_objects: prioritizeRecognizedObjects(recognized),
        baseUrl,
        headers,
      };
    }
  }

  const fallbackPrefix = prefixCandidates[0] ?? "";
  const objects = await listObjectsRecursive(
    baseUrl,
    headers,
    bucket,
    fallbackPrefix,
  );
  return {
    prefix: ensureTrailingSlash(fallbackPrefix),
    all_objects: objects,
    recognized_objects: [] as RecognizedObject[],
    baseUrl,
    headers,
  };
}

function createEmptyAggregate(lastObjectAt: string | null): ParsedAggregate {
  return {
    feature_flags: {
      local_sales: false,
      operations: false,
      errors: false,
      health: true,
      printer: false,
      cash: false,
      terminal: false,
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
      last_activity_at: lastObjectAt,
      last_data_at: lastObjectAt,
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
      },
    },
    health: {
      communication_status: lastObjectAt ? "degraded" : "down",
      services: [],
      events: [],
      devices: [],
      last_activity_at: lastObjectAt,
      last_data_at: lastObjectAt,
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
      latest_object_at: lastObjectAt,
      matched_files: [],
    },
  };
}

function maybeAddTag(set: Set<string>, condition: boolean, tag: string) {
  if (condition) set.add(tag);
}

function parseStatisticMetrics(
  line: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const lower = line.toLowerCase();
  const integer = extractInteger(line);

  if (/(paper|papier|fotopapier).*(remaining|left|rest|available|remain|stand)/i.test(lower) && integer !== null) {
    aggregate.paperRemaining = integer;
  }
  if (/(error).*(count|total)/i.test(lower) && integer !== null) {
    aggregate.errorCounterHints = Math.max(aggregate.errorCounterHints, integer);
  }
  if (/(warning).*(count|total)/i.test(lower) && integer !== null) {
    aggregate.warningCounterHints = Math.max(aggregate.warningCounterHints, integer);
  }
}

type StatisticLayout = {
  delimiter: ";" | "\t" | null;
  cashIndex: number | null;
  terminalIndex: number | null;
  totalIndex: number | null;
};

type StatisticSale = {
  cash_cents: number;
  terminal_cents: number;
  total_cents: number;
};

function splitStatisticFields(line: string, delimiter: StatisticLayout["delimiter"]) {
  if (!delimiter) return null;
  return line
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function detectStatisticLayout(lines: string[]): StatisticLayout {
  for (const line of lines.slice(0, 12)) {
    const lower = line.toLowerCase();
    if (!/(cash|cashless|card|terminal|price|preis|umsatz|verkauf|total)/i.test(lower)) {
      continue;
    }

    const delimiter = line.includes(";") ? ";" : line.includes("\t") ? "\t" : null;
    if (!delimiter) continue;

    const parts = splitStatisticFields(line, delimiter);
    if (!parts || parts.length < 3) continue;

    const normalized = parts.map((part) => part.toLowerCase());
    const cashIndex = normalized.findIndex((part) => /\bcash\b|bar/.test(part));
    const terminalIndex = normalized.findIndex((part) =>
      /cashless|terminal|card|karte|ec|credit/.test(part)
    );
    const totalIndex = normalized.findIndex((part) =>
      /price|preis|umsatz|verkauf|sale|total/.test(part)
    );

    if (totalIndex >= 0 || cashIndex >= 0 || terminalIndex >= 0) {
      return {
        delimiter,
        cashIndex: cashIndex >= 0 ? cashIndex : null,
        terminalIndex: terminalIndex >= 0 ? terminalIndex : null,
        totalIndex: totalIndex >= 0 ? totalIndex : null,
      };
    }
  }

  return {
    delimiter: null,
    cashIndex: null,
    terminalIndex: null,
    totalIndex: null,
  };
}

function toStatisticCents(raw: string, assumeRawCents = false) {
  const cleaned = raw.trim().replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const parsed = parseFlexibleNumber(cleaned);
  if (parsed === null) return null;
  if (assumeRawCents) return Math.round(parsed);
  return Math.round(parsed * 100);
}

function parseStatisticTriplet(rawTriplet: string[]): StatisticSale | null {
  if (rawTriplet.length < 3) return null;
  const cleaned = rawTriplet.map((item) => item.trim().replace(/[^\d,.-]/g, ""));
  if (cleaned.some((item) => item.length === 0)) return null;

  const numeric = cleaned.map((item) => parseFlexibleNumber(item));
  if (numeric.some((item) => item === null)) return null;

  const safeNumeric = numeric as number[];
  const useRawCents =
    cleaned.every((item) => !/[.,]/.test(item)) &&
    safeNumeric.every((item) => Number.isFinite(item)) &&
    Math.max(...safeNumeric.map((item) => Math.abs(item))) >= 100;

  const [cashRaw, terminalRaw, totalRaw] = rawTriplet;
  const cashCents = toStatisticCents(cashRaw, useRawCents);
  const terminalCents = toStatisticCents(terminalRaw, useRawCents);
  const totalCents = toStatisticCents(totalRaw, useRawCents);

  if (cashCents === null || terminalCents === null || totalCents === null) {
    return null;
  }

  if (
    cashCents < 0 ||
    terminalCents < 0 ||
    totalCents < 0 ||
    cashCents > 500000 ||
    terminalCents > 500000 ||
    totalCents > 500000
  ) {
    return null;
  }

  return {
    cash_cents: cashCents,
    terminal_cents: terminalCents,
    total_cents: totalCents,
  };
}

function extractStatisticSale(line: string, layout: StatisticLayout): StatisticSale | null {
  const segment = line.split("::").pop()?.trim();
  if (segment && segment.includes("||")) {
    const parsed = parseStatisticTriplet(
      segment.split("||").map((part) => part.trim()),
    );
    if (parsed) return parsed;
  }

  const fields = splitStatisticFields(line, layout.delimiter);

  if (
    fields &&
    layout.totalIndex !== null &&
    fields.length > layout.totalIndex
  ) {
    const rawTriplet = [
      layout.cashIndex !== null && fields.length > layout.cashIndex ? fields[layout.cashIndex] : "0",
      layout.terminalIndex !== null && fields.length > layout.terminalIndex ? fields[layout.terminalIndex] : "0",
      fields[layout.totalIndex],
    ];
    const parsed = parseStatisticTriplet(rawTriplet);
    if (parsed) return parsed;
  }

  if (fields && fields.length >= 3) {
    const parsed = parseStatisticTriplet(fields.slice(-3));
    if (parsed) return parsed;
  }

  const numericTokens = [...line.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((match) => match[0]);
  if (numericTokens.length < 3) return null;
  return parseStatisticTriplet(numericTokens.slice(-3));
}

function formatCentsSummary(value: number) {
  return (value / 100).toFixed(2);
}

function applyEventToTelemetry(
  aggregate: ReturnType<typeof createAccumulator>,
  event: ParsedEvent,
) {
  if (new Date(event.occurred_at).getTime() > new Date(aggregate.lastEventAt).getTime()) {
    aggregate.lastEventAt = event.occurred_at;
  }

  if (event.severity === "warning" || event.severity === "error" || event.severity === "critical") {
    pushMax(aggregate.errors, event, 160);
  }

  pushMax(aggregate.activity, event, 120);

  if (event.device) {
    const deviceStatus =
      event.severity === "critical" || event.severity === "error"
        ? "down"
        : event.severity === "warning"
          ? "degraded"
          : "operational";
    aggregate.devices.set(
      event.device,
      updateStatus(aggregate.devices.get(event.device), {
        status: deviceStatus,
        detail: event.description,
        last_seen_at: event.occurred_at,
      }),
    );
  }

  if (event.category === "printer") {
    aggregate.services.set(
      "Printer",
      updateStatus(aggregate.services.get("Printer"), {
        status:
          event.severity === "critical" || event.severity === "error"
            ? "down"
            : event.severity === "warning"
              ? "degraded"
              : "operational",
        detail: event.description,
        last_seen_at: event.occurred_at,
      }),
    );
  }

  if (event.category === "terminal") {
    aggregate.services.set(
      "Payment Terminal",
      updateStatus(aggregate.services.get("Payment Terminal"), {
        status:
          event.severity === "critical" || event.severity === "error"
            ? "down"
            : event.severity === "warning"
              ? "degraded"
              : "operational",
        detail: event.description,
        last_seen_at: event.occurred_at,
      }),
    );
  }

  if (event.category === "cash") {
    aggregate.services.set(
      "Cash / Coin",
      updateStatus(aggregate.services.get("Cash / Coin"), {
        status:
          event.severity === "critical" || event.severity === "error"
            ? "down"
            : event.severity === "warning"
              ? "degraded"
              : "operational",
        detail: event.description,
        last_seen_at: event.occurred_at,
      }),
    );
  }

  if (event.tags.includes("connectivity")) {
    aggregate.services.set(
      "Data Communication",
      updateStatus(aggregate.services.get("Data Communication"), {
        status: event.severity === "info" ? "operational" : "degraded",
        detail: event.description,
        last_seen_at: event.occurred_at,
      }),
    );
  }
}

function createParsedEvent(
  file: RecognizedObject,
  occurredAt: string,
  severity: ParsedEvent["severity"],
  category: ParsedEvent["category"],
  description: string,
  options: {
    paymentMethod?: ParsedEvent["payment_method"];
    status?: ParsedEvent["status"];
    amountCents?: number | null;
    amountKind?: ParsedEvent["amount_kind"];
    purchaseSignal?: ParsedEvent["purchase_signal"];
    device?: string | null;
    tags?: string[];
    rawExcerpt?: string;
  } = {},
): ParsedEvent {
  return {
    id: crypto.randomUUID(),
    occurred_at: occurredAt,
    severity,
    category,
    payment_method: options.paymentMethod ?? null,
    status: options.status ?? (severity === "info" ? "info" : severity === "warning" ? "warning" : "failed"),
    amount_cents: options.amountCents ?? null,
    amount_kind:
      options.amountKind ?? (options.amountCents === null || options.amountCents === undefined ? "unknown" : "confirmed"),
    purchase_signal: options.purchaseSignal ?? "none",
    description: description.slice(0, 240),
    source_file: file.path,
    raw_excerpt: (options.rawExcerpt ?? description).slice(0, 400),
    device: options.device ?? null,
    tags: options.tags ?? [],
  };
}

function registerSourcePresence(
  aggregate: ReturnType<typeof createAccumulator>,
  serviceName: string,
  occurredAt: string,
  detail: string,
) {
  aggregate.services.set(
    serviceName,
    updateStatus(aggregate.services.get(serviceName), {
      status: "operational",
      detail,
      last_seen_at: occurredAt,
    }),
  );
  aggregate.devices.set(
    serviceName,
    updateStatus(aggregate.devices.get(serviceName), {
      status: "operational",
      detail,
      last_seen_at: occurredAt,
    }),
  );
}

function parseStatisticFile(
  file: RecognizedObject,
  lines: string[],
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const layout = detectStatisticLayout(lines);

  for (const line of lines) {
    parseStatisticMetrics(line, aggregate);

    const sale = extractStatisticSale(line, layout);
    if (!sale) continue;

    const occurredAt = extractTimestamp(line, fallbackIso);
    aggregate.printCount += 1;
    aggregate.localSales.transactionCount += 1;
    const bucket = ensureDayBucket(aggregate.dayBuckets, occurredAt);
    bucket.transactions += 1;

    if (sale.total_cents <= 0) {
      aggregate.localSales.unconfirmedTransactionCount += 1;
      aggregate.localSales.unknownAmountTransactionCount += 1;
      const manualEvent = createParsedEvent(
        file,
        occurredAt,
        "info",
        "sale",
        "Manual print without POS amount",
        {
          status: "info",
          amountKind: "unknown",
          purchaseSignal: "manual_print",
          device: "Print Station",
          tags: ["statistic", "print", "manual-sale"],
          rawExcerpt: line,
        },
      );
      pushMax(aggregate.transactions, manualEvent, 80);
      if (new Date(manualEvent.occurred_at).getTime() > new Date(aggregate.lastEventAt).getTime()) {
        aggregate.lastEventAt = manualEvent.occurred_at;
      }
      continue;
    }

    aggregate.localSales.total += sale.total_cents;
    aggregate.localSales.cash += sale.cash_cents;
    aggregate.localSales.terminal += sale.terminal_cents;
    aggregate.localSales.confirmedTransactionCount += 1;
    aggregate.localSales.attempts += 1;
    aggregate.localSales.success += 1;

    if (sale.cash_cents > 0) {
      aggregate.localSales.cashTransactions += 1;
    }
    if (sale.terminal_cents > 0) {
      aggregate.localSales.terminalTransactions += 1;
    }

    bucket.local_cents += sale.total_cents;
    bucket.cash_cents += sale.cash_cents;
    bucket.terminal_cents += sale.terminal_cents;

    const paymentMethod =
      sale.cash_cents > 0 && sale.terminal_cents === 0
        ? "cash"
        : sale.terminal_cents > 0 && sale.cash_cents === 0
          ? "terminal"
          : null;

    const event = createParsedEvent(
      file,
      occurredAt,
      "info",
      "sale",
      `Print sale · Cash ${formatCentsSummary(sale.cash_cents)} · Cashless ${formatCentsSummary(sale.terminal_cents)} · Total ${formatCentsSummary(sale.total_cents)}`,
      {
        paymentMethod,
        status: "completed",
        amountCents: sale.total_cents,
        amountKind: "confirmed",
        purchaseSignal: "confirmed_sale",
        device: "Print Station",
        tags: [
          "statistic",
          "print",
          ...(sale.cash_cents > 0 ? ["cash"] : []),
          ...(sale.terminal_cents > 0 ? ["terminal"] : []),
        ],
        rawExcerpt: line,
      },
    );

    pushMax(aggregate.transactions, event, 80);
    if (new Date(event.occurred_at).getTime() > new Date(aggregate.lastEventAt).getTime()) {
      aggregate.lastEventAt = event.occurred_at;
    }
  }

  registerSourcePresence(
    aggregate,
    "Print Station",
    fallbackIso,
    aggregate.printCount > 0
      ? `${aggregate.printCount} prints parsed from statistic.txt`
      : "Statistic file detected",
  );
}

function parseThreegerLogFile(
  file: RecognizedObject,
  lines: string[],
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const patterns = [
    { regex: /no device connected/i, description: "No device connected", severity: "warning" as const },
    { regex: /device lost/i, description: "Device lost", severity: "warning" as const },
  ];

  for (const pattern of patterns) {
    const latestLine = [...lines].reverse().find((line) => pattern.regex.test(line));
    if (!latestLine) continue;

    const occurredAt = extractTimestamp(latestLine, fallbackIso);
    const event = createParsedEvent(
      file,
      occurredAt,
      pattern.severity,
      "warning",
      pattern.description,
      {
        status: "warning",
        device: "Connected Device",
        tags: ["3ger", "connectivity", "device"],
        rawExcerpt: latestLine,
      },
    );
    applyEventToTelemetry(aggregate, event);
  }
}

function parseDebugLogFile(
  file: RecognizedObject,
  lines: string[],
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  for (const line of lines) {
    const occurredAt = extractTimestamp(line, fallbackIso);

    if (/show payment screen/i.test(line)) {
      const amountMatch = line.match(/show payment screen:\s*([0-9.,]+)/i);
      const amountCents = amountMatch ? Math.round((parseFlexibleNumber(amountMatch[1]) ?? 0) * 100) : null;
      aggregate.localSales.attempts += 1;
      applyEventToTelemetry(
        aggregate,
        createParsedEvent(
          file,
          occurredAt,
          "info",
          "payment",
          "Payment flow started",
          {
            amountCents,
            amountKind: amountCents !== null ? "detected" : "unknown",
            purchaseSignal: "payment_attempt",
            status: "pending",
            paymentMethod: "unknown",
            device: "Control PC",
            tags: ["debug", "payment", "attempt"],
            rawExcerpt: line,
          },
        ),
      );
      continue;
    }

    if (/payment cancelled/i.test(line)) {
      aggregate.localSales.cancelled += 1;
      applyEventToTelemetry(
        aggregate,
        createParsedEvent(
          file,
          occurredAt,
          "warning",
          "payment",
          "Payment cancelled",
          {
            amountKind: "unknown",
            purchaseSignal: "cancelled_payment",
            status: "cancelled",
            device: "Control PC",
            tags: ["debug", "payment", "cancel"],
            rawExcerpt: line,
          },
        ),
      );
      continue;
    }

    if (/cancelpayment/i.test(line)) {
      applyEventToTelemetry(
        aggregate,
        createParsedEvent(
          file,
          occurredAt,
          "warning",
          "payment",
          "Cancel payment requested",
          {
            amountKind: "unknown",
            purchaseSignal: "none",
            status: "warning",
            device: "Control PC",
            tags: ["debug", "payment", "cancel"],
            rawExcerpt: line,
          },
        ),
      );
      continue;
    }

    if (/selected cash payment/i.test(line)) {
      applyEventToTelemetry(
        aggregate,
        createParsedEvent(
          file,
          occurredAt,
          "info",
          "cash",
          "Cash payment selected",
          {
            amountKind: "unknown",
            purchaseSignal: "none",
            status: "info",
            paymentMethod: "cash",
            device: "Control PC",
            tags: ["debug", "cash", "payment"],
            rawExcerpt: line,
          },
        ),
      );
      continue;
    }

    if (/coinchangererror/i.test(line) || /coinchangerstatus/i.test(line)) {
      const severity = /error/i.test(line) ? "warning" : "info";
      applyEventToTelemetry(
        aggregate,
        createParsedEvent(
          file,
          occurredAt,
          severity,
          "cash",
          line.replace(/^\[[^\]]+\]\s*-->\s*/i, ""),
          {
            amountKind: "unknown",
            purchaseSignal: "none",
            status: severity === "info" ? "info" : "warning",
            paymentMethod: "coin",
            device: "Coin Changer",
            tags: ["debug", "coin"],
            rawExcerpt: line,
          },
        ),
      );
      continue;
    }
  }

  const lostInternetLine = [...lines].reverse().find((line) => /lost internet connection/i.test(line));
  if (lostInternetLine) {
    const occurredAt = extractTimestamp(lostInternetLine, fallbackIso);
    const event = createParsedEvent(
      file,
      occurredAt,
      "warning",
      "system",
      "Lost internet connection",
      {
        status: "warning",
        amountKind: "unknown",
        purchaseSignal: "none",
        device: "Control PC",
        tags: ["debug", "connectivity", "internet"],
        rawExcerpt: lostInternetLine,
      },
    );
    applyEventToTelemetry(aggregate, event);
  }

  const lastStartLine = [...lines].reverse().find((line) => /startwatchdogprocess/i.test(line));
  if (lastStartLine) {
    const occurredAt = extractTimestamp(lastStartLine, fallbackIso);
    const event = createParsedEvent(
      file,
      occurredAt,
      "info",
      "system",
      "Last program start",
      {
        status: "info",
        amountKind: "unknown",
        purchaseSignal: "none",
        device: "Control PC",
        tags: ["debug", "restart", "watchdog"],
        rawExcerpt: lastStartLine,
      },
    );
    applyEventToTelemetry(aggregate, event);
  }
}

function parseErrorsLogFile(
  file: RecognizedObject,
  lines: string[],
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const latestLine = [...lines].reverse().find((line) => line.length > 0);
  if (!latestLine) return;

  const occurredAt = extractTimestamp(latestLine, fallbackIso);
  const event = createParsedEvent(
    file,
    occurredAt,
    "error",
    "error",
    latestLine,
    {
      status: "failed",
      device: "Application",
      tags: ["errors-log"],
      rawExcerpt: latestLine,
    },
  );
  applyEventToTelemetry(aggregate, event);
}

function parseRawCents(value?: string | null) {
  if (!value) return null;
  const cleaned = value.trim().replace(/[^\d-]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractEuroAmountCentsFromText(value?: string | null) {
  if (!value) return null;
  const match = value.match(/EUR\s+(\d+[.,]\d{2})/i);
  if (!match) return null;
  const parsed = parseFlexibleNumber(match[1]);
  return parsed === null ? null : Math.round(parsed * 100);
}

function parseShortGermanDateTime(dateValue?: string | null, timeValue?: string | null) {
  if (!dateValue || !timeValue) return null;
  const match = dateValue.trim().match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  const year = yy.length === 2 ? `20${yy}` : yy;
  const parsed = new Date(`${year}-${mm}-${dd}T${timeValue.trim()}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseTimestampFromFilename(path: string) {
  const match = path.match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, date, hh, mm, ss] = match;
  const parsed = new Date(`${date}T${hh}:${mm}:${ss}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseKeyValueSections(lines: string[]) {
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = "default";

  for (const line of lines) {
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      if (!sections[currentSection]) sections[currentSection] = {};
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!sections[currentSection]) sections[currentSection] = {};
    sections[currentSection][key] = value;
  }

  return sections;
}

function parseZvtLogFile(
  file: RecognizedObject,
  lines: string[],
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const sections = parseKeyValueSections(lines);
  const toZvt = sections.ToZvt ?? {};
  const fromZvt = sections.FromZvt ?? {};

  const requestedAmountCents = parseRawCents(toZvt.Betrag);
  const detectedAmountCents =
    extractEuroAmountCentsFromText(fromZvt.Drucktext) ??
    extractEuroAmountCentsFromText(fromZvt.Drucktext2) ??
    extractEuroAmountCentsFromText(fromZvt.ErgebnisLang) ??
    parseRawCents(fromZvt.bmp04) ??
    (parseRawCents(fromZvt.Betrag) && parseRawCents(fromZvt.Betrag)! > 0 ? parseRawCents(fromZvt.Betrag) : null) ??
    requestedAmountCents;

  const occurredAt =
    parseShortGermanDateTime(fromZvt.bmp0D, fromZvt.bmp0C) ??
    parseTimestampFromFilename(file.path) ??
    fallbackIso;

  const resultCode = (fromZvt.Ergebnis ?? "").trim();
  const resultSummary = [
    fromZvt.ErgebnisText,
    fromZvt.ErgebnisLang,
    fromZvt.Autorisierungsergebnis,
  ]
    .filter(Boolean)
    .join(" ");
  const lowerSummary = resultSummary.toLowerCase();
  const hasReceiptText = Boolean(fromZvt.Drucktext || fromZvt.Drucktext2);
  const isCancelled = /(abbruch|storno|cancel|aborted)/i.test(lowerSummary);
  const isHardFailure = /(declined|abgelehnt|timeout|fehler|error)/i.test(lowerSummary);
  const hasOperationalWarning = /(f0h|offener kassenschnitt|warn)/i.test(lowerSummary);
  const isConfirmedSuccess =
    resultCode === "0" ||
    /^0+$/.test((fromZvt.Autorisierungsergebnis ?? "").replace(/[^\d]/g, "")) ||
    /(approved|genehmigt|erfolgreich)/i.test(lowerSummary);

  const amountForDisplay = detectedAmountCents;
  const deviceName = fromZvt.TID ? `Payment Terminal ${fromZvt.TID}` : "Payment Terminal";

  if (requestedAmountCents !== null || detectedAmountCents !== null || Object.keys(fromZvt).length > 0) {
    aggregate.localSales.attempts += 1;
  }

  if (isCancelled) {
    aggregate.localSales.cancelled += 1;
    applyEventToTelemetry(
      aggregate,
      createParsedEvent(
        file,
        occurredAt,
        "warning",
        "terminal",
        fromZvt.ErgebnisText || "Terminal payment cancelled",
        {
          amountCents: amountForDisplay,
          amountKind: amountForDisplay === null ? "unknown" : "detected",
          paymentMethod: "terminal",
          purchaseSignal: "cancelled_payment",
          status: "cancelled",
          device: deviceName,
          tags: ["zvt", "terminal", "cancel"],
          rawExcerpt: resultSummary || lines.join(" | "),
        },
      ),
    );
    return;
  }

  if (isConfirmedSuccess && amountForDisplay !== null) {
    aggregate.localSales.success += 1;
    aggregate.localSales.transactionCount += 1;
    aggregate.localSales.confirmedTransactionCount += 1;
    aggregate.localSales.total += amountForDisplay;
    aggregate.localSales.terminal += amountForDisplay;
    aggregate.localSales.terminalTransactions += 1;

    const bucket = ensureDayBucket(aggregate.dayBuckets, occurredAt);
    bucket.transactions += 1;
    bucket.local_cents += amountForDisplay;
    bucket.terminal_cents += amountForDisplay;

    pushMax(
      aggregate.transactions,
      createParsedEvent(
        file,
        occurredAt,
        hasOperationalWarning ? "warning" : "info",
        "sale",
        fromZvt.KartentypLang
          ? `Terminal sale · ${fromZvt.KartentypLang} · ${formatCentsSummary(amountForDisplay)}`
          : `Terminal sale · ${formatCentsSummary(amountForDisplay)}`,
        {
          amountCents: amountForDisplay,
          amountKind: "confirmed",
          paymentMethod: "terminal",
          purchaseSignal: "confirmed_sale",
          status: "completed",
          device: deviceName,
          tags: ["zvt", "terminal", "confirmed-sale"],
          rawExcerpt: resultSummary || lines.join(" | "),
        },
      ),
      80,
    );
    return;
  }

  if (amountForDisplay !== null || hasReceiptText) {
    aggregate.localSales.transactionCount += 1;
    aggregate.localSales.unconfirmedTransactionCount += 1;
    aggregate.localSales.unconfirmedAmountCents += amountForDisplay ?? 0;
    aggregate.localSales.unconfirmedTerminalCents += amountForDisplay ?? 0;
    if (isHardFailure) {
      aggregate.localSales.failed += 1;
    }
    if (amountForDisplay === null) {
      aggregate.localSales.unknownAmountTransactionCount += 1;
    }

    const bucket = ensureDayBucket(aggregate.dayBuckets, occurredAt);
    bucket.transactions += 1;

    pushMax(
      aggregate.transactions,
      createParsedEvent(
        file,
        occurredAt,
        hasOperationalWarning ? "warning" : isHardFailure ? "error" : "warning",
        "sale",
        fromZvt.ErgebnisText || "Terminal sale detected but not confirmed",
        {
          amountCents: amountForDisplay,
          amountKind: amountForDisplay === null ? "unknown" : "detected",
          paymentMethod: "terminal",
          purchaseSignal: "unconfirmed_sale",
          status: hasOperationalWarning ? "warning" : isHardFailure ? "failed" : "warning",
          device: deviceName,
          tags: ["zvt", "terminal", "unconfirmed-sale"],
          rawExcerpt: resultSummary || lines.join(" | "),
        },
      ),
      80,
    );
    return;
  }

  if (isHardFailure) {
    aggregate.localSales.failed += 1;
    applyEventToTelemetry(
      aggregate,
      createParsedEvent(
        file,
        occurredAt,
        "error",
        "terminal",
        fromZvt.ErgebnisText || "Terminal payment failed",
        {
          amountCents: requestedAmountCents,
          amountKind: requestedAmountCents === null ? "unknown" : "detected",
          paymentMethod: "terminal",
          purchaseSignal: "none",
          status: "failed",
          device: deviceName,
          tags: ["zvt", "terminal", "failed"],
          rawExcerpt: resultSummary || lines.join(" | "),
        },
      ),
    );
    return;
  }

  registerSourcePresence(
    aggregate,
    deviceName,
    occurredAt,
    fromZvt.ErgebnisText || "ZVT terminal transaction detected",
  );
}

function createAccumulator(nowIso: string) {
  return {
    events: [] as ParsedEvent[],
    errors: [] as ParsedEvent[],
    transactions: [] as ParsedEvent[],
    activity: [] as ParsedEvent[],
    services: new Map<
      string,
      { status: "operational" | "degraded" | "down"; detail?: string; last_seen_at?: string | null }
    >(),
    devices: new Map<
      string,
      { status: "operational" | "degraded" | "down"; detail?: string; last_seen_at?: string | null }
    >(),
    dayBuckets: new Map<
      string,
      {
        local_cents: number;
        cash_cents: number;
        terminal_cents: number;
        transactions: number;
        cancels: number;
      }
    >(),
    localSales: {
      total: 0,
      cash: 0,
      terminal: 0,
      transactionCount: 0,
      confirmedTransactionCount: 0,
      unconfirmedTransactionCount: 0,
      unknownAmountTransactionCount: 0,
      unconfirmedAmountCents: 0,
      unconfirmedTerminalCents: 0,
      cashTransactions: 0,
      terminalTransactions: 0,
      attempts: 0,
      success: 0,
      failed: 0,
      cancelled: 0,
    },
    paperRemaining: null as number | null,
    printCount: 0,
    errorCounterHints: 0,
    warningCounterHints: 0,
    lastEventAt: nowIso,
    lastDataAt: nowIso,
  };
}

function updateStatus(
  current: { status: "operational" | "degraded" | "down"; detail?: string; last_seen_at?: string | null } | undefined,
  next: { status: "operational" | "degraded" | "down"; detail?: string; last_seen_at?: string | null },
) {
  if (!current) return next;
  const priority = { operational: 1, degraded: 2, down: 3 };
  if (priority[next.status] > priority[current.status]) return next;
  if (priority[next.status] === priority[current.status] && next.detail && !current.detail) return next;
  return {
    ...current,
    last_seen_at: current.last_seen_at ?? next.last_seen_at ?? null,
  };
}

function ensureDayBucket(
  buckets: ReturnType<typeof createAccumulator>["dayBuckets"],
  iso: string,
) {
  const key = iso.slice(0, 10);
  const existing =
    buckets.get(key) ??
    {
      local_cents: 0,
      cash_cents: 0,
      terminal_cents: 0,
      transactions: 0,
      cancels: 0,
    };
  buckets.set(key, existing);
  return existing;
}

function parseFileContent(
  file: RecognizedObject,
  content: string,
  fallbackIso: string,
  aggregate: ReturnType<typeof createAccumulator>,
) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => trimLine(line))
    .filter(Boolean)
    .slice(-MAX_LINES_PER_FILE);

  if (file.kind === "statistic") {
    parseStatisticFile(file, lines, fallbackIso, aggregate);
    return;
  }

  if (file.kind === "threeger_log") {
    parseThreegerLogFile(file, lines, fallbackIso, aggregate);
    return;
  }

  if (file.kind === "debug_log") {
    parseDebugLogFile(file, lines, fallbackIso, aggregate);
    return;
  }

  if (file.kind === "errors_log") {
    parseErrorsLogFile(file, lines, fallbackIso, aggregate);
    return;
  }

  if (file.kind === "zvt_log") {
    parseZvtLogFile(file, lines, fallbackIso, aggregate);
    return;
  }

  if (file.kind === "coin_log") {
    registerSourcePresence(aggregate, "Cash / Coin", fallbackIso, "Coin changer log detected");
    return;
  }
}

function finalizeAggregate(
  aggregate: ReturnType<typeof createAccumulator>,
  matchedFiles: RecognizedObject[],
  allObjects: StorageObject[],
  sourceBucket: string,
  sourcePrefix: string,
  fingerprint: string,
): ParsedAggregate {
  const latestObjectAt = allObjects
    .map((item) => parseIsoOrNull(item.updated_at ?? item.created_at))
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const errorCount = aggregate.errors.filter((item) => item.severity === "error").length;
  const criticalCount = aggregate.errors.filter((item) => item.severity === "critical").length;
  const warningCount = aggregate.errors.filter((item) => item.severity === "warning").length;

  const successRate =
    aggregate.localSales.attempts > 0
      ? (aggregate.localSales.success / aggregate.localSales.attempts) * 100
      : null;
  const cancelRate =
    aggregate.localSales.attempts > 0
      ? (aggregate.localSales.cancelled / aggregate.localSales.attempts) * 100
      : null;

  const uploadStatus = !latestObjectAt
    ? "down"
    : Date.now() - new Date(latestObjectAt).getTime() > 12 * 60 * 60 * 1000
      ? "down"
      : Date.now() - new Date(latestObjectAt).getTime() > 2 * 60 * 60 * 1000
        ? "degraded"
        : "operational";

  aggregate.services.set(
    "Data Upload",
    updateStatus(aggregate.services.get("Data Upload"), {
      status: uploadStatus,
      detail: latestObjectAt ? `Last data received ${latestObjectAt}` : "No files found",
      last_seen_at: latestObjectAt,
    }),
  );

  if (!aggregate.services.has("Printer") && aggregate.printCount > 0) {
    aggregate.services.set("Printer", {
      status: aggregate.paperRemaining !== null && aggregate.paperRemaining <= 10 ? "degraded" : "operational",
      detail:
        aggregate.paperRemaining !== null
          ? `Paper remaining: ${aggregate.paperRemaining}`
          : `Print count: ${aggregate.printCount}`,
      last_seen_at: aggregate.lastEventAt,
    });
  }

  const services = Array.from(aggregate.services.entries()).map(([name, value]) => ({
    name,
    ...value,
  }));

  const devices = Array.from(aggregate.devices.entries()).map(([name, value]) => ({
    name,
    ...value,
  }));

  const communicationStatus = services.some((service) => service.status === "down")
    ? "down"
    : services.some((service) => service.status === "degraded")
      ? "degraded"
      : uploadStatus;

  const daily = Array.from(aggregate.dayBuckets.entries())
    .map(([date, stats]) => ({
      date,
      ...stats,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const featureFlags = {
    local_sales:
      matchedFiles.some((item) => item.kind === "statistic") ||
      matchedFiles.some((item) => item.kind === "zvt_log") ||
      aggregate.localSales.transactionCount > 0 ||
      aggregate.printCount > 0 ||
      aggregate.localSales.attempts > 0,
    operations: matchedFiles.length > 0 || allObjects.length > 0,
    errors:
      aggregate.errors.length > 0 ||
      aggregate.errorCounterHints > 0 ||
      matchedFiles.some((item) =>
        item.kind === "errors_log" || item.kind === "debug_log" || item.kind === "threeger_log"
      ),
    health: true,
    printer:
      aggregate.paperRemaining !== null ||
      aggregate.printCount > 0 ||
      matchedFiles.some((item) => item.kind === "statistic") ||
      aggregate.activity.some((event) => event.category === "printer"),
    cash:
      aggregate.localSales.cashTransactions > 0 ||
      aggregate.activity.some((event) => event.payment_method === "cash" || event.payment_method === "coin") ||
      matchedFiles.some((item) => item.kind === "coin_log"),
    terminal:
      aggregate.localSales.terminalTransactions > 0 ||
      aggregate.activity.some((event) => event.category === "terminal") ||
      matchedFiles.some((item) => item.kind === "zvt_log"),
  };

  const summary = {
    local_sales_cents: aggregate.localSales.total,
    local_transaction_count: aggregate.localSales.transactionCount,
    local_confirmed_transaction_count: aggregate.localSales.confirmedTransactionCount,
    local_unconfirmed_transaction_count: aggregate.localSales.unconfirmedTransactionCount,
    local_unknown_amount_transaction_count: aggregate.localSales.unknownAmountTransactionCount,
    local_unconfirmed_amount_cents: aggregate.localSales.unconfirmedAmountCents,
    local_unconfirmed_terminal_cents: aggregate.localSales.unconfirmedTerminalCents,
    cash_sales_cents: aggregate.localSales.cash,
    terminal_sales_cents: aggregate.localSales.terminal,
    cash_transaction_count: aggregate.localSales.cashTransactions,
    terminal_transaction_count: aggregate.localSales.terminalTransactions,
    payment_attempt_count: aggregate.localSales.attempts,
    payment_success_count: aggregate.localSales.success,
    payment_failed_count: aggregate.localSales.failed,
    payment_cancelled_count: aggregate.localSales.cancelled,
    error_count: Math.max(errorCount + criticalCount, aggregate.errorCounterHints),
    warning_count: Math.max(warningCount, aggregate.warningCounterHints),
    critical_count: criticalCount,
    printer_paper_remaining: aggregate.paperRemaining,
    print_count: aggregate.printCount,
    last_activity_at: aggregate.lastEventAt ?? latestObjectAt,
    last_data_at: latestObjectAt,
    success_rate: successRate,
    cancel_rate: cancelRate,
  };

  const sales = {
    daily,
    recent_transactions: aggregate.transactions
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 40),
    channels: {
      local_cents: aggregate.localSales.total,
      cash_cents: aggregate.localSales.cash,
      terminal_cents: aggregate.localSales.terminal,
      total_transactions: aggregate.localSales.transactionCount,
      unconfirmed_cents: aggregate.localSales.unconfirmedAmountCents,
      unconfirmed_transactions: aggregate.localSales.unconfirmedTransactionCount,
      unknown_amount_transactions: aggregate.localSales.unknownAmountTransactionCount,
      cash_transactions: aggregate.localSales.cashTransactions,
      terminal_transactions: aggregate.localSales.terminalTransactions,
    },
  };

  const health = {
    communication_status: communicationStatus,
    services,
    events: aggregate.errors
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 40),
    devices,
    last_activity_at: aggregate.lastEventAt ?? latestObjectAt,
    last_data_at: latestObjectAt,
    printer: {
      paper_remaining: aggregate.paperRemaining,
      print_count: aggregate.printCount,
    },
  };

  const operations = {
    activity: aggregate.activity
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 50),
    devices,
    printer: {
      paper_remaining: aggregate.paperRemaining,
      print_count: aggregate.printCount,
    },
    payments: {
      attempts: aggregate.localSales.attempts,
      succeeded: aggregate.localSales.success,
      failed: aggregate.localSales.failed,
      cancelled: aggregate.localSales.cancelled,
      unconfirmed_sales: aggregate.localSales.unconfirmedTransactionCount,
      unknown_amounts: aggregate.localSales.unknownAmountTransactionCount,
      detected_but_unconfirmed_cents: aggregate.localSales.unconfirmedAmountCents,
      success_rate: successRate,
      cancel_rate: cancelRate,
    },
    cash: {
      events: aggregate.localSales.cashTransactions,
      amount_cents: aggregate.localSales.cash,
    },
    terminal: {
      events: aggregate.localSales.terminalTransactions,
      amount_cents: aggregate.localSales.terminal,
    },
  };

  const sources = {
    files_scanned: allObjects.length,
    recognized_files: matchedFiles.length,
    latest_object_at: latestObjectAt,
    fingerprint,
    bucket: sourceBucket,
    prefix: sourcePrefix,
    matched_files: matchedFiles.slice(0, 20).map((item) => ({
      path: item.path,
      kind: item.kind,
      updated_at: item.updated_at,
      size: item.size,
    })),
  };

  return {
    feature_flags: featureFlags,
    summary,
    sales,
    health,
    errors: aggregate.errors
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 120),
    operations,
    sources,
  };
}

function statusPriority(status: string | null | undefined) {
  if (status === "down") return 3;
  if (status === "degraded") return 2;
  if (status === "operational") return 1;
  return 0;
}

function mergeService(
  services: Array<{ name: string; status: string; detail?: string | null; last_seen_at?: string | null }>,
  next: { name: string; status: string; detail?: string | null; last_seen_at?: string | null },
) {
  const existing = services.find((item) => item.name === next.name);
  if (!existing) {
    services.push(next);
    return;
  }
  if (statusPriority(next.status) > statusPriority(existing.status)) {
    Object.assign(existing, next);
    return;
  }
  if (!existing.detail && next.detail) existing.detail = next.detail;
  if (!existing.last_seen_at && next.last_seen_at) existing.last_seen_at = next.last_seen_at;
}

function normalizeAgentEvent(raw: JsonRecord, fallbackAt: string | null, fallbackMachine: string): ParsedEvent {
  const severity = typeof raw.severity === "string" && ["info", "warning", "error", "critical"].includes(raw.severity)
    ? raw.severity as ParsedEvent["severity"]
    : "info";
  const category = typeof raw.category === "string" && [
    "sale",
    "payment",
    "terminal",
    "cash",
    "printer",
    "system",
    "error",
    "warning",
    "photo",
    "log",
  ].includes(raw.category)
    ? raw.category as ParsedEvent["category"]
    : "system";
  const status = typeof raw.status === "string" && [
    "completed",
    "failed",
    "cancelled",
    "warning",
    "info",
    "unknown",
    "pending",
  ].includes(raw.status)
    ? raw.status as ParsedEvent["status"]
    : severity === "info" ? "info" : severity === "warning" ? "warning" : "failed";

  return {
    id: typeof raw.id === "string" ? raw.id : `agent-${fallbackMachine}-${crypto.randomUUID()}`,
    occurred_at: safeDate(typeof raw.occurred_at === "string" ? raw.occurred_at : null, fallbackAt),
    severity,
    category,
    payment_method:
      typeof raw.payment_method === "string" && ["cash", "coin", "terminal", "card", "unknown"].includes(raw.payment_method)
        ? raw.payment_method as ParsedEvent["payment_method"]
        : null,
    status,
    amount_cents: typeof raw.amount_cents === "number" ? raw.amount_cents : null,
    amount_kind:
      typeof raw.amount_kind === "string" && ["confirmed", "detected", "unknown"].includes(raw.amount_kind)
        ? raw.amount_kind as ParsedEvent["amount_kind"]
        : "unknown",
    purchase_signal: "none",
    description: String(raw.description ?? "Liftpic agent status").slice(0, 240),
    source_file: String(raw.source_file ?? "liftpic-agent"),
    raw_excerpt: String(raw.raw_excerpt ?? raw.description ?? "").slice(0, 400),
    device: typeof raw.device === "string" ? raw.device : null,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 8) : ["liftpic-agent"],
  };
}

function mergeMachineStatuses(parsed: ParsedAggregate, rows: MachineStatusRow[]): ParsedAggregate {
  if (rows.length === 0) return parsed;

  const featureFlags = { ...(parsed.feature_flags as JsonRecord) };
  const summary = { ...(parsed.summary as JsonRecord) };
  const health = { ...(parsed.health as JsonRecord) };
  const operations = { ...(parsed.operations as JsonRecord) };
  const sources = { ...(parsed.sources as JsonRecord) };

  const services = Array.isArray(health.services) ? [...(health.services as any[])] : [];
  const devices = Array.isArray(health.devices) ? [...(health.devices as any[])] : [];
  const healthEvents = Array.isArray(health.events) ? [...(health.events as ParsedEvent[])] : [];
  const operationDevices = Array.isArray((operations as any).devices) ? [...(operations as any).devices] : [];
  const operationActivity = Array.isArray((operations as any).activity) ? [...(operations as any).activity] : [];
  const errors = [...parsed.errors];

  const now = Date.now();
  let latestAgentSeen: string | null = null;
  let agentFiles = 0;

  for (const row of rows) {
    const payload = (row.payload ?? {}) as JsonRecord;
    const lastSeen = parseIsoOrNull(row.last_seen_at) ?? parseIsoOrNull(String(payload.last_seen_at ?? "")) ?? null;
    if (lastSeen && (!latestAgentSeen || latestAgentSeen < lastSeen)) latestAgentSeen = lastSeen;
    const ageMs = lastSeen ? now - new Date(lastSeen).getTime() : Number.POSITIVE_INFINITY;
    const agentStatus = ageMs <= 2 * 60 * 1000 ? "operational" : ageMs <= 10 * 60 * 1000 ? "degraded" : "down";
    const agentName = `Liftpic Sync ${row.camera_code || payload.camera_code || row.machine_id}`;

    mergeService(services, {
      name: "Liftpic Sync",
      status: agentStatus,
      detail:
        agentStatus === "operational"
          ? `${row.machine_id} online, queue ${row.queue_count ?? 0}`
          : `${row.machine_id} last seen ${lastSeen ?? "never"}`,
      last_seen_at: lastSeen,
    });
    mergeService(devices, {
      name: agentName,
      status: agentStatus,
      detail: `Queue ${row.queue_count ?? 0}, disk ${row.disk_free_mb ?? "-"} MB`,
      last_seen_at: lastSeen,
    });
    mergeService(operationDevices, {
      name: agentName,
      status: agentStatus,
      detail: `Queue ${row.queue_count ?? 0}, disk ${row.disk_free_mb ?? "-"} MB`,
      last_seen_at: lastSeen,
    });

    const operationalDevices = Array.isArray(payload.operational_devices) ? payload.operational_devices as JsonRecord[] : [];
    for (const device of operationalDevices) {
      const name = String(device.name ?? "Machine device");
      const status = String(device.status ?? "operational");
      const detail = String(device.detail ?? "");
      const last_seen_at = typeof device.last_seen_at === "string" ? device.last_seen_at : lastSeen;
      const service = { name, status, detail, last_seen_at };
      mergeService(services, service);
      mergeService(devices, service);
      mergeService(operationDevices, service);
      const kind = String(device.kind ?? "");
      if (kind === "cash") featureFlags.cash = true;
      if (kind === "terminal") featureFlags.terminal = true;
      if (kind === "printer") featureFlags.printer = true;
      featureFlags.operations = true;
      featureFlags.health = true;
    }

    const operationalEvents = Array.isArray(payload.operational_events) ? payload.operational_events as JsonRecord[] : [];
    for (const rawEvent of operationalEvents) {
      const event = normalizeAgentEvent(rawEvent, lastSeen, row.machine_id);
      healthEvents.push(event);
      operationActivity.push(event);
      if (event.severity !== "info") errors.push(event);
    }

    if (row.paper_remaining !== null && row.paper_remaining !== undefined) {
      summary.printer_paper_remaining = row.paper_remaining;
      featureFlags.printer = true;
      health.printer = {
        ...(typeof health.printer === "object" && health.printer ? health.printer as JsonRecord : {}),
        paper_remaining: row.paper_remaining,
      };
      operations.printer = {
        ...(typeof operations.printer === "object" && operations.printer ? operations.printer as JsonRecord : {}),
        paper_remaining: row.paper_remaining,
      };
    }

    const num = (a: unknown, b: unknown): number | null =>
      typeof a === "number" ? a : typeof b === "number" ? b : null;
    const takenToday = num(row.photos_taken_today, payload.photos_taken_today);
    const soldToday = num(row.photos_sold_today, payload.photos_sold_today);
    const convToday = num(row.photo_conversion_today, payload.photo_conversion_today);
    if (takenToday !== null) summary.photos_taken_today = takenToday;
    if (soldToday !== null) summary.photos_sold_today = soldToday;
    if (convToday !== null) summary.photo_conversion_today = convToday;

    // Lifetime totals from the Liftpic Sync heartbeat (Gesamtfahrten etc.).
    if (typeof payload.rides_total === "number") summary.rides_total = payload.rides_total;
    if (typeof payload.photos_sold_total === "number") summary.photos_sold_total = payload.photos_sold_total;
    if (typeof payload.photo_conversion_total === "number") summary.photo_conversion_total = payload.photo_conversion_total;
    if (typeof payload.paper_printed === "number") summary.printer_paper_printed = payload.paper_printed;
    if (typeof payload.paper_capacity === "number") summary.printer_paper_capacity = payload.paper_capacity;
    agentFiles += 1;
  }

  const orderedServices = services.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const communicationStatus = orderedServices.some((service) => service.status === "down")
    ? "down"
    : orderedServices.some((service) => service.status === "degraded")
      ? "degraded"
      : "operational";

  health.services = orderedServices;
  health.devices = devices.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  health.events = healthEvents
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 60);
  health.communication_status = communicationStatus;
  health.last_data_at = latestIso([health.last_data_at as string | null, latestAgentSeen]);
  health.last_activity_at = latestIso([health.last_activity_at as string | null, latestAgentSeen]);

  operations.devices = operationDevices.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  operations.activity = operationActivity
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    .slice(0, 80);

  summary.last_data_at = latestIso([summary.last_data_at as string | null, latestAgentSeen]);
  summary.last_activity_at = latestIso([summary.last_activity_at as string | null, latestAgentSeen]);
  summary.error_count = Math.max(Number(summary.error_count ?? 0), errors.filter((event) => event.severity === "error").length);
  summary.warning_count = Math.max(Number(summary.warning_count ?? 0), errors.filter((event) => event.severity === "warning").length);
  summary.critical_count = Math.max(Number(summary.critical_count ?? 0), errors.filter((event) => event.severity === "critical").length);

  sources.files_scanned = Number(sources.files_scanned ?? 0) + agentFiles;
  sources.recognized_files = Number(sources.recognized_files ?? 0) + agentFiles;
  sources.latest_object_at = latestIso([sources.latest_object_at as string | null, latestAgentSeen]);
  sources.matched_files = [
    ...(Array.isArray(sources.matched_files) ? (sources.matched_files as any[]) : []),
    ...rows.map((row) => ({
      path: `machine_status:${row.machine_id}:${row.camera_code ?? "default"}`,
      kind: "liftpic_agent",
      updated_at: row.last_seen_at,
      size: JSON.stringify(row.payload ?? {}).length,
    })),
  ].slice(0, 30);

  return {
    ...parsed,
    feature_flags: featureFlags,
    summary,
    health,
    errors: errors
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 160),
    operations,
    sources,
  };
}

function applyMode<T>(mode: "auto" | "enabled" | "disabled", fallback: T, enabledValue: T, disabledValue: T) {
  if (mode === "enabled") return enabledValue;
  if (mode === "disabled") return disabledValue;
  return fallback;
}

async function upsertSnapshot(
  parkId: string,
  sourceKind: "external_storage" | "dashboard_storage",
  sourceBucket: string,
  sourcePrefix: string,
  payload: ParsedAggregate,
) {
  const writeHeaders = buildDashboardWriteHeaders();
  if (!DASHBOARD_SUPABASE_URL || !writeHeaders) return;

  await fetch(`${DASHBOARD_SUPABASE_URL}/rest/v1/park_operations_snapshots?on_conflict=park_id`, {
    method: "POST",
    headers: writeHeaders,
    body: JSON.stringify({
      park_id: parkId,
      source_kind: sourceKind,
      source_bucket: sourceBucket,
      source_prefix: sourcePrefix,
      latest_object_at: payload.sources.latest_object_at ?? null,
      latest_event_at: payload.summary.last_activity_at ?? null,
      fingerprint: payload.sources.fingerprint ?? null,
      features: payload.feature_flags,
      summary: payload.summary,
      sales: payload.sales,
      health: payload.health,
      errors: payload.errors,
      operations: payload.operations,
      sources: payload.sources,
      refreshed_at: new Date().toISOString(),
    }),
  });
}

async function getStripeAutoEnabled(
  organizationId: string,
  userAuthHeader: string | null,
) {
  try {
    const rows = await fetchDashboardRows<Array<{ price_id: string }>>(
      `/rest/v1/stripe_product_selections?select=price_id&organization_id=eq.${organizationId}&limit=1`,
      userAuthHeader,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

function sanitizePrefixCandidates(park: ParkRow, settings: ParkFeatureSettings | null) {
  if (settings?.operations_prefix && settings.operations_prefix.trim()) {
    return [ensureTrailingSlash(settings.operations_prefix.trim().replace(/^\/+/, ""))];
  }

  const normalizedName = normalizePathSegment(park.name);
  return uniq(
    [
      ensureTrailingSlash(park.id),
      ensureTrailingSlash(park.slug),
      normalizedName ? ensureTrailingSlash(normalizedName) : "",
      "",
    ].filter((value) => value !== null),
  );
}

async function buildPayload(
  req: Request,
  parkId: string,
  forceRefresh = false,
) {
  const userAuthHeader = req.headers.get("Authorization");

  const localParks = await fetchDashboardRows<ParkRow[]>(
    `/rest/v1/parks?select=id,slug,name,organization_id&id=eq.${parkId}&limit=1`,
    userAuthHeader,
  ).catch(() => []);
  const externalParks = localParks.length > 0
    ? []
    : await fetchExternalRows<Array<{ id: string; slug: string; name: string }>>(
      `parks?select=id,slug,name&id=eq.${parkId}&limit=1`,
    )
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          organization_id: null,
        }))
      )
      .catch(() => []);

  if (localParks.length === 0 && externalParks.length === 0) {
    throw new Error("Park not found or not accessible.");
  }

  const park = localParks[0] ?? externalParks[0];
  const hasLocalDashboardPark = localParks.length > 0;
  const settingsRows = hasLocalDashboardPark
    ? await fetchDashboardRows<ParkFeatureSettings[]>(
      `/rest/v1/park_feature_settings?select=*&park_id=eq.${parkId}&limit=1`,
      userAuthHeader,
    ).catch(() => [])
    : [];
  const settings = settingsRows[0] ?? null;

  const snapshotRows = hasLocalDashboardPark
    ? await fetchDashboardRows<any[]>(
      `/rest/v1/park_operations_snapshots?select=*&park_id=eq.${parkId}&limit=1`,
      userAuthHeader,
    ).catch(() => [])
    : [];
  const snapshot = snapshotRows[0] ?? null;

  const stripeAutoEnabled = hasLocalDashboardPark
    ? await getStripeAutoEnabled(park.organization_id, userAuthHeader)
    : false;
  const sourceKind = settings?.operations_source ?? "external_storage";
  const sourceBucket = settings?.operations_bucket ?? DEFAULT_OPERATIONS_BUCKET;
  const prefixCandidates = sanitizePrefixCandidates(park, settings);

  const discovered = await findRelevantObjects(
    sourceKind,
    sourceBucket,
    prefixCandidates,
    userAuthHeader,
  );

  const fingerprintInput = JSON.stringify(
    discovered.recognized_objects.map((item) => ({
      path: item.path,
      updated_at: item.updated_at,
      size: item.size,
      kind: item.kind,
    })),
  );
  const fingerprint = await sha256Hex(fingerprintInput);

  let parsed = createEmptyAggregate(
    discovered.all_objects
      .map((item) => parseIsoOrNull(item.updated_at ?? item.created_at))
      .filter(Boolean)
      .sort()
      .pop() ?? null,
  );

  if (!forceRefresh && snapshot?.fingerprint === fingerprint) {
    parsed = {
      feature_flags: (snapshot.features as JsonRecord) ?? {},
      summary: (snapshot.summary as JsonRecord) ?? {},
      sales: (snapshot.sales as JsonRecord) ?? {},
      health: (snapshot.health as JsonRecord) ?? {},
      errors: (snapshot.errors as ParsedEvent[]) ?? [],
      operations: (snapshot.operations as JsonRecord) ?? {},
      sources: (snapshot.sources as JsonRecord) ?? {},
    };
  } else if (discovered.recognized_objects.length > 0) {
    const accumulator = createAccumulator(new Date().toISOString());

    for (const object of discovered.recognized_objects) {
      try {
        const buffer = await downloadStorageObject(
          discovered.baseUrl,
          discovered.headers,
          sourceBucket,
          object.path,
        );
        const content = decodeContent(buffer);
        parseFileContent(
          object,
          content,
          object.updated_at ?? new Date().toISOString(),
          accumulator,
        );
      } catch (error) {
        accumulator.errors.push({
          id: crypto.randomUUID(),
          occurred_at: object.updated_at ?? new Date().toISOString(),
          severity: "warning",
          category: "error",
          payment_method: null,
          status: "warning",
          amount_cents: null,
          description: `Failed to parse ${object.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          source_file: object.path,
          raw_excerpt: "",
          device: null,
          tags: ["parse"],
        });
      }
    }

    parsed = finalizeAggregate(
      accumulator,
      discovered.recognized_objects,
      discovered.all_objects,
      sourceBucket,
      discovered.prefix,
      fingerprint,
    );
  }

  // machine_status is written by the Liftpic Sync agent's heartbeat (via the
  // liftpic-status function on the shared project) - it lives on the shared
  // LiftPictures project, not this dashboard's own project, so this must go
  // through fetchExternalRows, not fetchDashboardServiceRows.
  const machineStatuses = await fetchExternalRows<MachineStatusRow[]>(
    `machine_status?select=*&park_id=eq.${parkId}&order=last_seen_at.desc&limit=20`,
    true,
  ).catch((error) => {
    console.warn("Failed to load machine_status rows", error);
    return [] as MachineStatusRow[];
  });
  parsed = mergeMachineStatuses(parsed, machineStatuses);

  const resolvedFeatures = {
    stripe: applyMode(
      settings?.stripe_mode ?? "auto",
      stripeAutoEnabled,
      true,
      false,
    ),
    local_sales: applyMode(
      settings?.local_sales_mode ?? "auto",
      Boolean(parsed.feature_flags.local_sales),
      true,
      false,
    ),
    operations: applyMode(
      settings?.operations_mode ?? "auto",
      Boolean(parsed.feature_flags.operations),
      true,
      false,
    ),
    health: applyMode(
      settings?.health_mode ?? "auto",
      true,
      true,
      false,
    ),
    errors: applyMode(
      settings?.errors_mode ?? "auto",
      Boolean(parsed.feature_flags.errors),
      true,
      false,
    ),
    printer: Boolean(parsed.feature_flags.printer),
    cash: Boolean(parsed.feature_flags.cash),
    terminal: Boolean(parsed.feature_flags.terminal),
    source_kind: sourceKind,
    source_bucket: sourceBucket,
    source_prefix: discovered.prefix,
  };

  const payload = {
    park_id: park.id,
    park_name: park.name,
    features: resolvedFeatures,
    summary: parsed.summary,
    sales: parsed.sales,
    health: parsed.health,
    errors: parsed.errors,
    operations: parsed.operations,
    sources: parsed.sources,
    refreshed_at: new Date().toISOString(),
  };

  if (hasLocalDashboardPark && (!forceRefresh || discovered.recognized_objects.length > 0)) {
    await upsertSnapshot(
      parkId,
      sourceKind,
      sourceBucket,
      discovered.prefix,
      {
        ...parsed,
        feature_flags: resolvedFeatures,
        sources: {
          ...(parsed.sources as JsonRecord),
          bucket: sourceBucket,
          prefix: discovered.prefix,
          fingerprint,
        },
      },
    ).catch((error) => {
      console.warn("Failed to update park_operations_snapshots", error);
    });
  }

  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("Method not allowed. Use GET.", 405);
  }

  try {
    const url = new URL(req.url);
    const parkId = url.searchParams.get("park_id")?.trim();
    const forceRefresh = url.searchParams.get("refresh") === "true";

    if (!parkId) {
      return errorResponse("park_id is required.", 400);
    }

    if (!DASHBOARD_SUPABASE_URL) {
      return errorResponse("Dashboard Supabase URL is not configured.", 500);
    }

    const payload = await buildPayload(req, parkId, forceRefresh);
    return jsonResponse(payload);
  } catch (error) {
    return errorResponse(
      "Failed to build park dashboard data",
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
});
