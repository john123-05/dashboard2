# resolve-overlays

Resolves the active overlay campaign for each photo (`park + timestamp`) and returns signed overlay URLs.

## Environment

- `DASHBOARD_SUPABASE_URL` (optional fallback: `SUPABASE_URL`)
- `DASHBOARD_SUPABASE_SERVICE_KEY` (optional fallback: `SUPABASE_SERVICE_ROLE_KEY`)
- `OVERLAY_SIGNED_URL_TTL_SECONDS` (optional, default `3600`)

## Request

`POST`

```json
{
  "park_id": "uuid",
  "photos": [
    { "id": "photo_uuid", "taken_at": "2026-02-20T12:00:00Z" }
  ]
}
```

## Response

```json
{
  "matches": [
    {
      "photo_id": "photo_uuid",
      "campaign_id": "uuid-or-null",
      "overlays": [
        {
          "asset_id": "uuid",
          "signed_url": "https://...",
          "z_index": 10,
          "opacity": 1,
          "blend_mode": "normal",
          "fit": "contain",
          "anchor": "center",
          "scale": 1
        }
      ]
    }
  ],
  "expires_in": 3600
}
```
