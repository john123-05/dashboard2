#!/usr/bin/env node

const SOURCE_SUPABASE_URL = process.env.SUPABASE_URL;
const SOURCE_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_SUPABASE_URL = process.env.TARGET_SUPABASE_URL ?? process.env.APP_SUPABASE_URL;
const TARGET_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TARGET_SUPABASE_SERVICE_KEY ?? process.env.APP_SUPABASE_SERVICE_KEY;

const TARGET_ORGANIZATION_ID = process.env.TARGET_ORGANIZATION_ID;
const TARGET_TICKET_CREATED_BY = process.env.TARGET_TICKET_CREATED_BY;
const TARGET_MESSAGE_AUTHOR_ID = process.env.TARGET_MESSAGE_AUTHOR_ID ?? TARGET_TICKET_CREATED_BY;

const PAGE_SIZE = Number.parseInt(process.env.SUPPORT_SYNC_BACKFILL_PAGE_SIZE || "500", 10);

function fail(message) {
  console.error(`[backfill-support-sync] ${message}`);
  process.exit(1);
}

function ensureEnv(name, value) {
  if (!value || !String(value).trim()) fail(`Missing env var: ${name}`);
}

ensureEnv("SUPABASE_URL", SOURCE_SUPABASE_URL);
ensureEnv("SUPABASE_SERVICE_ROLE_KEY", SOURCE_SUPABASE_SERVICE_ROLE_KEY);
ensureEnv("TARGET_SUPABASE_URL", TARGET_SUPABASE_URL);
ensureEnv("TARGET_SUPABASE_SERVICE_KEY", TARGET_SUPABASE_SERVICE_ROLE_KEY);

if (!Number.isFinite(PAGE_SIZE) || PAGE_SIZE <= 0 || PAGE_SIZE > 5000) {
  fail("SUPPORT_SYNC_BACKFILL_PAGE_SIZE must be between 1 and 5000");
}

async function fetchPage(table, from, to) {
  const url = new URL(`/rest/v1/${table}`, SOURCE_SUPABASE_URL);
  url.searchParams.set("select", "*");
  url.searchParams.set("order", "created_at.asc");

  const res = await fetch(url, {
    headers: {
      apikey: SOURCE_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SOURCE_SUPABASE_SERVICE_ROLE_KEY}`,
      Range: `${from}-${to}`,
      Prefer: "count=exact",
    },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to fetch ${table} (${res.status}): ${details}`);
  }

  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function buildTargetPayload(table, record) {
  const payload = { ...record };

  if (TARGET_ORGANIZATION_ID) {
    payload.organization_id = TARGET_ORGANIZATION_ID;
  }

  if (table === "support_tickets" && TARGET_TICKET_CREATED_BY) {
    payload.created_by = TARGET_TICKET_CREATED_BY;
  }

  if (table === "support_ticket_messages" && TARGET_MESSAGE_AUTHOR_ID) {
    payload.author_id = TARGET_MESSAGE_AUTHOR_ID;
  }

  return payload;
}

async function upsertTargetRow(table, record) {
  const url = new URL(`/rest/v1/${table}`, TARGET_SUPABASE_URL);
  url.searchParams.set("on_conflict", "id");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: TARGET_SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${TARGET_SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(buildTargetPayload(table, record)),
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Failed to upsert ${table}/${record?.id || "unknown"} (${res.status}): ${details}`);
  }
}

async function backfillTable(table) {
  let from = 0;
  let sent = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const rows = await fetchPage(table, from, to);
    if (rows.length === 0) break;

    for (const row of rows) {
      await upsertTargetRow(table, row);
      sent += 1;
      if (sent % 100 === 0) {
        console.log(`[backfill-support-sync] ${table}: sent ${sent}`);
      }
    }

    from += rows.length;
    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[backfill-support-sync] ${table}: completed, sent ${sent}`);
}

async function run() {
  console.log("[backfill-support-sync] Starting backfill...");
  await backfillTable("support_tickets");
  await backfillTable("support_ticket_messages");
  console.log("[backfill-support-sync] Done.");
}

run().catch((error) => {
  console.error("[backfill-support-sync] Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
