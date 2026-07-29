/**
 * Interflow Mobile App
 * Modos: webview | hybrid
 * Login: sempre no WebView — o nativo só espelha o JWT.
 *
 * @format
 */

import React, {useEffect, useState, useCallback} from 'react';
import {View, StyleSheet, Text, TouchableOpacity} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import env, {type ChatUIMode} from './src/config/env';
import {setChatUiModeOverride} from './src/config/chatUiMode';
import {AuthProvider} from './src/contexts/AuthContext';
import {ThemeProvider} from './src/contexts/ThemeContext';
import {I18nProvider} from './src/contexts/I18nContext';
import {HybridApp} from './src/navigation/HybridApp';
import WebViewShell from './src/webview/WebViewShell';
import {
  BootLoadingScreen,
  LOADING_BG_DARK,
} from './src/components/LoadingScreen';
import {brand, radii, spacing} from './src/theme/tokens';
import type {AuthSessionPayload} from './src/bridge/authProtocol';
import {
  clearMirroredSession,
  mirrorWebSession,
  readMirroredSession,
} from './src/services/sessionMirror';
import {
  loadAppPreferences,
  type AppPreferences,
} from './src/services/appPreferences';

Sentry.init({
  dsn: env.SENTRY_DSN,
  sendDefaultPii: true,
});

/**
 * Modo webview: shell clássico.
 * Login na web; JWT espelhado no nativo (AsyncStorage + Supabase client).
 */
function WebViewModeApp({
  onModeChanged,
}: {
  onModeChanged?: (mode: ChatUIMode) => void;
}) {
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

  const switchToNative = useCallback(async () => {
    await setChatUiModeOverride('hybrid');
    onModeChanged?.('hybrid');
  }, [onModeChanged]);

  return (
    <View style={styles.flex}>
      <WebViewShell
        visible
        sessionPayload={sessionPayload}
        onRemoteSession={handleRemoteSession}
        onRemoteLogout={handleRemoteLogout}
        onReady={() => {
          void onModeChanged;
        }}
      />
      {sessionPayload ? (
        <SafeAreaView
          style={styles.webModeBar}
          edges={['top']}
          pointerEvents="box-none">
          <TouchableOpacity
            style={styles.webModeBtn}
            onPress={() => void switchToNative()}>
            <Text style={styles.webModeText}>Nativo</Text>
          </TouchableOpacity>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function HybridModeApp({
  onModeChanged,
}: {
  onModeChanged?: (mode: ChatUIMode) => void;
}) {
  return (
    <AuthProvider>
      <HybridApp onModeChanged={onModeChanged} />
    </AuthProvider>
  );
}

function RootSwitcher({initialMode}: {initialMode: ChatUIMode}) {
  const [mode, setMode] = useState<ChatUIMode>(initialMode);

  const handleModeChanged = useCallback((next: ChatUIMode) => {
    setMode(next);
  }, []);

  if (mode === 'hybrid') {
    return <HybridModeApp onModeChanged={handleModeChanged} />;
  }

  return <WebViewModeApp onModeChanged={handleModeChanged} />;
}

function App() {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);

  useEffect(() => {
    loadAppPreferences()
      .then(setPrefs)
      .catch(() =>
        setPrefs({theme: 'light', locale: 'pt', uiMode: null}),
      );
  }, []);

  // Root sempre escuro no boot — elimina flash branco entre splash e app.
  return (
    <GestureHandlerRootView
      style={[styles.flex, {backgroundColor: LOADING_BG_DARK}]}>
      {!prefs ? (
        <BootLoadingScreen />
      ) : (
        <SafeAreaProvider
          style={[styles.flex, {backgroundColor: LOADING_BG_DARK}]}>
          <ThemeProvider initialTheme={prefs.theme}>
            <I18nProvider initialLocale={prefs.locale}>
              <RootSwitcher initialMode={prefs.uiMode || env.CHAT_UI_MODE} />
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  webModeBar: {
    position: 'absolute',
    top: 0,
    right: spacing.md,
    zIndex: 120,
  },
  webModeBtn: {
    marginTop: spacing.sm,
    backgroundColor: brand.blue,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  webModeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default Sentry.wrap(App);
