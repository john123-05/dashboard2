import { supabaseBrowser } from './supabase';

export interface StaffCredential {
  id: string;
  label: string;
  category: string | null;
  person_name: string | null;
  login: string | null;
  password: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewStaffCredential {
  label: string;
  category?: string | null;
  person_name?: string | null;
  login?: string | null;
  password: string;
  notes?: string | null;
}

export async function fetchStaffCredentials(): Promise<StaffCredential[]> {
  const { data, error } = await supabaseBrowser
    .from('staff_credentials')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createStaffCredential(input: NewStaffCredential): Promise<void> {
  const { error } = await supabaseBrowser.from('staff_credentials').insert({
    label: input.label,
    category: input.category || null,
    person_name: input.person_name || null,
    login: input.login || null,
    password: input.password,
    notes: input.notes || null,
  });

  if (error) throw error;
}

export async function updateStaffCredential(id: string, input: NewStaffCredential): Promise<void> {
  const { error } = await supabaseBrowser
    .from('staff_credentials')
    .update({
      label: input.label,
      category: input.category || null,
      person_name: input.person_name || null,
      login: input.login || null,
      password: input.password,
      notes: input.notes || null,
    })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteStaffCredential(id: string): Promise<void> {
  const { error } = await supabaseBrowser.from('staff_credentials').delete().eq('id', id);
  if (error) throw error;
}
