import AsyncStorage from '@react-native-async-storage/async-storage';
import type {ChatUIMode} from '../config/env';
import type {AppLocale} from '../i18n/translations';
import type {AppThemeMode} from '../theme/tokens';

/** Chaves únicas no AsyncStorage (local storage do app). */
export const PREF_KEYS = {
  theme: 'INTERFLOW_APP_THEME',
  locale: 'INTERFLOW_APP_LOCALE',
  uiMode: 'INTERFLOW_CHAT_UI_MODE',
} as const;

/** Alias legado — migrado na leitura. */
const LEGACY_THEME_KEY = 'APP_THEME';
const LEGACY_LOCALE_KEY = 'APP_LOCALE';

export type AppPreferences = {
  theme: AppThemeMode;
  locale: AppLocale;
  uiMode: ChatUIMode | null;
};

const DEFAULTS: AppPreferences = {
  theme: 'light',
  locale: 'pt',
  uiMode: null,
};

function parseTheme(value: string | null): AppThemeMode | null {
  return value === 'light' || value === 'dark' ? value : null;
}

function parseLocale(value: string | null): AppLocale | null {
  return value === 'pt' || value === 'en' || value === 'es' ? value : null;
}

function parseUiMode(value: string | null): ChatUIMode | null {
  return value === 'hybrid' || value === 'webview' ? value : null;
}

/** Carrega tema, idioma e modo do app do armazenamento local. */
export async function loadAppPreferences(): Promise<AppPreferences> {
  try {
    const [[, theme], [, locale], [, uiMode], [, legacyTheme], [, legacyLocale]] =
      await AsyncStorage.multiGet([
        PREF_KEYS.theme,
        PREF_KEYS.locale,
        PREF_KEYS.uiMode,
        LEGACY_THEME_KEY,
        LEGACY_LOCALE_KEY,
      ]);

    const resolvedTheme =
      parseTheme(theme) || parseTheme(legacyTheme) || DEFAULTS.theme;
    const resolvedLocale =
      parseLocale(locale) || parseLocale(legacyLocale) || DEFAULTS.locale;
    const resolvedUiMode = parseUiMode(uiMode);

    // Migra chaves antigas para o namespace atual
    const migrations: [string, string][] = [];
    if (!theme && legacyTheme && parseTheme(legacyTheme)) {
      migrations.push([PREF_KEYS.theme, legacyTheme]);
    }
    if (!locale && legacyLocale && parseLocale(legacyLocale)) {
      migrations.push([PREF_KEYS.locale, legacyLocale]);
    }
    if (migrations.length > 0) {
      await AsyncStorage.multiSet(migrations);
    }

    return {
      theme: resolvedTheme,
      locale: resolvedLocale,
      uiMode: resolvedUiMode,
    };
  } catch (e) {
    console.warn('[appPreferences] load failed', e);
    return {...DEFAULTS};
  }
}

export async function saveThemePreference(theme: AppThemeMode): Promise<void> {
  await AsyncStorage.setItem(PREF_KEYS.theme, theme);
}

export async function saveLocalePreference(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(PREF_KEYS.locale, locale);
}

export async function saveUiModePreference(
  mode: ChatUIMode | null,
): Promise<void> {
  if (mode == null) {
    await AsyncStorage.removeItem(PREF_KEYS.uiMode);
    return;
  }
  await AsyncStorage.setItem(PREF_KEYS.uiMode, mode);
}
