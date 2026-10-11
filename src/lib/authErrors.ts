// Meldungen des Anmeldedienstes (Supabase) kommen immer auf Englisch. Hier werden die häufigen einem
// übersetzten Text zugeordnet; alles Unbekannte bekommt eine allgemeine Meldung in der Sprache des Nutzers.
export function authErrorKey(message: string | null | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) return 'auth.err_invalid';
  if (m.includes('email not confirmed')) return 'auth.err_unconfirmed';
  if (m.includes('already registered') || m.includes('already been registered')) return 'auth.err_exists';
  if (m.includes('password should be at least') || m.includes('weak password')) return 'auth.err_password_short';
  if (m.includes('rate limit') || m.includes('security purposes') || m.includes('too many')) return 'auth.err_rate';
  if (m.includes('failed to fetch') || m.includes('network')) return 'auth.err_network';
  return 'auth.err_generic';
}
