import { createClient } from '@supabase/supabase-js';

// Deliberately separate from the main dashboard's `supabase` client (../../lib/supabase.ts),
// which points at the customer-facing org/auth project (xcrxltiiovpoladpaewd). This one
// points at the shared LiftPictures production project that owns `admin_users`, `parks`,
// `attractions`, `park_cameras`, etc. — the same one liftpictures-admin-control-center used
// as a standalone app.
const url =
  (import.meta.env.VITE_STAFF_SUPABASE_URL as string | undefined) ??
  'https://kvpcwlcfgmsmarjtwpsx.supabase.co';
const anon =
  (import.meta.env.VITE_STAFF_SUPABASE_ANON_KEY as string | undefined) ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cGN3bGNmZ21zbWFyanR3cHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MDczODEsImV4cCI6MjA4NjA4MzM4MX0.KiMNRutSws--fAxKnSRJgmoq3UiqoyfPowKiPWVs-A0';

export const supabaseBrowser = createClient(url, anon);
