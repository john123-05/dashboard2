-- Imst's actual opening hours (same 09:30-17:00 window every day, no closed
-- days, per the park's own published hours) - populates the opening_hours
-- column added in 20260714090000_kiosk_photo_sales_rollup.sql, which was
-- left null for every park until now. This is what activates the
-- check_park_inactivity() alert (20260714200000_park_inactivity_alert.sql)
-- for Imst specifically; it stays inert for any park without this set.
update public.parks
set opening_hours = jsonb_build_object(
  'mon', jsonb_build_array('09:30', '17:00'),
  'tue', jsonb_build_array('09:30', '17:00'),
  'wed', jsonb_build_array('09:30', '17:00'),
  'thu', jsonb_build_array('09:30', '17:00'),
  'fri', jsonb_build_array('09:30', '17:00'),
  'sat', jsonb_build_array('09:30', '17:00'),
  'sun', jsonb_build_array('09:30', '17:00')
)
where id = '85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14'; -- Imst (Imster Bergbahnen / Alpine Coaster)
