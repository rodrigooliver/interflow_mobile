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
  | 'closeWeb'
  | 'nativeNavStart'
  | 'nativeNavComplete'
  | 'webviewReady'
  | 'error'
  | 'renderError'
  | 'pageshow';

/** Extrai pathname+search de URL completa ou path relativo. */
export function extractAppPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  try {
    if (pathOrUrl.includes('://')) {
      const u = new URL(pathOrUrl);
      return `${u.pathname}${u.search}`;
    }
    return pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  } catch {
    return pathOrUrl;
  }
}

/** Paths com chrome embutido na web (sem botão flutuante ← App). */
export function isEmbeddedWebChromePath(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  try {
    const path = extractAppPath(pathOrUrl) || pathOrUrl;
    return (
      /\/app\/customers\/[^/]+\/edit(?:\/|\?|$)/.test(path) ||
      /\/app\/chats(?:\/|\?|$)/.test(path) ||
      /\/app\/chat\/[^/?#]+/.test(path)
    );
  } catch {
    return false;
  }
}

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
      function notify(matched, skipped) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'nativeNavComplete',
              path: ${safePath},
              current: window.location.pathname + window.location.search,
              matched: !!matched,
              skipped: !!skipped
            }));
          }
        } catch (_) {}
      }
      function notifyStart() {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'nativeNavStart',
              path: ${safePath}
            }));
          }
        } catch (_) {}
      }
      function normFull(p) {
        if (!p) return '';
        var qIdx = p.indexOf('?');
        var pathname = qIdx >= 0 ? p.slice(0, qIdx) : p;
        var search = qIdx >= 0 ? p.slice(qIdx) : '';
        if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === '/') {
          pathname = pathname.slice(0, -1);
        }
        // Inclui search: /app/chats?filter=a ≠ /app/chats?filter=b
        return pathname + search;
      }
      function pathMatches(target) {
        var nowFull = window.location.pathname + window.location.search;
        return normFull(nowFull) === normFull(target);
      }
      try {
        var path = ${safePath};
        // Já está na rota: não navega nem recarrega
        if (pathMatches(path)) {
          notify(true, true);
          true;
          return;
        }
        notifyStart();
        if (typeof window.navigate === 'function') {
          window.navigate(path);
        } else {
          window.dispatchEvent(new CustomEvent('onesignal_navigation', {
            detail: { url: path }
          }));
        }
        // Aguarda o React Router pintar a rota (sem hard reload)
        var tries = 0;
        var timer = setInterval(function() {
          tries += 1;
          if (pathMatches(path) || tries >= 24) {
            clearInterval(timer);
            notify(pathMatches(path), false);
          }
        }, 50);
        true;
      } catch (e) {
        notify(false, false);
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
