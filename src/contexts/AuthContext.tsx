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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      await supabase.auth.signOut().catch(() => undefined);
      clearAuthState();
      return null;
    }
    return data.user;
  }

  async function loadProfile(userId: string) {
    const { data: profile } = await supabase
      .from('operator_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const { data: memberships } = await supabase
      .from('organization_memberships')
      .select('*, organization:organizations(*)')
      .eq('user_id', userId);

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
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const validUser = await validateSession(session);
      setState((prev) => ({ ...prev, session: validUser ? session : null, user: validUser }));
      if (validUser) {
        loadProfile(validUser.id);
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const validUser = await validateSession(session);
      setState((prev) => ({ ...prev, session: validUser ? session : null, user: validUser }));
      if (validUser) {
        loadProfile(validUser.id);
      } else {
        clearAuthState();
      }
    });

    return () => subscription.unsubscribe();
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
