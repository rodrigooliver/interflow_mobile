import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  BackHandler,
  Platform,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import SplashScreen from 'react-native-splash-screen';
import {SafeAreaView} from 'react-native-safe-area-context';
import {OneSignal, LogLevel} from 'react-native-onesignal';
import * as Sentry from '@sentry/react-native';
import {useAuth} from '../contexts/AuthContext';
import {useTheme} from '../contexts/ThemeContext';
import {ChatThreadScreen} from '../screens/chat/ChatThreadScreen';
import {MessageDetailsScreen} from '../screens/chat/MessageDetailsScreen';
import {MainTabs} from './MainTabs';
import WebViewShell from '../webview/WebViewShell';
import type {AuthSessionPayload} from '../bridge/authProtocol';
import {extractChatIdFromPath, isChatPath} from '../bridge/authProtocol';
import env from '../config/env';
import type {ChatUIMode} from '../config/env';
import {colors, radii, spacing} from '../theme/tokens';
import {clearMirroredSession, mirrorWebSession} from '../services/sessionMirror';
import type {ChatMessage} from '../services/chatsApi';

export type HybridStackParamList = {
  MainTabs: undefined;
  ChatThread: {chatId: string; title?: string};
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
  const {colors: theme} = useTheme();

  const [webVisible, setWebVisible] = useState(false);
  const [webPath, setWebPath] = useState<string | null>(null);
  const [webReady, setWebReady] = useState(false);
  const swapStartedAtRef = useRef<number | null>(null);
  const onesignalReady = useRef(false);

  useEffect(() => {
    try {
      if (SplashScreen.hide) SplashScreen.hide();
    } catch {
      // ignore
    }
  }, []);

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

  useEffect(() => {
    if (pendingNativeChat && navigationRef.current && session) {
      navigationRef.current.navigate('ChatThread', {chatId: pendingNativeChat});
      setPendingNativeChat(null);
      pendingNativeChatRef.current = null;
    }
  }, [pendingNativeChat, session]);

  const sessionPayload = useMemo(
    () => getSessionPayload(),
    [getSessionPayload, session],
  );

  const openWeb = useCallback(
    (path: string) => {
      swapStartedAtRef.current = Date.now();
      setWebPath(null);
      requestAnimationFrame(() => {
        setWebPath(path);
        setWebVisible(true);
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
      });
    },
    [webReady],
  );

  const closeWeb = useCallback(() => {
    setWebVisible(false);
    setWebPath(null);
  }, []);

  useEffect(() => {
    if (!webVisible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeWeb();
      return true;
    });
    return () => sub.remove();
  }, [webVisible, closeWeb]);

  const handleRemoteSession = useCallback(
    async (payload: AuthSessionPayload) => {
      const result = await mirrorWebSession(payload);
      if (!result.ok) {
        console.warn('[HybridApp] mirror JWT falhou:', result.error);
      }
      await applyRemoteSession(payload);
      setWebVisible(false);
      setWebPath(null);
    },
    [applyRemoteSession],
  );

  const handleRemoteLogout = useCallback(async () => {
    await clearMirroredSession();
    await signOut();
    setWebVisible(true);
    setWebPath('/login');
  }, [signOut]);

  const needsWebLogin = !loading && !session;
  const showWeb = needsWebLogin || webVisible;

  useEffect(() => {
    if (needsWebLogin) {
      setWebVisible(true);
      setWebPath(prev => prev || '/login');
    }
  }, [needsWebLogin]);

  if (loading) {
    return (
      <View style={[styles.centered, {backgroundColor: theme.pageBg}]}>
        <StatusBar
          barStyle={theme.statusBarStyle}
          backgroundColor={theme.pageBg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
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
                    navigationRef.current?.navigate('ChatThread', {
                      chatId,
                      title,
                    })
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
          sessionPayload={sessionPayload}
          pendingPath={needsWebLogin ? '/login' : webPath}
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
          onNativeChatNavigate={(chatId, path) => {
            if (!session) return false;
            if (chatId) {
              closeWeb();
              navigationRef.current?.navigate('ChatThread', {chatId});
              return true;
            }
            if (isChatPath(path)) {
              closeWeb();
              navigationRef.current?.navigate('MainTabs');
              return true;
            }
            return false;
          }}
        />
        {showWeb && session ? (
          <SafeAreaView style={styles.webCloseBar} edges={['top']}>
            <TouchableOpacity style={styles.webCloseBtn} onPress={closeWeb}>
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
