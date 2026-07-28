import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://xcrxltiiovpoladpaewd.supabase.co";
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjcnhsdGlpb3Zwb2xhZHBhZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTIxODEsImV4cCI6MjA4MjQ4ODE4MX0.qScZ_Uk6q68KHd35VloDuwb3DnC9iAktMx6xt17YWoQ";

// Points at the shared LiftPictures content project (Plose/Oderwitz/Imst photos,
// parks, attractions) rather than this dashboard's own project. Anon key only —
// the photos table's RLS already permits anon reads of any row with a non-null
// external_code, which is what the photo browser searches by.
export const EXTERNAL_SUPABASE_URL =
  import.meta.env.VITE_EXTERNAL_SUPABASE_URL ?? "https://kvpcwlcfgmsmarjtwpsx.supabase.co";
export const EXTERNAL_SUPABASE_ANON_KEY =
  import.meta.env.VITE_EXTERNAL_SUPABASE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cGN3bGNmZ21zbWFyanR3cHN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MDczODEsImV4cCI6MjA4NjA4MzM4MX0.KiMNRutSws--fAxKnSRJgmoq3UiqoyfPowKiPWVs-A0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY);
