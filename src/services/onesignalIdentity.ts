import {OneSignal} from 'react-native-onesignal';

let loggedInExternalId: string | null = null;

/** Login no OneSignal só quando o externalId muda (evita spam em TOKEN_REFRESHED). */
export function loginOneSignalUser(externalId: string | null | undefined): void {
  if (!externalId) return;
  if (loggedInExternalId === externalId) return;
  try {
    OneSignal.login(externalId);
    loggedInExternalId = externalId;
  } catch (e) {
    console.warn('[OneSignal] login failed', e);
  }
}

export function logoutOneSignalUser(): void {
  if (loggedInExternalId == null) {
    // Ainda pode haver sessão nativa; tentar logout uma vez é ok
  }
  try {
    OneSignal.logout();
  } catch {
    // ignore
  }
  loggedInExternalId = null;
}
