import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {Session, User} from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loginOneSignalUser,
  logoutOneSignalUser,
} from '../services/onesignalIdentity';
import {supabase} from '../lib/supabase';
import type {AuthSessionPayload} from '../bridge/authProtocol';
import {sessionToPayload} from '../bridge/authProtocol';

const SELECTED_ORG_KEY = 'selectedOrganizationId';

export interface OrgMember {
  id: string;
  organization_id: string;
  profile_id: string;
  role: string;
  permission_group_id?: string | null;
  custom_permissions?: Record<string, unknown> | null;
  organization?: {
    id: string;
    name?: string;
    settings?: Record<string, unknown> | null;
    enabled_modules?: Record<string, unknown> | null;
  } | null;
}

export interface Profile {
  id: string;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  is_superadmin?: boolean | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  currentOrganizationMember: OrgMember | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{error: Error | null}>;
  signOut: () => Promise<void>;
  applyRemoteSession: (payload: AuthSessionPayload) => Promise<void>;
  getSessionPayload: () => AuthSessionPayload | null;
  setCurrentOrganizationId: (organizationId: string) => Promise<void>;
  refreshMembership: () => Promise<void>;
  lastAuthEvent: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'INITIAL' | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

async function fetchMembership(userId: string): Promise<{
  profile: Profile | null;
  member: OrgMember | null;
}> {
  const selectedOrgId = await AsyncStorage.getItem(SELECTED_ORG_KEY);

  const {data: profile} = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, is_superadmin')
    .eq('id', userId)
    .maybeSingle();

  const select = `
      id,
      organization_id,
      profile_id,
      role,
      permission_group_id,
      custom_permissions,
      organization:organizations (
        id,
        name,
        settings,
        enabled_modules
      )
    `;

  let memberQuery = supabase
    .from('organization_members')
    .select(select)
    .eq('user_id', userId)
    .eq('status', 'active');

  if (selectedOrgId) {
    memberQuery = memberQuery.eq('organization_id', selectedOrgId);
  }

  const {data: members} = await memberQuery.limit(1);

  let member = (members?.[0] as OrgMember | undefined) ?? null;

  if (!member) {
    const {data: fallback} = await supabase
      .from('organization_members')
      .select(select)
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);

    member = (fallback?.[0] as OrgMember | undefined) ?? null;
    if (member?.organization_id) {
      await AsyncStorage.setItem(SELECTED_ORG_KEY, member.organization_id);
    }
  }

  return {profile: (profile as Profile) ?? null, member};
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentOrganizationMember, setCurrentOrganizationMember] =
    useState<OrgMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAuthEvent, setLastAuthEvent] =
    useState<AuthContextValue['lastAuthEvent']>('INITIAL');
  const applyingRemoteRef = useRef(false);

  const refreshMembership = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setCurrentOrganizationMember(null);
      return;
    }
    try {
      const {profile: p, member} = await fetchMembership(userId);
      setProfile(p);
      setCurrentOrganizationMember(member);
    } catch (e) {
      console.error('[AuthProvider] refreshMembership failed', e);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({data}) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user?.id) {
        loginOneSignalUser(data.session.user.id);
        try {
          const {profile: p, member} = await fetchMembership(data.session.user.id);
          if (mounted) {
            setProfile(p);
            setCurrentOrganizationMember(member);
          }
        } catch (e) {
          console.error('[AuthProvider] initial membership failed', e);
        }
      }
      if (mounted) setLoading(false);
    });

    const {data: sub} = supabase.auth.onAuthStateChange(async (event, next) => {
      const fromRemoteApply = applyingRemoteRef.current;
      setSession(next);
      // Sessão vinda da WebView: não emitir lastAuthEvent SIGNED_IN —
      // senão o WebViewShell re-hydrata e a web reenvia auth.session em loop.
      if (
        (event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'SIGNED_OUT') &&
        !(fromRemoteApply && event === 'SIGNED_IN')
      ) {
        setLastAuthEvent(event);
      }

      if (next?.user?.id) {
        // Dedupe interno: TOKEN_REFRESHED / auth.refreshed não relogam o mesmo id
        loginOneSignalUser(next.user.id);
        try {
          const {profile: p, member} = await fetchMembership(next.user.id);
          setProfile(p);
          setCurrentOrganizationMember(member);
        } catch (e) {
          console.error('[AuthProvider] membership on auth change failed', e);
        }
      } else {
        logoutOneSignalUser();
        setProfile(null);
        setCurrentOrganizationMember(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const {error} = await supabase.auth.signInWithPassword({email, password});
      if (error) return {error};
      return {error: null};
    } catch (error) {
      return {error: error as Error};
    }
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SELECTED_ORG_KEY);
    await supabase.auth.signOut();
    logoutOneSignalUser();
  }, []);

  const applyRemoteSession = useCallback(async (payload: AuthSessionPayload) => {
    if (!payload?.access_token || !payload?.refresh_token) return;
    applyingRemoteRef.current = true;
    try {
      const {error} = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) {
        console.error('[AuthProvider] applyRemoteSession failed', error);
      }
    } finally {
      applyingRemoteRef.current = false;
    }
  }, []);

  const getSessionPayload = useCallback((): AuthSessionPayload | null => {
    if (!session) return null;
    return sessionToPayload(session);
  }, [session]);

  const setCurrentOrganizationId = useCallback(async (organizationId: string) => {
    await AsyncStorage.setItem(SELECTED_ORG_KEY, organizationId);
    await refreshMembership();
  }, [refreshMembership]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      currentOrganizationMember,
      loading,
      signIn,
      signOut,
      applyRemoteSession,
      getSessionPayload,
      setCurrentOrganizationId,
      refreshMembership,
      lastAuthEvent,
    }),
    [
      session,
      profile,
      currentOrganizationMember,
      loading,
      signIn,
      signOut,
      applyRemoteSession,
      getSessionPayload,
      setCurrentOrganizationId,
      refreshMembership,
      lastAuthEvent,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
