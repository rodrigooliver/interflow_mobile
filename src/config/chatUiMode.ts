import ENV, {type ChatUIMode} from './env';
import {
  loadAppPreferences,
  saveUiModePreference,
} from '../services/appPreferences';

export async function resolveChatUiMode(): Promise<ChatUIMode> {
  try {
    const prefs = await loadAppPreferences();
    if (prefs.uiMode) return prefs.uiMode;
  } catch (e) {
    console.warn('[chatUiMode] failed to read override', e);
  }
  return ENV.CHAT_UI_MODE;
}

export async function setChatUiModeOverride(
  mode: ChatUIMode | null,
): Promise<void> {
  await saveUiModePreference(mode);
}

export function cycleChatUiMode(current: ChatUIMode): ChatUIMode {
  return current === 'hybrid' ? 'webview' : 'hybrid';
}
