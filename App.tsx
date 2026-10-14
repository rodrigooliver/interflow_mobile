/**
 * Interflow Mobile App
 * WebView do app web. O loading de abertura é o BootLoadingScreen nativo.
 * Login na web; JWT espelhado no nativo.
 *
 * @format
 */

import React, {useEffect, useState, useCallback} from 'react';
import {View, StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import env from './src/config/env';
import {ThemeProvider} from './src/contexts/ThemeContext';
import {I18nProvider} from './src/contexts/I18nContext';
import WebViewShell from './src/webview/WebViewShell';
import {
  BootLoadingScreen,
  LOADING_BG_DARK,
} from './src/components/LoadingScreen';
import type {AuthSessionPayload} from './src/bridge/authProtocol';
import {
  clearMirroredSession,
  mirrorWebSession,
  readMirroredSession,
} from './src/services/sessionMirror';
import {
  loadAppPreferences,
  saveUiModePreference,
  type AppPreferences,
} from './src/services/appPreferences';

Sentry.init({
  dsn: env.SENTRY_DSN,
  sendDefaultPii: true,
});

/**
 * App em WebView. O loading de abertura continua o BootLoadingScreen atual.
 * Login na web; JWT espelhado no nativo.
 */
function WebViewModeApp() {
  const [sessionPayload, setSessionPayload] =
    useState<AuthSessionPayload | null>(null);

  useEffect(() => {
    readMirroredSession().then(stored => {
      if (stored) setSessionPayload(stored);
    });
  }, []);

  const handleRemoteSession = useCallback(
    async (payload: AuthSessionPayload) => {
      setSessionPayload(payload);
      const result = await mirrorWebSession(payload);
      if (!result.ok) {
        console.warn('[WebViewMode] mirror JWT falhou:', result.error);
      }
    },
    [],
  );

  const handleRemoteLogout = useCallback(async () => {
    setSessionPayload(null);
    await clearMirroredSession();
  }, []);

  return (
    <View style={styles.flex}>
      <WebViewShell
        visible
        uiMode="webview"
        sessionPayload={sessionPayload}
        onRemoteSession={handleRemoteSession}
        onRemoteLogout={handleRemoteLogout}
      />
    </View>
  );
}

function App() {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);

  useEffect(() => {
    loadAppPreferences()
      .then(async loaded => {
        if (loaded.uiMode !== 'webview') {
          await saveUiModePreference('webview');
        }
        setPrefs({...loaded, uiMode: 'webview'});
      })
      .catch(() =>
        setPrefs({theme: 'light', locale: 'pt', uiMode: 'webview'}),
      );
  }, []);

  // Root sempre escuro no boot — elimina flash branco entre splash e app.
  // initialWindowMetrics: evita inset 0→real no 1º frame (pulo de cima pra baixo).
  return (
    <GestureHandlerRootView
      style={[styles.flex, {backgroundColor: LOADING_BG_DARK}]}>
      <SafeAreaProvider
        initialMetrics={initialWindowMetrics}
        style={[styles.flex, {backgroundColor: LOADING_BG_DARK}]}>
        {!prefs ? (
          <BootLoadingScreen />
        ) : (
          <ThemeProvider initialTheme={prefs.theme}>
            <I18nProvider initialLocale={prefs.locale}>
              <WebViewModeApp />
            </I18nProvider>
          </ThemeProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
});

export default Sentry.wrap(App);
