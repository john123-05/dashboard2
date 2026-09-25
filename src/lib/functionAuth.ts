import { supabase } from './supabase';
import { supabaseBrowser } from '../staff/lib/supabase';

/**
 * Die Sitzung, mit der Aufrufe an die operator-*-Functions gehen.
 *
 * Im Staff-CRM (/staff/...) laufen dieselben Seiten wie beim Betreiber, aber der
 * angemeldete Nutzer ist ein Staff-Nutzer. Das Token des Betreiber-Projekts ist
 * dort leer oder abgelaufen ("Invalid operator auth token"); die Functions
 * akzeptieren für Staff das Token des gemeinsamen Projekts (admin_users).
 */
export function getFunctionSession() {
  const staff = typeof window !== 'undefined' && window.location.pathname.startsWith('/staff');
  return (staff ? supabaseBrowser : supabase).auth.getSession();
}
