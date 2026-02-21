# Dashboard

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
