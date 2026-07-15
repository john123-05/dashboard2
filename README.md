# Dashboard

## Liftpic Local Asset Sync

`/staff/kunden-management?tab=liftpic` now also manages local files for
attraction PCs: viewer logos, default photos, print overlays and legacy
jpeg4web/imageloader assets.

The same tab also offers the one-file Windows installer:
`install_liftpic_sync_bootstrap.ps1`. Staff creates the Liftpic PC row, downloads
the installer, copies the row's install command, and runs it on the attraction PC
as Administrator. The installer pairs the PC and starts the background task.

Flow:

1. Staff uploads a file in the Liftpic PCs tab.
2. Edge Function `admin-liftpic-assets` stores it in private bucket
   `liftpic-assets`.
3. The function writes `liftpic_asset_deployments` with slot, target Windows
   path, machine/camera and SHA256.
4. The PC-side `liftpic-sync` calls `liftpic-assets`, downloads signed files,
   backs up the old local target, then replaces the approved path.

This is separate from the customer-facing online overlay editor in
`src/pages/Personalization.tsx`.

## Liftpic Ride Counts

For kiosk/self-service parks, sold photos and total rides are two different
signals:

- sold photos come from `park_photo_sales_daily`
- total rides/photos taken come from `park_photo_ride_daily`, which is filled
  by `liftpic-sync` heartbeats

The operator revenue dashboard prefers `photos_taken_count` from
`park_photo_ride_daily` and falls back to the older `max_file_code -
min_file_code + 1` estimate when a park has not rolled out the new uploader
yet. Unsold JPEGs are not uploaded just to calculate conversion.

## Support Sync Outbound (Source Project)

This project can mirror `support_tickets` and `support_ticket_messages` into a second Supabase project without a custom webhook receiver.

Recommended flow:

1. DB triggers enqueue row changes into `support_sync_queue`.
2. Edge Function `support-sync-outbound` reads queue rows.
3. Function writes directly to target Supabase REST API (`upsert` / `delete`).

### Environment

Set function secrets in the source project:

- `TARGET_SUPABASE_URL=https://<TARGET_PROJECT_REF>.supabase.co`
- `TARGET_SUPABASE_SERVICE_KEY=<target-service-role-key>`

Optional:

- `SUPPORT_SYNC_SHARED_SECRET=<secret for manual invoke protection>`
- `TARGET_ORGANIZATION_ID=<override organization_id>`
- `TARGET_TICKET_CREATED_BY=<override created_by>`
- `TARGET_MESSAGE_AUTHOR_ID=<override author_id>`

Where to find values in target Supabase project:

- URL: `Project Settings -> API -> Project URL`
- Service key: `Project Settings -> API -> service_role` (keep secret)

### Setup Steps

1. Apply migrations:

```bash
supabase db push
```

2. Deploy the worker function:

```bash
supabase functions deploy support-sync-outbound --no-verify-jwt
```

3. Set secrets on source project:

```bash
supabase secrets set \
  TARGET_SUPABASE_URL="https://<TARGET_PROJECT_REF>.supabase.co" \
  TARGET_SUPABASE_SERVICE_KEY="<target-service-role-key>" \
  SUPPORT_SYNC_SHARED_SECRET="<optional-secret>"
```

4. Trigger the worker (manual test):

```bash
curl -X POST "https://<SOURCE_PROJECT_REF>.supabase.co/functions/v1/support-sync-outbound" \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: <optional-secret>" \
  -d '{"limit":100}'
```

5. Scheduler is auto-created by migration (`* * * * *`) and invokes:

```sql
select public.run_support_sync_outbound_job();
```

Useful checks in SQL Editor:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'support-sync-outbound-every-minute';
```

```sql
select *
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'support-sync-outbound-every-minute'
)
order by start_time desc
limit 20;
```

### One-Time Backfill

```bash
npm run backfill:support-sync
```

Backfill uses direct source->target upsert for both tables:

- `public.support_tickets`
- `public.support_ticket_messages`
