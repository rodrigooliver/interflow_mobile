import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Text,
  BackHandler,
  Platform,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import {OneSignal, LogLevel} from 'react-native-onesignal';
import * as Sentry from '@sentry/react-native';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {ChatThreadScreen} from '../screens/chat/ChatThreadScreen';
import {MessageDetailsScreen} from '../screens/chat/MessageDetailsScreen';
import {MainTabs} from './MainTabs';
import WebViewShell from '../webview/WebViewShell';
import {LoadingScreen, loadingBackground} from '../components/LoadingScreen';
import type {AuthSessionPayload} from '../bridge/authProtocol';
import {
  extractChatIdFromPath,
  isChatPath,
  isEmbeddedWebChromePath,
} from '../bridge/authProtocol';
import env from '../config/env';
import type {ChatUIMode} from '../config/env';
import {colors, radii, spacing} from '../theme/tokens';
import {applyThemeStatusBar} from '../theme/statusBar';
import {clearMirroredSession, mirrorWebSession} from '../services/sessionMirror';
import type {ChatMessage} from '../services/chatsApi';

export type HybridStackParamList = {
  MainTabs: undefined;
  ChatThread: {chatId: string; title?: string; refreshKey?: number};
  MessageDetails: {
    chatId: string;
    message: ChatMessage;
    channelType?: string | null;
  };
};

const Stack = createNativeStackNavigator<HybridStackParamList>();

interface HybridAppProps {
  onModeChanged?: (mode: ChatUIMode) => void;
}

