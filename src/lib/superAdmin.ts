// Accounts that may jump between parks without the park password. Only a
// convenience gate: which parks they can open is still decided server-side
// (organization membership + app_metadata.allowed_park_ids).
const SUPER_ADMIN_EMAILS = ['tomnotes.tn@gmail.com', 'john.m.nolting@gmail.com'];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
