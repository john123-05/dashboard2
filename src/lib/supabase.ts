import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const externalSupabaseUrl = import.meta.env.VITE_EXTERNAL_SUPABASE_URL;
const externalSupabaseKey = import.meta.env.VITE_EXTERNAL_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const externalSupabase = createClient(externalSupabaseUrl, externalSupabaseKey);
