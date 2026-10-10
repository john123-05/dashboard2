import { supabase } from './supabase';

/**
 * Die Sitzung, mit der Aufrufe an die operator-*-Functions gehen: die des
 * angemeldeten Betreibers (Betreiber-Projekt). Früher gab es hier einen Zweig für
 * den Staff-Bereich (/staff); der lebt jetzt im Liftpictures-CRM.
 */
export function getFunctionSession() {
  return supabase.auth.getSession();
}
