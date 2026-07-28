import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AuthSessionPayload} from '../bridge/authProtocol';
import {getSupabase} from '../lib/supabase';
import {loginOneSignalUser, logoutOneSignalUser} from './onesignalIdentity';

const SESSION_MIRROR_KEY = 'INTERFLOW_MIRRORED_SESSION';

/** Persiste JWT recebido da web (AsyncStorage) e tenta hidratar o client Supabase nativo. */
export async function mirrorWebSession(
  payload: AuthSessionPayload,
): Promise<{ok: boolean; error?: string}> {
  if (!payload?.access_token || !payload?.refresh_token) {
    return {ok: false, error: 'payload incompleto'};
  }

  await AsyncStorage.setItem(SESSION_MIRROR_KEY, JSON.stringify(payload));

  if (payload.user?.id) {
    loginOneSignalUser(payload.user.id);
  }

  try {
    const {error} = await getSupabase().auth.setSession({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
    });
    if (error) {
      return {ok: false, error: error.message};
    }
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'setSession failed'};
  }
}

export async function clearMirroredSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_MIRROR_KEY);
  logoutOneSignalUser();
  try {
    await getSupabase().auth.signOut();
  } catch {
    // ignore
  }
}

export async function readMirroredSession(): Promise<AuthSessionPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_MIRROR_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSessionPayload;
  } catch {
    return null;
  }
}
