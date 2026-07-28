alter table public.parks
  add column if not exists opening_hours_config jsonb;

comment on column public.parks.opening_hours_config is
  'Extended operator-managed schedule config with weekly hours, pauses, season window, and dated exceptions such as holidays or vacations. opening_hours remains the derived simple weekly fallback used by older analytics/alerts.';

update public.parks
set opening_hours_config = jsonb_build_object(
  'season_start', null,
  'season_end', null,
  'weekdays', jsonb_build_object(
    'mon', case when opening_hours->'mon' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'mon'->>0, 'close', opening_hours->'mon'->>1, 'pauses', jsonb_build_array()) end,
    'tue', case when opening_hours->'tue' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'tue'->>0, 'close', opening_hours->'tue'->>1, 'pauses', jsonb_build_array()) end,
    'wed', case when opening_hours->'wed' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'wed'->>0, 'close', opening_hours->'wed'->>1, 'pauses', jsonb_build_array()) end,
    'thu', case when opening_hours->'thu' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'thu'->>0, 'close', opening_hours->'thu'->>1, 'pauses', jsonb_build_array()) end,
    'fri', case when opening_hours->'fri' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'fri'->>0, 'close', opening_hours->'fri'->>1, 'pauses', jsonb_build_array()) end,
    'sat', case when opening_hours->'sat' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'sat'->>0, 'close', opening_hours->'sat'->>1, 'pauses', jsonb_build_array()) end,
    'sun', case when opening_hours->'sun' is null then jsonb_build_object('enabled', false, 'open', '09:00', 'close', '17:00', 'pauses', jsonb_build_array()) else jsonb_build_object('enabled', true, 'open', opening_hours->'sun'->>0, 'close', opening_hours->'sun'->>1, 'pauses', jsonb_build_array()) end
  ),
  'exceptions', jsonb_build_array()
)
where opening_hours_config is null;
