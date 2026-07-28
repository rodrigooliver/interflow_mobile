export type FetchErrorKind = 'network' | 'generic';

/** Classifica falhas de fetch (offline / timeout vs erro genérico). */
export function getFetchErrorKind(error: unknown): FetchErrorKind {
  if (isNetworkError(error)) return 'network';
  return 'generic';
}

export function isNetworkError(error: unknown): boolean {
  if (error == null) return false;

  const anyErr = error as {
    message?: string;
    name?: string;
    code?: string | number;
    status?: number;
  };

  const msg = String(anyErr.message || error).toLowerCase();
  const name = String(anyErr.name || '').toLowerCase();
  const code = String(anyErr.code ?? '');

  if (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('internet connection') ||
    msg.includes('the internet connection appears to be offline') ||
    msg.includes('offline') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('ecconnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    name === 'aborterror' ||
    code === 'NETWORK_ERROR' ||
    code === 'ECONNABORTED'
  ) {
    return true;
  }

  return false;
}
