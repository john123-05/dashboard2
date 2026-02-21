import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Sync-Secret",
};

const SOURCE_SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("SOURCE_SUPABASE_URL");
const SOURCE_SUPABASE_SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SOURCE_SUPABASE_SERVICE_KEY");

const TARGET_SUPABASE_URL =
  Deno.env.get("TARGET_SUPABASE_URL") ??
  Deno.env.get("APP_SUPABASE_URL") ??
  Deno.env.get("EXTERNAL_SUPABASE_URL");
const TARGET_SUPABASE_SERVICE_KEY =
  Deno.env.get("TARGET_SUPABASE_SERVICE_KEY") ??
  Deno.env.get("APP_SUPABASE_SERVICE_KEY") ??
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_KEY");
const SYNC_SHARED_SECRET = Deno.env.get("SUPPORT_SYNC_SHARED_SECRET");
const TARGET_ORGANIZATION_ID = Deno.env.get("TARGET_ORGANIZATION_ID");
const TARGET_TICKET_CREATED_BY = Deno.env.get("TARGET_TICKET_CREATED_BY");
const TARGET_MESSAGE_AUTHOR_ID =
  Deno.env.get("TARGET_MESSAGE_AUTHOR_ID") ?? TARGET_TICKET_CREATED_BY;

type QueueRow = {
  id: number;
  source_table: "support_tickets" | "support_ticket_messages";
  entity_type: "ticket" | "message";
  entity_id: string;
  event_type: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  attempt_count: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv() {
  if (!SOURCE_SUPABASE_URL || !SOURCE_SUPABASE_SERVICE_KEY) {
    return jsonResponse(
      {
        error:
          "Source Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SOURCE_* variants).",
      },
      500,
    );
  }
  if (!TARGET_SUPABASE_URL || !TARGET_SUPABASE_SERVICE_KEY) {
    return jsonResponse(
      {
        error:
          "Target Supabase credentials not configured. Set TARGET_SUPABASE_URL and TARGET_SUPABASE_SERVICE_KEY (or APP_SUPABASE_URL and APP_SUPABASE_SERVICE_KEY).",
      },
      500,
    );
  }
  return null;
}

async function fetchQueue(limit: number): Promise<QueueRow[]> {
  const nowIso = encodeURIComponent(new Date().toISOString());
  const path =
    `/rest/v1/support_sync_queue` +
    `?select=id,source_table,entity_type,entity_id,event_type,payload,attempt_count` +
    `&status=in.(pending,failed)` +
    `&next_attempt_at=lte.${nowIso}` +
    `&order=created_at.asc` +
    `&limit=${limit}`;

  const res = await fetch(`${SOURCE_SUPABASE_URL}${path}`, {
    headers: {
      apikey: SOURCE_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${SOURCE_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to fetch queue (${res.status}): ${details}`);
  }

  return (await res.json()) as QueueRow[];
}

async function markSynced(row: QueueRow) {
  const path = `/rest/v1/support_sync_queue?id=eq.${row.id}`;
  const res = await fetch(`${SOURCE_SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      apikey: SOURCE_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${SOURCE_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "synced",
      attempt_count: row.attempt_count + 1,
      synced_at: new Date().toISOString(),
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to mark queue row ${row.id} as synced (${res.status}): ${details}`);
  }
}

async function markFailed(row: QueueRow, message: string) {
  const nextAttemptSeconds = Math.min(3600, 5 * (2 ** row.attempt_count));
  const nextAttemptAt = new Date(Date.now() + nextAttemptSeconds * 1000).toISOString();
  const path = `/rest/v1/support_sync_queue?id=eq.${row.id}`;

  const res = await fetch(`${SOURCE_SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      apikey: SOURCE_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${SOURCE_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: "failed",
      attempt_count: row.attempt_count + 1,
      next_attempt_at: nextAttemptAt,
      last_error: message.slice(0, 2000),
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to mark queue row ${row.id} as failed (${res.status}): ${details}`);
  }
}

function buildTargetPayload(row: QueueRow): Record<string, unknown> {
  const payload = { ...row.payload };

  if (TARGET_ORGANIZATION_ID) {
    payload.organization_id = TARGET_ORGANIZATION_ID;
  }

  if (row.source_table === "support_tickets" && TARGET_TICKET_CREATED_BY) {
    payload.created_by = TARGET_TICKET_CREATED_BY;
  }

  if (row.source_table === "support_ticket_messages" && TARGET_MESSAGE_AUTHOR_ID) {
    payload.author_id = TARGET_MESSAGE_AUTHOR_ID;
  }

  return payload;
}

async function upsertTarget(row: QueueRow) {
  const table = row.source_table;
  if (table !== "support_tickets" && table !== "support_ticket_messages") {
    throw new Error(`Unsupported source_table: ${table}`);
  }
  const path = `/rest/v1/${table}?on_conflict=id`;
  const res = await fetch(`${TARGET_SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: TARGET_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${TARGET_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(buildTargetPayload(row)),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Target upsert failed for ${table}/${row.entity_id} (${res.status}): ${details}`);
  }
}

async function deleteTarget(row: QueueRow) {
  const table = row.source_table;
  if (table !== "support_tickets" && table !== "support_ticket_messages") {
    throw new Error(`Unsupported source_table: ${table}`);
  }

  const path = `/rest/v1/${table}?id=eq.${encodeURIComponent(row.entity_id)}`;
  const res = await fetch(`${TARGET_SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers: {
      apikey: TARGET_SUPABASE_SERVICE_KEY as string,
      Authorization: `Bearer ${TARGET_SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Target delete failed for ${table}/${row.entity_id} (${res.status}): ${details}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const envError = requireEnv();
  if (envError) return envError;

  if (SYNC_SHARED_SECRET) {
    const givenSecret = req.headers.get("X-Sync-Secret");
    if (givenSecret !== SYNC_SHARED_SECRET) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  let limit = 50;
  let dryRun = false;

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.max(1, Math.min(500, Math.floor(body.limit)));
    }
    if (typeof body.dry_run === "boolean") {
      dryRun = body.dry_run;
    }
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    const queue = await fetchQueue(limit);
    if (queue.length === 0) {
      return jsonResponse({
        ok: true,
        processed: 0,
        synced: 0,
        failed: 0,
        message: "No due queue entries.",
      });
    }

    let synced = 0;
    let failed = 0;
    const errors: Array<{ id: number; error: string }> = [];

    for (const row of queue) {
      try {
        if (!dryRun) {
          if (row.event_type === "delete") {
            await deleteTarget(row);
          } else {
            await upsertTarget(row);
          }
          await markSynced(row);
        }
        synced += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ id: row.id, error: message });
        if (!dryRun) {
          try {
            await markFailed(row, message);
          } catch (markError) {
            const markMessage = markError instanceof Error ? markError.message : String(markError);
            errors.push({ id: row.id, error: `Queue status update failed: ${markMessage}` });
          }
        }
      }
    }

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      processed: queue.length,
      synced,
      failed,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
