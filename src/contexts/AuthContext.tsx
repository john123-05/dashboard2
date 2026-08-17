import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { OperatorProfile, OrganizationMembership, Organization } from '../lib/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: OperatorProfile | null;
  memberships: (OrganizationMembership & { organization: Organization })[];
  currentOrg: Organization | null;
  loading: boolean;
  hasOrg: boolean;
  role: OrganizationMembership['role'] | null;
  isStaff: boolean;
  isOwner: boolean;
}

export interface AuthContextType extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  joinDemoOrg: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

// Wie lange auf eine einzelne Anmelde-Anfrage gewartet wird, bevor wir ohne sie
// weitermachen. Acht Sekunden sind lang genug fuer eine langsame Leitung und
// kurz genug, dass niemand glaubt, die Seite sei kaputt.
const ANFRAGE_ZEITLIMIT_MS = 8000;

// Notbremse: spaetestens danach hoert der Ladezustand auf, egal was passiert.
const NOTBREMSE_MS = 12000;

/**
 * Ein Versprechen, das garantiert endet.
 *
 * Warum das hier stehen muss (F-042): Bisher fuehrte JEDER Weg zu
 * `loading: false` durch einen ungesicherten Netzwerkaufruf - `getSession`,
 * `getUser`, zwei Profilabfragen. Kein `catch`, kein Zeitlimit. Blieb eine
 * einzige dieser Anfragen haengen oder schlug sie fehl, blieb der Spinner
 * "Dashboard laedt..." für immer stehen. Genau das war zu sehen: Netzwerk-
 * Reiter mit `Finish: 17,52 s` und eine Seite, die nie fertig wurde.
 *
 * Gibt bei Zeitueberschreitung oder Fehler `null` zurueck, statt zu werfen -
 * der Aufrufer entscheidet dann, was ohne diese Antwort sinnvoll ist.
 */
function mitZeitlimit<T>(versprechen: PromiseLike<T>, ms = ANFRAGE_ZEITLIMIT_MS): Promise<T | null> {
  return new Promise<T | null>((aufloesen) => {
    const uhr = setTimeout(() => aufloesen(null), ms);
    versprechen.then(
      (wert) => {
        clearTimeout(uhr);
        aufloesen(wert);
      },
      (fehler) => {
        clearTimeout(uhr);
        console.error('Anmeldung: Anfrage fehlgeschlagen', fehler);
        aufloesen(null);
      },
    );
  });
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    profile: null,
    memberships: [],
    currentOrg: null,
    loading: true,
    hasOrg: false,
    role: null,
    isStaff: false,
    isOwner: false,
  });

  function clearAuthState() {
    setState((prev) => ({
      ...prev,
      session: null,
      user: null,
      profile: null,
      memberships: [],
      currentOrg: null,
      hasOrg: false,
      role: null,
      isStaff: false,
      isOwner: false,
      loading: false,
    }));
  }

  async function validateSession(session: Session | null): Promise<User | null> {
    if (!session) return null;

    const antwort = await mitZeitlimit(supabase.auth.getUser());

    // Keine Antwort heisst NICHT "ungueltig", sondern "wir konnten gerade nicht
    // nachfragen". Frueher wurde in diesem Fall abgemeldet - eine langsame
    // Leitung hat also Leute hinausgeworfen. Wir behalten die oertliche
    // Sitzung: ihr Ablaufdatum prueft die Bibliothek selbst, und was der
    // Benutzer wirklich sehen darf, entscheidet ohnehin die Zugriffskontrolle
    // auf dem Server. (F-042)
    if (!antwort) return session.user ?? null;

    const { data, error } = antwort;
    if (error || !data.user) {
      await supabase.auth.signOut().catch(() => undefined);
      clearAuthState();
      return null;
    }
    return data.user;
  }

  async function loadProfile(userId: string) {
    try {
      const profilAntwort = await mitZeitlimit(
        supabase.from('operator_profiles').select('*').eq('id', userId).maybeSingle(),
      );

      const mitgliedschaftAntwort = await mitZeitlimit(
        supabase
          .from('organization_memberships')
          .select('*, organization:organizations(*)')
          .eq('user_id', userId),
      );

      const profile = profilAntwort?.data ?? null;
      const memberships = mitgliedschaftAntwort?.data ?? null;

      const mems = (memberships || []).map((m: Record<string, unknown>) => ({
        ...m,
        organization: m.organization as Organization,
      })) as (OrganizationMembership & { organization: Organization })[];

      const currentMembership = mems.length > 0 ? mems[0] : null;
      const currentOrg = currentMembership ? currentMembership.organization : null;
      const role = currentMembership ? currentMembership.role : null;

      setState((prev) => ({
        ...prev,
        profile: profile as OperatorProfile | null,
        memberships: mems,
        currentOrg,
        hasOrg: mems.length > 0,
        role,
        isStaff: role === 'staff',
        isOwner: role === 'org_owner' || role === 'platform_admin',
        loading: false,
      }));
    } catch (fehler) {
      console.error('Anmeldung: Profil konnte nicht geladen werden', fehler);
    } finally {
      // Was auch immer oben passiert ist - der Ladezustand endet hier. Das ist
      // die Zeile, deren Fehlen die Seite haengen liess.
      setState((prev) => (prev.loading ? { ...prev, loading: false } : prev));
    }
  }

  useEffect(() => {
    let beendet = false;

    // Die Notbremse. Sie ist der einzige Grund, warum der Spinner nicht mehr
    // ewig stehen bleiben KANN - unabhaengig davon, ob unten etwas haengt,
    // wirft oder gar nicht erst antwortet. Lieber eine Anmeldemaske als eine
    // Seite, die sich nie entscheidet.
    const notbremse = setTimeout(() => {
      if (beendet) return;
      setState((prev) => {
        if (!prev.loading) return prev;
        console.error('Anmeldung: Zeitlimit erreicht, zeige die Seite ohne Profil.');
        return { ...prev, loading: false };
      });
    }, NOTBREMSE_MS);

    async function anmeldungPruefen(session: Session | null) {
      const validUser = await validateSession(session);
      if (beendet) return;
      setState((prev) => ({ ...prev, session: validUser ? session : null, user: validUser }));
      if (validUser) {
        await loadProfile(validUser.id);
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    }

    void (async () => {
      try {
        const antwort = await mitZeitlimit(supabase.auth.getSession());
        await anmeldungPruefen(antwort?.data.session ?? null);
      } catch (fehler) {
        console.error('Anmeldung: Start fehlgeschlagen', fehler);
        if (!beendet) clearAuthState();
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        try {
          const validUser = await validateSession(session);
          if (beendet) return;
          setState((prev) => ({ ...prev, session: validUser ? session : null, user: validUser }));
          if (validUser) {
            await loadProfile(validUser.id);
          } else {
            clearAuthState();
          }
        } catch (fehler) {
          console.error('Anmeldung: Zustandswechsel fehlgeschlagen', fehler);
          if (!beendet) clearAuthState();
        }
      })();
    });

    return () => {
      beendet = true;
      clearTimeout(notbremse);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function joinDemoOrg() {
    await supabase.rpc('join_demo_organization');
    if (state.user) {
      await loadProfile(state.user.id);
    }
  }

  async function refreshProfile() {
    if (state.user) {
      await loadProfile(state.user.id);
    }
  }

  return (
    <AuthContext.Provider
      value={{ ...state, signIn, signUp, signOut, joinDemoOrg, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