export function HybridApp({onModeChanged}: HybridAppProps) {
  const {
    session,
    loading,
    signOut,
    applyRemoteSession,
    getSessionPayload,
    lastAuthEvent,
  } = useAuth();
  const {theme: themeMode, colors: theme} = useTheme();

  const [webVisible, setWebVisible] = useState(false);
  const [webPath, setWebPath] = useState<string | null>(null);
  /** Força re-navegação mesmo quando o path é o mesmo de antes */
  const [webPathNonce, setWebPathNonce] = useState(0);
  const [webReady, setWebReady] = useState(false);
  const [webChrome, setWebChrome] = useState<{
    loading: boolean;
    hasError: boolean;
    currentPath: string | null;
  }>({loading: false, hasError: false, currentPath: null});
  const swapStartedAtRef = useRef<number | null>(null);
  const onesignalReady = useRef(false);
  /** true quando o usuário abriu o WebView para navegar (cliente, settings…), não login */
  const webBrowseModeRef = useRef(false);

  useEffect(() => {
    if (!loading) {
      applyThemeStatusBar(themeMode);
    }
  }, [loading, themeMode]);

  useEffect(() => {
    if (onesignalReady.current) return;
    onesignalReady.current = true;
    try {
      OneSignal.Debug.setLogLevel(LogLevel.Verbose);
      OneSignal.initialize(env.ONESIGNAL_APP_ID);
      OneSignal.Notifications.requestPermission(true);
      OneSignal.Notifications.addEventListener('click', event => {
        try {
          const data = event?.notification?.additionalData as
            | {url?: string; path?: string}
            | undefined;
          const path = data?.path || data?.url || event?.notification?.launchURL;
          if (!path) return;
          if (isChatPath(path)) {
            const chatId = extractChatIdFromPath(path);
            if (chatId) {
              setWebVisible(false);
              pendingNativeChatRef.current = chatId;
              setPendingNativeChat(chatId);
              return;
            }
          }
          openWeb(path.startsWith('/') ? path : `/${path}`);
        } catch (e) {
          Sentry.captureException(e);
        }
      });
    } catch (e) {
      console.warn('[HybridApp] OneSignal init failed', e);
    }
  }, []);

  const pendingNativeChatRef = useRef<string | null>(null);
  const [pendingNativeChat, setPendingNativeChat] = useState<string | null>(null);
  const navigationRef = useRef<any>(null);

  /** Abre thread nativa; com reload força refetch mesmo se já estiver no mesmo chat. */
  const openNativeChat = useCallback(
    (
      chatId: string,
      options?: {title?: string; reload?: boolean},
    ) => {
      const nav = navigationRef.current;
      if (!nav) return;
      const refreshKey = options?.reload ? Date.now() : undefined;
      const current = nav.getCurrentRoute?.();
      const currentParams = current?.params as
        | HybridStackParamList['ChatThread']
        | undefined;
      if (
        current?.name === 'ChatThread' &&
        currentParams?.chatId === chatId
      ) {
        if (refreshKey != null) {
          nav.setParams({refreshKey});
        }
        return;
      }
      nav.navigate('ChatThread', {
        chatId,
        title: options?.title,
        ...(refreshKey != null ? {refreshKey} : {}),
      });
    },
    [],
  );

  useEffect(() => {
    if (pendingNativeChat && navigationRef.current && session) {
      // Notificação: sempre reload — senão o mesmo chatId não refetch
      openNativeChat(pendingNativeChat, {reload: true});
      setPendingNativeChat(null);
      pendingNativeChatRef.current = null;
    }
  }, [pendingNativeChat, session, openNativeChat]);

  const sessionPayload = useMemo(
    () => getSessionPayload(),
    [getSessionPayload, session],
  );

  const webPathRef = useRef<string | null>(null);
  const webCurrentPathRef = useRef<string | null>(null);
  const webVisibleRef = useRef(false);
  webPathRef.current = webPath;
  webCurrentPathRef.current = webChrome.currentPath;
  webVisibleRef.current = webVisible;

  const openWeb = useCallback(
    (path: string) => {
      const browse = path !== '/login' && !path.startsWith('/login?');
      webBrowseModeRef.current = browse;
      const normalize = (p: string | null | undefined) => {
        if (!p) return '';
        const qIdx = p.indexOf('?');
        const pathname = qIdx >= 0 ? p.slice(0, qIdx) : p;
        const search = qIdx >= 0 ? p.slice(qIdx) : '';
        const base =
          pathname.length > 1 && pathname.endsWith('/')
            ? pathname.slice(0, -1)
            : pathname;
        // Inclui query: trocar ?filter= deve reinjetar navegação
        return base + search;
      };
      const alreadyOnPath =
        webVisibleRef.current &&
        (normalize(webCurrentPathRef.current) === normalize(path) ||
          normalize(webPathRef.current) === normalize(path));

      console.log('[HybridApp] openWeb', {path, browse, alreadyOnPath});
      swapStartedAtRef.current = Date.now();
      setWebVisible(true);

      // Já está na mesma página (path+query): só traz o WebView à frente
      if (alreadyOnPath) {
        setWebPath(path);
        return;
      }

      setWebPath(path);
      setWebPathNonce(n => n + 1);
      if (webReady && swapStartedAtRef.current) {
        Sentry.addBreadcrumb({
          category: 'webview',
          message: 'webview_swap_ms',
          data: {
            webview_swap_ms: Date.now() - swapStartedAtRef.current,
            warm: true,
          },
        });
      }
    },
    [webReady],
  );

  const closeWeb = useCallback((reason = 'manual') => {
    console.log('[HybridApp] closeWeb', {
      reason,
      browse: webBrowseModeRef.current,
      path: webPath,
    });
    webBrowseModeRef.current = false;
    setWebVisible(false);
    setWebPath(null);
  }, [webPath]);

  useEffect(() => {
    if (!webVisible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeWeb('android-back');
      return true;
    });
    return () => sub.remove();
  }, [webVisible, closeWeb]);

  const lastRemoteAccessTokenRef = useRef<string | null>(null);

  // Evita tratar eco da WebView aquecida como "novo login"
  useEffect(() => {
    if (session?.access_token) {
      lastRemoteAccessTokenRef.current = session.access_token;
    }
  }, [session?.access_token]);

  const handleRemoteSession = useCallback(
    async (payload: AuthSessionPayload) => {
      const browsing = webBrowseModeRef.current;
      const sameToken =
        !!payload.access_token &&
        payload.access_token === lastRemoteAccessTokenRef.current;
      console.log('[HybridApp] remoteSession', {
        browsing,
        sameToken,
        userId: payload.user?.id,
      });

      // Mesmo JWT: eco do bridge (getSession / SIGNED_IN pós-hydrate).
      // Não reaplicar nem closeWeb — isso gerava loop infinito.
      if (sameToken) {
        return;
      }

      lastRemoteAccessTokenRef.current = payload.access_token ?? null;

      // Browse (cliente/settings): só espelha JWT, sem setSession nativo
      if (browsing) {
        const result = await mirrorWebSession(payload);
        if (!result.ok) {
          console.warn('[HybridApp] mirror JWT falhou:', result.error);
        }
        return;
      }

      const result = await mirrorWebSession(payload);
      if (!result.ok) {
        console.warn('[HybridApp] mirror JWT falhou:', result.error);
      }
      await applyRemoteSession(payload);
      // Login web → volta pro app.
      closeWeb('remote-session-after-login');
    },
    [applyRemoteSession, closeWeb],
  );

  const handleRemoteLogout = useCallback(async () => {
    await clearMirroredSession();
    await signOut();
    setWebVisible(true);
    setWebPath('/login');
  }, [signOut]);

  const needsWebLogin = !loading && !session;
  const showWeb = needsWebLogin || webVisible;

  /** Precisa do ← App flutuante (loading/erro/página sem chrome). */
  const needsFloatingAppBack =
    showWeb &&
    !!session &&
    (webChrome.loading ||
      webChrome.hasError ||
      !isEmbeddedWebChromePath(webChrome.currentPath || webPath));

  /** Só exibe após delay — se carregar rápido, não aparece. */
  const [floatingAppBackVisible, setFloatingAppBackVisible] = useState(false);

  useEffect(() => {
    if (!needsFloatingAppBack) {
      setFloatingAppBackVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      setFloatingAppBackVisible(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [needsFloatingAppBack]);

  useEffect(() => {
    if (needsWebLogin) {
      setWebVisible(true);
      setWebPath(prev => prev || '/login');
    }
  }, [needsWebLogin]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View
      style={[
        styles.root,
        {backgroundColor: theme.pageBg || loadingBackground(themeMode)},
      ]}>
      <StatusBar
        barStyle={theme.statusBarStyle}
        backgroundColor={theme.pageBg}
      />
      {session ? (
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator screenOptions={{headerShown: false}}>
            <Stack.Screen name="MainTabs">
              {() => (
                <MainTabs
                  onOpenChat={(chatId, title) =>
                    openNativeChat(chatId, {title})
                  }
                  onOpenWeb={openWeb}
                  onSignOut={() => {
                    void handleRemoteLogout();
                  }}
                  onModeChanged={onModeChanged}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="ChatThread"
              options={{animation: 'slide_from_right'}}>
              {({route}) => (
                <ChatThreadScreen
                  chatId={route.params.chatId}
                  title={route.params.title}
                  refreshKey={route.params.refreshKey}
                  onBack={() => navigationRef.current?.goBack()}
                  onOpenWeb={openWeb}
                  onOpenMessageDetails={params =>
                    navigationRef.current?.navigate('MessageDetails', params)
                  }
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="MessageDetails"
              options={{animation: 'slide_from_right'}}>
              {({route}) => (
                <MessageDetailsScreen
                  chatId={route.params.chatId}
                  message={route.params.message}
                  channelType={route.params.channelType}
                  onBack={() => navigationRef.current?.goBack()}
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      ) : null}

      <View
        style={showWeb ? styles.webForeground : styles.webWarm}
        pointerEvents={showWeb ? 'auto' : 'none'}>
        <WebViewShell
          visible={showWeb}
          uiMode="hybrid"
          sessionPayload={sessionPayload}
          pendingPath={needsWebLogin ? '/login' : webPath}
          pendingPathNonce={webPathNonce}
          onRemoteSession={handleRemoteSession}
          onRemoteLogout={handleRemoteLogout}
          nativeAuthEvent={lastAuthEvent}
          disableOneSignalInit
          onReady={() => {
            setWebReady(true);
            if (swapStartedAtRef.current) {
              Sentry.addBreadcrumb({
                category: 'webview',
                message: 'webview_swap_ms',
                data: {
                  webview_swap_ms: Date.now() - swapStartedAtRef.current,
                  warm: webReady,
                },
              });
              swapStartedAtRef.current = null;
            }
          }}
          onCloseWeb={reason => closeWeb(reason || 'web-close')}
          onChromeStateChange={setWebChrome}
          onNativeChatNavigate={(chatId, path) => {
            if (!session) return false;
            if (chatId) {
              console.log('[HybridApp] nativeChatNavigate', {chatId, path});
              closeWeb('native-chat');
              openNativeChat(chatId, {reload: true});
              return true;
            }
            if (isChatPath(path)) {
              console.log('[HybridApp] nativeChatList', {path});
              closeWeb('native-chats-list');
              navigationRef.current?.navigate('MainTabs');
              return true;
            }
            return false;
          }}
        />
        {floatingAppBackVisible ? (
          <SafeAreaView style={styles.webCloseBar} edges={['top']}>
            <TouchableOpacity
              style={styles.webCloseBtn}
              onPress={() => closeWeb('close-button')}>
              <Text style={styles.webCloseText}>← App</Text>
            </TouchableOpacity>
          </SafeAreaView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  centered: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  webWarm: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    zIndex: -1,
  },
  webForeground: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
    zIndex: 100,
  },
  webCloseBar: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    zIndex: 110,
  },
  webCloseBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primaryStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
  },
  webCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
