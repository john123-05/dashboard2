# support-sync-outbound

Outbound sync worker for support tickets/messages to a second Supabase project.

## Required env vars

- `TARGET_SUPABASE_URL` (or `APP_SUPABASE_URL`)
- `TARGET_SUPABASE_SERVICE_KEY` (or `APP_SUPABASE_SERVICE_KEY`)

## Optional env vars

- `SUPPORT_SYNC_SHARED_SECRET` (checked from `X-Sync-Secret` header)
- `TARGET_ORGANIZATION_ID` (force mapped `organization_id` on outbound records)
- `TARGET_TICKET_CREATED_BY` (force mapped `created_by` for `support_tickets`)
- `TARGET_MESSAGE_AUTHOR_ID` (force mapped `author_id` for `support_ticket_messages`)

Source project env falls back to built-ins:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- or `SOURCE_SUPABASE_URL` and `SOURCE_SUPABASE_SERVICE_KEY`

## Invoke

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/support-sync-outbound" \
  -H "Content-Type: application/json" \
  -H "X-Sync-Secret: <optional secret>" \
  -d '{"limit":50,"dry_run":false}'
```

`dry_run: true` reads queue entries without marking them synced/failed.

Queue rows with `event_type=delete` are mirrored as `DELETE` requests on the target project.
