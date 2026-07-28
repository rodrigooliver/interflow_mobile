import type {Session, User} from '@supabase/supabase-js';

/** Mensagens Web → Native / Native → Web para sessão Supabase */
export type AuthBridgeMessageType =
  | 'auth.session'
  | 'auth.logout'
  | 'auth.refreshed'
  | 'auth.hydrate'
  | 'login'
  | 'logout'
  | 'themeChange'
  | 'linkClicked'
  | 'pageFullyLoaded'
  | 'chatBackButtonSimulated'
  | 'iosGestureSimulated'
  | 'navigateNative'
  | 'openWeb'
  | 'webviewReady'
  | 'error'
  | 'renderError'
  | 'pageshow';

export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
  token_type?: string;
  user?: User | null;
}

export interface BridgeMessage<T = unknown> {
  type: AuthBridgeMessageType | string;
  [key: string]: T | string | number | boolean | null | undefined | object;
}

export function sessionToPayload(session: Session): AuthSessionPayload {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };
}

export function buildHydrateInjectScript(payload: AuthSessionPayload): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `
    (function() {
      try {
        var payload = ${json};
        window.__pendingNativeSession = payload;
        if (window.__nativeAuth && typeof window.__nativeAuth.hydrate === 'function') {
          window.__nativeAuth.hydrate(payload);
        } else {
          window.dispatchEvent(new CustomEvent('nativeAuthHydrate', { detail: payload }));
        }
        true;
      } catch (e) {
        console.error('[nativeAuth] hydrate failed', e);
        false;
      }
    })();
    true;
  `;
}

export function buildSignOutInjectScript(): string {
  return `
    (function() {
      try {
        window.__pendingNativeSession = null;
        if (window.__nativeAuth && typeof window.__nativeAuth.signOut === 'function') {
          window.__nativeAuth.signOut();
        } else {
          window.dispatchEvent(new CustomEvent('nativeAuthSignOut'));
        }
        true;
      } catch (e) {
        console.error('[nativeAuth] signOut failed', e);
        false;
      }
    })();
    true;
  `;
}

export function buildNavigateInjectScript(path: string): string {
  const safePath = JSON.stringify(path);
  return `
    (function() {
      try {
        var path = ${safePath};
        if (typeof window.navigate === 'function') {
          window.navigate(path);
        } else {
          window.history.pushState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        true;
      } catch (e) {
        try { window.location.href = path; } catch (_) {}
        false;
      }
    })();
    true;
  `;
}

export function isChatPath(pathOrUrl: string): boolean {
  try {
    const path = pathOrUrl.includes('://')
      ? pathOrUrl.replace(/^https?:\/\/[^/]+/, '')
      : pathOrUrl;
    return /\/app\/chats(\/|$|\?)/.test(path) || path === '/app/chats';
  } catch {
    return false;
  }
}

export function extractChatIdFromPath(pathOrUrl: string): string | null {
  const match = pathOrUrl.match(/\/app\/chats\/([0-9a-fA-F-]{36})/);
  return match?.[1] ?? null;
}
