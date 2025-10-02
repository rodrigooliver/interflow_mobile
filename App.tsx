/**
 * Interflow Mobile App
 * WebView para acessar o Interflow
 *
 * @format
 */

import React, {useEffect, useRef, useState} from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  BackHandler,
  Alert,
  Platform,
  ActivityIndicator,
  View,
  AppState,
  AppStateStatus,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
  type Permission,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {LogLevel, OneSignal} from 'react-native-onesignal';
import SplashScreen from 'react-native-splash-screen';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview/lib/WebViewTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import env from './src/config/env';

Sentry.init({
  dsn: env.SENTRY_DSN,
  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,
});

// Tipo para o evento de notificação
interface NotificationEvent {
  notification: {
    additionalData?: {
      url?: string;
      path?: string;
    };
    launchURL?: string;
  };
}

// Configuração do OneSignal - substitua com seu App ID
const ONESIGNAL_APP_ID = env.ONESIGNAL_APP_ID;

// URL base do Interflow
const BASE_URL = env.BASE_URL;
// const BASE_URL = 'https://interflow.interdev.work/app';

// Chave para armazenamento da URL pendente
const PENDING_URL_KEY = 'INTERFLOW_PENDING_URL';

// Função auxiliar para extrair o domínio de uma URL de forma segura
const extractDomain = (url: string): string => {
  // Extrai o domínio de uma URL sem usar o construtor URL
  try {
    // Remover protocolo
    let domain = url.trim();
    if (domain.indexOf('://') > -1) {
      domain = domain.split('://')[1];
    }

    // Remover caminhos e queries
    domain = domain.split('/')[0].split('?')[0].split('#')[0];

    return domain;
  } catch (e) {
    console.error('Erro ao extrair domínio:', e);
    return '';
  }
};

// Função auxiliar para extrair caminho de uma URL
const extractPath = (url: string): string => {
  try {
    // Remover protocolo e domínio
    let path = url.trim();
    if (path.indexOf('://') > -1) {
      path = path.split('://')[1];
      path = path.substring(path.indexOf('/'));
    } else if (path.startsWith('/')) {
      // Já é um caminho
      return path;
    }

    return path;
  } catch (e) {
    console.error('Erro ao extrair caminho:', e);
    return '/';
  }
};

// Função para solicitar permissões de áudio no Android
const requestAudioPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        'android.permission.MODIFY_AUDIO_SETTINGS' as Permission,
      ]);

      const recordAudioGranted =
        granted['android.permission.RECORD_AUDIO'] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const modifyAudioGranted =
        granted['android.permission.MODIFY_AUDIO_SETTINGS' as keyof typeof granted] ===
        PermissionsAndroid.RESULTS.GRANTED;

      if (recordAudioGranted && modifyAudioGranted) {
        console.log('Permissões de áudio concedidas');
        return true;
      } else {
        console.log('Permissões de áudio negadas');
        return false;
      }
    } catch (err) {
      console.error('Erro ao solicitar permissões de áudio:', err);
      Sentry.captureException(err, {
        tags: {
          location: 'requestAudioPermissions',
          type: 'PERMISSIONS',
        },
      });
      return false;
    }
  }
  return true; // iOS não precisa solicitar permissões dessa forma
};

const App = () => {
  const webViewRef = useRef<WebView | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [url, setUrl] = useState(BASE_URL);
  const [initialUrlLoaded, setInitialUrlLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webViewCanGoBack, setWebViewCanGoBack] = useState(false);
  const [isWebViewVisible, setIsWebViewVisible] = useState(true);
  const lastNotificationRef = useRef<NotificationEvent | null>(null);
  const appStateSubscription = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);
  const backHandlerSubscription = useRef<ReturnType<typeof BackHandler.addEventListener> | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundTimeRef = useRef<number | null>(null);
  const currentNavigationStateRef = useRef<WebViewNavigation | null>(null);
  const [error, setError] = useState<{
    type: 'offline' | 'general';
    message: string;
  } | null>(null);
  const [isInChatPage, setIsInChatPage] = useState(false);

  // Limpar recursos quando o componente for desmontado
  useEffect(() => {
    return () => {
      if (appStateSubscription.current) {
        appStateSubscription.current.remove();
      }
      if (backHandlerSubscription.current) {
        backHandlerSubscription.current.remove();
      }
      if (webViewRef.current) {
        webViewRef.current = null;
      }
    };
  }, []);

  // Verificar se há URL pendente no armazenamento ao iniciar
  useEffect(() => {
    const checkPendingUrl = async () => {
      try {
        const pendingUrl = await AsyncStorage.getItem(PENDING_URL_KEY);
        console.log('URL pendente encontrada:', pendingUrl);

        if (pendingUrl) {
          await AsyncStorage.removeItem(PENDING_URL_KEY);
          setUrl(pendingUrl);
          setInitialUrlLoaded(true);
        } else {
          setInitialUrlLoaded(true);
        }
      } catch (error) {
        console.error('Erro ao verificar URL pendente:', error);
        Sentry.captureException(error, {
          tags: {
            location: 'checkPendingUrl',
            type: 'ASYNC_STORAGE',
          },
        });
        setInitialUrlLoaded(true);
      }
    };

    checkPendingUrl();
  }, []);

  useEffect(() => {
    initOneSignal();
    
    // Solicitar permissões de áudio
    requestAudioPermissions();

    appStateSubscription.current = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    setTimeout(() => {
      try {
        if (SplashScreen.hide) {
          SplashScreen.hide();
        }
      } catch (error) {
        console.error('Erro ao esconder splash screen:', error);
        Sentry.captureException(error, {
          tags: {
            location: 'SplashScreen',
            type: 'HIDE',
          },
        });
      }
    }, 1000);

    backHandlerSubscription.current = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress,
    );

    return () => {
      if (appStateSubscription.current) {
        appStateSubscription.current.remove();
      }
      if (backHandlerSubscription.current) {
        backHandlerSubscription.current.remove();
      }
    };
  }, [webViewCanGoBack]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    try {
      // Se o app está indo para background
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // Inicia a contagem do tempo em background apenas neste momento
        backgroundTimeRef.current = Date.now();
      }
      
      // Se o app está voltando para o primeiro plano
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // Calcula o tempo apenas se tiver um valor de início válido
        const timeInBackground = backgroundTimeRef.current ? (Date.now() - backgroundTimeRef.current) : 0;
        
        // Limpa o valor do tempo de background após o cálculo
        backgroundTimeRef.current = null;
        
        // Se ficou muito tempo em background (mais de 3 horas), força um reload para garantir
        if (timeInBackground > 3 * 60 * 60 * 1000) {
          if (webViewRef.current) {
            webViewRef.current.reload();
          }
          return;
        }
        
        // Verificação específica para iOS após retorno do background
        if (Platform.OS === 'ios' && webViewRef.current) {
          // Temporariamente desabilitado - usando apenas onContentProcessDidTerminate
          // Verificação imediata para iOS para detectar perda de conteúdo
          // setTimeout(() => {
          //   if (webViewRef.current && !loading && isWebViewVisible) {
          //     console.log(`iOS: Verificação imediata após retorno do background (tempo em background: ${Math.round(timeInBackground / 1000)}s)`);
          //     checkWhiteScreen();
          //   }
          // }, 100); // Verificação muito rápida
        }
        
        // Verificar integridade do WebView após retornar do background - DESABILITADO
        // scheduleWhiteScreenDetection();
      }

      appState.current = nextAppState;
    } catch (error) {
      console.error('Erro ao processar mudança de estado do app:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'AppState',
          type: 'STATE_CHANGE',
        },
      });
    }
  };

  // Função para verificar URL pendente após retorno do background
  const checkPendingUrl = async () => {
    try {
      const pendingUrl = await AsyncStorage.getItem(PENDING_URL_KEY);

      if (pendingUrl) {
        console.log(
          'URL pendente encontrada ao voltar para o primeiro plano:',
          pendingUrl,
        );

        // Limpar a URL pendente do armazenamento
        await AsyncStorage.removeItem(PENDING_URL_KEY);

        // Navegar para a URL usando script injetado
        if (webViewRef.current) {
          const urlDomain = extractDomain(pendingUrl);
          const baseDomain = extractDomain(BASE_URL);

          if (urlDomain === baseDomain) {
            // É do mesmo domínio, podemos tentar navegar internamente
            const path = extractPath(pendingUrl);
            console.log('Caminho extraído:', path);

            webViewRef.current.injectJavaScript(`
              if (window.navigate) {
                window.navigate("${path}");
              } else if (window.history && window.history.pushState) {
                window.history.pushState({}, '', "${path}");
                const navEvent = new PopStateEvent('popstate');
                window.dispatchEvent(navEvent);
              } else {
                window.location.href = "${pendingUrl}";
              }
              true;
            `);
          } else {
            // URL externa, definir normalmente
            setUrl(pendingUrl);
          }
        } else {
          // WebView não disponível, definir URL diretamente
          setUrl(pendingUrl);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar URL pendente:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'checkPendingUrl',
          type: 'ASYNC_STORAGE',
        },
      });
    }
  };

  const initOneSignal = async () => {
    try {
      // Remove this method to stop OneSignal Debugging
      OneSignal.Debug.setLogLevel(LogLevel.Verbose);

      // Configurar o OneSignal
      OneSignal.initialize(ONESIGNAL_APP_ID);

      // requestPermission will show the native iOS or Android notification permission prompt.
      // We recommend removing the following code and instead using an In-App Message to prompt for notification permission
      OneSignal.Notifications.requestPermission(true);

      // Method for listening for notification clicks
      OneSignal.Notifications.addEventListener('click', async event => {
        try {
          console.log('OneSignal: notification clicked:', event);
          lastNotificationRef.current = event;

          // Processar a notificação
          await processNotification(event);
        } catch (error) {
          console.error('Erro ao processar clique na notificação:', error);
          Sentry.captureException(error, {
            tags: {
              location: 'OneSignal',
              type: 'NOTIFICATION_CLICK',
            },
          });
        }
      });

      // Verificar se a notificação pode ter aberto o app
      OneSignal.Notifications.addEventListener(
        'foregroundWillDisplay',
        event => {
          try {
            console.log('Notificação recebida em primeiro plano:', event);
          } catch (error) {
            console.error(
              'Erro ao processar notificação em primeiro plano:',
              error,
            );
            Sentry.captureException(error, {
              tags: {
                location: 'OneSignal',
                type: 'FOREGROUND_NOTIFICATION',
              },
            });
          }
        },
      );

      // Verificar se há notificação de fundo
      OneSignal.User.pushSubscription.addEventListener('change', event => {
        try {
          console.log('Mudança na assinatura push:', event);
        } catch (error) {
          console.error('Erro ao processar mudança na assinatura push:', error);
          Sentry.captureException(error, {
            tags: {
              location: 'OneSignal',
              type: 'PUSH_SUBSCRIPTION',
            },
          });
        }
      });
    } catch (error) {
      console.error('Erro ao inicializar OneSignal:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'OneSignal',
          type: 'INITIALIZATION',
        },
      });
    }
  };

  // Processar a notificação e navegar para URL correspondente
  const processNotification = async (event: NotificationEvent) => {
    try {
      // Verificar se há dados adicionais na notificação
      if (event.notification.additionalData) {
        const additionalData = event.notification.additionalData as {
          url?: string;
          path?: string;
        };
        console.log('Dados adicionais:', additionalData);

        // Se houver um path nos dados adicionais, navegar para ele usando o React Router
        if (additionalData.path) {
          console.log('Navegando para Path interno:', additionalData.path);

          // Construir a URL completa
          const fullUrl = `${BASE_URL}${
            additionalData.path.startsWith('/')
              ? additionalData.path
              : '/' + additionalData.path
          }`;

          // Verificar se o WebView já foi carregado
          if (!webViewRef.current || !initialUrlLoaded) {
            console.log(
              'WebView não disponível, salvando URL para carregamento posterior:',
              fullUrl,
            );
            // Salvar a URL para quando o app iniciar completamente
            try {
              await AsyncStorage.setItem(PENDING_URL_KEY, fullUrl);
            } catch (error) {
              console.error('Erro ao salvar URL pendente:', error);
              Sentry.captureException(error, {
                tags: {
                  location: 'processNotification',
                  type: 'ASYNC_STORAGE_SAVE',
                },
              });
            }
            return;
          }

          // Usar o React Router interno do WebView para navegar sem recarregar
          try {
            webViewRef.current.injectJavaScript(`
              if (window.navigate) {
                // Se a função de navegação personalizada estiver definida
                window.navigate("${additionalData.path}");
              } else if (window.ReactNativeWebView) {
                // Tentar usar o React Router diretamente
                try {
                  const router = window.ReactNativeWebView.router || window.router;
                  if (router && router.navigate) {
                    router.navigate("${additionalData.path}");
                  } else if (window.history && window.history.pushState) {
                    // Fallback para history API
                    window.history.pushState({}, '', "${additionalData.path}");
                    // Disparar um evento para que o React Router detecte a mudança
                    const navEvent = new PopStateEvent('popstate');
                    window.dispatchEvent(navEvent);
                  }
                } catch (e) {
                  console.error("Erro ao navegar:", e);
                  // Se tudo falhar, mudar a URL diretamente
                  window.location.href = "${fullUrl}";
                }
              }
              true;
            `);
          } catch (error) {
            console.error('Erro ao injetar JavaScript:', error);
            Sentry.captureException(error, {
              tags: {
                location: 'processNotification',
                type: 'JAVASCRIPT_INJECTION',
              },
            });
            // Fallback: definir URL diretamente
            setUrl(fullUrl);
          }
        }
        // Se houver uma URL completa
        else if (additionalData.url) {
          console.log('Navegando para URL:', additionalData.url);

          // Verificar se o WebView já foi carregado
          if (!webViewRef.current || !initialUrlLoaded) {
            console.log(
              'WebView não disponível, salvando URL para carregamento posterior:',
              additionalData.url,
            );
            // Salvar a URL para quando o app iniciar completamente
            try {
              await AsyncStorage.setItem(PENDING_URL_KEY, additionalData.url);
            } catch (error) {
              console.error('Erro ao salvar URL pendente:', error);
              Sentry.captureException(error, {
                tags: {
                  location: 'processNotification',
                  type: 'ASYNC_STORAGE_SAVE',
                },
              });
            }
            return;
          }

          try {
            // Extrair domínios usando funções auxiliares
            const urlDomain = extractDomain(additionalData.url);
            const baseDomain = extractDomain(BASE_URL);

            console.log('Comparando domínios:', urlDomain, baseDomain);

            if (urlDomain === baseDomain) {
              // É do mesmo domínio, podemos tentar navegar internamente
              const path = extractPath(additionalData.url);
              console.log('Caminho extraído:', path);

              webViewRef.current.injectJavaScript(`
                if (window.navigate) {
                  window.navigate("${path}");
                } else if (window.history && window.history.pushState) {
                  window.history.pushState({}, '', "${path}");
                  const navEvent = new PopStateEvent('popstate');
                  window.dispatchEvent(navEvent);
                } else {
                  window.location.href = "${additionalData.url}";
                }
                true;
              `);
            } else {
              // URL externa, definir normalmente
              setUrl(additionalData.url);
            }
          } catch (e) {
            // URL inválida ou erro ao analisar, fallback para comportamento padrão
            console.error('Erro ao analisar URL:', e);
            Sentry.captureException(e, {
              tags: {
                location: 'processNotification',
                type: 'URL_ANALYSIS',
              },
            });
            setUrl(additionalData.url);
          }
        }
      } else if (event.notification.launchURL) {
        // Se houver uma URL de lançamento, tentar o mesmo processo
        const launchURL = event.notification.launchURL;
        console.log('Navegando para URL de lançamento:', launchURL);

        // Verificar se o WebView já foi carregado
        if (!webViewRef.current || !initialUrlLoaded) {
          console.log(
            'WebView não disponível, salvando URL para carregamento posterior:',
            launchURL,
          );
          // Salvar a URL para quando o app iniciar completamente
          try {
            await AsyncStorage.setItem(PENDING_URL_KEY, launchURL);
          } catch (error) {
            console.error('Erro ao salvar URL pendente:', error);
            Sentry.captureException(error, {
              tags: {
                location: 'processNotification',
                type: 'ASYNC_STORAGE_SAVE',
              },
            });
          }
          return;
        }

        try {
          // Extrair domínios usando funções auxiliares
          const urlDomain = extractDomain(launchURL);
          const baseDomain = extractDomain(BASE_URL);

          if (urlDomain === baseDomain) {
            // É do mesmo domínio, podemos tentar navegar internamente
            const path = extractPath(launchURL);

            webViewRef.current.injectJavaScript(`
              if (window.navigate) {
                window.navigate("${path}");
              } else if (window.history && window.history.pushState) {
                window.history.pushState({}, '', "${path}");
                const navEvent = new PopStateEvent('popstate');
                window.dispatchEvent(navEvent);
              } else {
                window.location.href = "${launchURL}";
              }
              true;
            `);
          } else {
            // URL externa, definir normalmente
            setUrl(launchURL);
          }
        } catch (e) {
          // URL inválida ou erro ao analisar, fallback para comportamento padrão
          console.error('Erro ao analisar URL de lançamento:', e);
          Sentry.captureException(e, {
            tags: {
              location: 'processNotification',
              type: 'LAUNCH_URL_ANALYSIS',
            },
          });
          setUrl(launchURL);
        }
      }
    } catch (error) {
      console.error('Erro ao processar notificação:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'processNotification',
          type: 'GENERAL_ERROR',
        },
      });
    }
  };

  // Função para lidar com mensagens do WebView
  // Nota: Para problemas de tela branca/crash de processo, usamos:
  // - iOS: onContentProcessDidTerminate (quando processo de conteúdo é terminado)
  // - Android: onRenderProcessGone (quando processo de renderização trava/termina)
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Verificar clique em link (específico para Android)
      if (data.type === 'linkClicked' && Platform.OS === 'android') {
        // console.log('Link clicado detectado:', data.url);
        // Interromper o loading imediatamente para links internos
        setLoading(false);
        
        // Verificar se precisamos atualizar a referência de URL atual
        if (data.url && data.url !== currentNavigationStateRef.current?.url) {
          // Atualizar a referência de URL atual para navegação interna
          if (currentNavigationStateRef.current) {
            currentNavigationStateRef.current.url = data.url;
          }
        }
      }
      // Verificar se é uma mensagem de login
      else if (data.type === 'login' && data.userId) {
        console.log(
          'Login detectado, registrando userId no OneSignal:',
          data.userId,
        );
        // Login no OneSignal com o ID externo do usuário
        OneSignal.login(data.userId);
      }
      // Verificar se é uma mensagem de logout
      else if (data.type === 'logout') {
        console.log('Logout detectado, deslogando do OneSignal');
        // Logout do OneSignal
        OneSignal.logout();
      }
      // Verificar se a página foi completamente carregada
      else if (data.type === 'pageFullyLoaded') {
        console.log('Página completamente carregada:', data.url);
      }
      // Verificar se o gesto do iOS foi simulado com sucesso
      else if (data.type === 'iosGestureSimulated') {
        console.log('Gesto de voltar do iOS simulado com sucesso');
      }
      // Verificar se o botão voltar do chat foi simulado
      else if (data.type === 'chatBackButtonSimulated') {
        console.log('Botão voltar do chat simulado com sucesso');
        // Opcional: Executar alguma ação adicional se necessário
      }
    } catch (error) {
      console.error('Erro ao processar mensagem do WebView:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'handleWebViewMessage',
        },
      });
    }
  };

  const handleBackPress = () => {
    try {
      // Se estivermos na página de chat, enviar mensagem para o WebView simular o clique no botão voltar
      if (isInChatPage) {
        if (webViewRef.current) {
          // Enviar mensagem para o WebView executar a função handleBackClick
          webViewRef.current.injectJavaScript(`
            (function() {
              try {
                // Verificar se existe a função handleBackClick ou se podemos simular o clique no botão
                const backButton = document.querySelector('[data-testid="back-button"], .back-button, button[aria-label*="voltar"], button[aria-label*="back"]');
                if (backButton && typeof backButton.click === 'function') {
                  backButton.click();
                  return true;
                }
                
                // Se não encontrou o botão, tentar navegar para /app/chats
                if (window.navigate) {
                  window.navigate('/app/chats');
                } else if (window.history && window.history.pushState) {
                  window.history.pushState({}, '', '/app/chats');
                  const navEvent = new PopStateEvent('popstate');
                  window.dispatchEvent(navEvent);
                } else {
                  window.location.href = '${BASE_URL}/chats';
                }
                
                // Notificar o app nativo que o gesto foi simulado
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'chatBackButtonSimulated',
                  timestamp: Date.now()
                }));
              } catch (error) {
                console.error('Erro ao simular botão voltar do chat:', error);
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  error: error.message,
                  location: 'chatBackButtonSimulation'
                }));
              }
            })();
            true;
          `);
        }
        return true; // Interceptar o evento de voltar
      }
      
      // Comportamento padrão para outras páginas
      if (webViewCanGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      } else {
        // Perguntar se o usuário deseja sair do aplicativo
        Alert.alert(
          'Sair do Interflow',
          'Tem certeza que deseja sair do aplicativo?',
          [
            {text: 'Cancelar', style: 'cancel', onPress: () => {}},
            {
              text: 'Sair',
              style: 'destructive',
              onPress: () => {
                try {
                  BackHandler.exitApp();
                } catch (error) {
                  console.error('Erro ao sair do aplicativo:', error);
                  Sentry.captureException(error, {
                    tags: {
                      location: 'BackHandler',
                      type: 'EXIT_APP',
                    },
                  });
                }
              },
            },
          ],
          {cancelable: true},
        );
        return true;
      }
    } catch (error) {
      console.error('Erro ao processar botão voltar:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'BackHandler',
          type: 'BACK_PRESS',
        },
      });
      return true;
    }
  };

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    try {
      // Armazenar o estado atual da navegação para referência
      currentNavigationStateRef.current = navState;
      setWebViewCanGoBack(navState.canGoBack);
      
      // Detectar se estamos na página de chat
      const url = navState.url;
      const isChatPage = url.includes('/app/chat/') || (url.includes('/app/chats/') && !!url.match(/\/app\/chats\/[^/]+$/));
      setIsInChatPage(isChatPage);
      
      if (isChatPage) {
        console.log('Página de chat detectada, desabilitando gesto nativo do iOS:', url);
      }
      
      // Verificar se a página está carregando
      if (navState.loading) {
        // Já está indicado como carregando, não precisa fazer nada
      } else {
        // Se não está carregando mas o estado de loading ainda está ativo, desativar
        // Este é um fix específico para problemas de loading infinito no Android
        setLoading(false);
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          location: 'onNavigationStateChange',
        },
      });
    }
  };

  // Handler quando o WebView terminar de carregar
  const handleLoadEnd = () => {
    try {
      // Desativar o loading imediatamente
      setLoading(false);
      setInitialUrlLoaded(true);
      setIsWebViewVisible(true);

      // Verificar se há uma notificação que abriu o app
      if (lastNotificationRef.current) {
        console.log(
          'Processando notificação após WebView carregar:',
          lastNotificationRef.current,
        );
        processNotification(lastNotificationRef.current);
        lastNotificationRef.current = null;
      } else {
        // Verificar no AsyncStorage se há uma URL pendente
        checkPendingUrl();
      }
    } catch (error) {
      console.error('Erro ao processar carregamento do WebView:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'WebView',
          type: 'LOAD_END',
        },
      });
      setLoading(false);
      setInitialUrlLoaded(true);
      setIsWebViewVisible(true);
    }
  };

  // Handler quando o WebView começar a carregar
  const handleLoadStart = () => {
    try {
      // Verificar se é navegação interna ou externa
      // Para navegação interna, evitamos mostrar o loading
      if (currentNavigationStateRef.current) {
        const currentUrl = currentNavigationStateRef.current.url;
        const currentDomain = extractDomain(currentUrl);
        const baseDomain = extractDomain(BASE_URL);
        
        // Se estamos no mesmo domínio, provavelmente é navegação via SPA
        // Não mostramos o loading para navegação interna
        if (currentDomain === baseDomain) {
          // Nem sequer ativar o loading para navegação interna no mesmo domínio
          console.log('Navegação interna detectada, evitando loading');
          return;
        }
      }
      
      // Se chegou aqui, é navegação externa ou primeira carga, mostrar loading
      setLoading(true);
      
      // Configurar um timeout de segurança para o loading
      // Garante que o loading não fica preso infinitamente, especialmente no Android
      if (Platform.OS === 'android') {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        retryTimeoutRef.current = setTimeout(() => {
          setLoading(false);
        }, 5000); // 5 segundos de timeout máximo para loading
      }
    } catch (error) {
      console.error(
        'Erro ao processar início de carregamento do WebView:',
        error,
      );
      Sentry.captureException(error, {
        tags: {
          location: 'WebView',
          type: 'LOAD_START',
        },
      });
    }
  };

  // Otimizar o JavaScript injetado para reduzir uso de memória
  const INJECTED_JAVASCRIPT = `
    (function() {
      try {
        // Configurar informações do ambiente nativo
        window.nativeEnvironment = {
          isNativeApp: true,
          platform: '${Platform.OS}',
          version: '${Platform.Version}',
          appVersion: '1.0.0',
          deviceId: 'Interflow Mobile',
          isStandalone: true,
          hasNotifications: true,
          timestamp: Date.now()
        };

        // Manter compatibilidade com código existente
        window.isNativeApp = true;

        // Adicionar métodos de comunicação com o app nativo
        window.nativeApp = {
          // Método para verificar se está no app nativo
          isNative: function() {
            return true;
          },
          
          // Método para obter informações do ambiente
          getEnvironment: function() {
            return window.nativeEnvironment;
          },

          // Método para verificar se tem notificações disponíveis
          hasNotifications: function() {
            return true;
          },

          // Método para registrar para notificações
          registerForNotifications: function(userId) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'login',
                userId: userId
              }));
              return true;
            }
            return false;
          },

          // Método para desregistrar notificações
          unregisterFromNotifications: function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'logout'
              }));
              return true;
            }
            return false;
          }
        };

        // Adicionar meta tag para identificar o app
        const meta = document.createElement('meta');
        meta.name = 'app-version';
        meta.content = 'Interflow Native App 1.0.0';
        document.head.appendChild(meta);

        // Adicionar classe CSS ao body para estilização específica
        document.body.classList.add('native-app');
        document.body.classList.add('dark');
        document.body.classList.add('platform-${Platform.OS}');

        // Remover elementos desnecessários para uma experiência mais nativa
        const style = document.createElement('style');
        style.innerHTML = \`
          body {
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
            user-select: none;
            padding: 2px 0 !important;
          }
          
          ::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
          
          input, textarea {
            font-size: 16px !important;
          }

          .fixed-header, .sticky-top, header, nav {
            top: 2px !important;
          }

          .fixed-footer, footer {
            bottom: 2px !important;
          }

          /* Estilos específicos para o app nativo */
          .native-app {
            /* Adicione estilos específicos aqui */
          }

          /* Estilos específicos para cada plataforma */
          .platform-ios {
            /* Estilos específicos para iOS - permitir scroll natural */
          }

          .platform-android {
            /* Estilos específicos para Android */
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
            overscroll-behavior: none !important;
          }
        \`;
        document.head.appendChild(style);
        
        // Desabilitar zoom
        const viewportMeta = document.querySelector('meta[name="viewport"]') || document.createElement('meta');
        viewportMeta.name = 'viewport';
        viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        if (!document.querySelector('meta[name="viewport"]')) {
          document.head.appendChild(viewportMeta);
        }

        // Adicionar evento para detectar quando o DOM estiver pronto
        document.addEventListener('DOMContentLoaded', function() {
          try {
            document.body.style.margin = '2px 0';
            
            // Desabilitar completamente a rolagem no Android
            if ('${Platform.OS}' === 'android') {
              // Prevenir qualquer tipo de rolagem no documento
              document.body.addEventListener('touchmove', function(e) {
                e.preventDefault();
              }, { passive: false });
              
              // Evitar que a página role quando o teclado virtual aparecer
              window.addEventListener('resize', function() {
                document.body.style.height = window.innerHeight + 'px';
              });
              
              // Desativar eventos de rolagem
              ['scroll', 'mousewheel', 'wheel', 'DOMMouseScroll'].forEach(function(event) {
                window.addEventListener(event, function(e) {
                  e.preventDefault();
                }, { passive: false });
              });
            } else if ('${Platform.OS}' === 'ios') {
              // iOS: manter comportamento de scroll natural para inputs
              // Remover qualquer style que impeça o scroll quando teclado aparecer
              document.documentElement.style.overflow = '';
              document.body.style.overflow = '';
              document.body.style.position = '';
              document.body.style.height = '';
              
              // Garantir que inputs sejam visíveis quando focados
              document.addEventListener('focusin', function(e) {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                  setTimeout(function() {
                    e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 300); // Aguardar o teclado aparecer
                }
              });
            }
            
            // Disparar evento customizado para notificar que o app está pronto
            const nativeAppReadyEvent = new CustomEvent('nativeAppReady', {
              detail: window.nativeEnvironment
            });
            window.dispatchEvent(nativeAppReadyEvent);
            document.dispatchEvent(nativeAppReadyEvent);
            
            // Corrigir o comportamento dos links para evitar o problema de carregamento infinito no Android
            if ('${Platform.OS}' === 'android') {
              // Interceptar cliques em links para melhorar a navegação no Android
              document.addEventListener('click', function(e) {
                // Verificar se o clique foi em um link
                let target = e.target;
                while (target && target.tagName !== 'A') {
                  target = target.parentElement;
                }
                
                // Se for um link, verificar se é do mesmo domínio
                if (target && target.tagName === 'A' && target.href) {
                  const url = target.href;
                  const currentDomain = window.location.hostname;
                  
                  try {
                    // Verificar se é um link interno (mesmo domínio)
                    const urlObj = new URL(url);
                    if (urlObj.hostname === currentDomain) {
                      // Cancelar o comportamento padrão do link para navegação interna
                      // isso evita que o WebView inicie o processo de carregamento
                      e.preventDefault();
                      
                      // Notificar o app nativo que um link foi clicado
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'linkClicked',
                        url: url
                      }));
                      
                      // Para links internos, usar history API para navegação sem carregamento
                      // Isso funciona para aplicações SPA como React Router
                      if (url.indexOf('#') > -1) {
                        // Se for link com hash/âncora, manter comportamento padrão
                        window.location.href = url;
                      } else {
                        // Para outros links internos, tentar navegar com história
                        const path = url.replace(window.location.origin, '');
                        window.history.pushState({}, '', path);
                        
                        // Disparar evento para o React Router detectar a mudança
                        const navEvent = new PopStateEvent('popstate');
                        window.dispatchEvent(navEvent);
                      }
                    }
                  } catch(err) {
                    console.error('Erro ao processar URL do link:', err);
                  }
                }
              }, false);
            }
            
            // Monitorar as mudanças de rota
            if (typeof window.navigate !== 'function') {
              // Tentar detectar o React Router e configurar a função de navegação
              setTimeout(() => {
                try {
                  // Procurar por objetos do React Router no DOM
                  const routerElements = document.querySelectorAll('[data-reactroot]');
                  if (routerElements.length > 0) {
                    console.log('React Router detectado');
                    
                    // Tentar encontrar o Router no React.__SECRET_INTERNALS__
                    if (window.React && window.React.__SECRET_INTERNALS__) {
                      console.log('React internals encontrado');
                    }
                  }
                } catch (e) {
                  console.error('Erro ao detectar React Router:', e);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    error: e.message,
                    location: 'ReactRouterDetection'
                  }));
                }
              }, 1000);
            }
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              error: error.message,
              location: 'DOMContentLoaded'
            }));
          }
        });

        // Adicionar listener para o evento 'pageshow' (importante para iOS)
        window.addEventListener('pageshow', function(event) {
          if (event.persisted) {
            // A página foi restaurada do cache (bfcache) - comum no iOS
            console.log('Página restaurada do cache do navegador');
            
            // Notificar o app nativo
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageshow',
                persisted: true,
                timestamp: Date.now()
              }));
            }
          }
        });

        // Adicionar detector de erro de renderização
        window.addEventListener('error', function(event) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'renderError',
              message: event.message,
              timestamp: Date.now()
            }));
          }
        });
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          error: error.message,
          location: 'INJECTED_JAVASCRIPT'
        }));
      }
    })();
  `;

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#111827"
        translucent={Platform.OS === 'android'}
      />
      <SafeAreaView style={styles.container}>
        <View
          style={[
            styles.webviewContainer,
            Platform.OS === 'ios' ? styles.iosWebviewContainer : null,
          ]}>
          <WebView
            ref={webViewRef}
            source={{uri: url}}
            style={[
              styles.webview,
              !isWebViewVisible && styles.webviewHidden
            ]}
            onNavigationStateChange={onNavigationStateChange}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            onShouldStartLoadWithRequest={(request) => {
              // Interceptar requisições para determinar se deve mostrar o loading
              // Esta função é chamada antes de carregar qualquer URL
              if (Platform.OS === 'android') {
                const requestDomain = extractDomain(request.url);
                const baseDomain = extractDomain(BASE_URL);
                
                // Se for do mesmo domínio, provavelmente é navegação interna
                if (requestDomain === baseDomain) {
                  // Desativar o loading imediatamente para navegação interna
                  setLoading(false);
                }
              }
              // Sempre permitir a carga da URL
              return true;
            }}
            onLoadProgress={({nativeEvent}) => {
              // Fix adicional para o problema de carregamento no Android
              if (Platform.OS === 'android') {
                // Quando o progresso estiver em 30% ou mais, já podemos considerar
                // que a página está carregando corretamente e começar a esconder o loading
                if (nativeEvent.progress >= 0.3) {
                  setLoading(false);
                }
              }
            }}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={!isInChatPage}
            pullToRefreshEnabled={true}
            cacheEnabled={true}
            cacheMode="LOAD_DEFAULT"
            incognito={false}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            allowsLinkPreview={false}
            bounces={true}
            scrollEnabled={Platform.OS === 'ios' ? true : false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            contentInset={{top: 0, left: 0, bottom: 0, right: 0}}
            automaticallyAdjustContentInsets={Platform.OS === 'ios' ? true : false}
            mediaPlaybackRequiresUserAction={false}
            keyboardDisplayRequiresUserAction={false}
            allowsProtectedMedia={true}
            geolocationEnabled={true}
            onError={syntheticEvent => {
              const {nativeEvent} = syntheticEvent;
              setIsWebViewVisible(false);
              
              // Extrair apenas as propriedades relevantes do erro
              const errorInfo = {
                code: nativeEvent.code,
                description: nativeEvent.description,
                domain: nativeEvent.domain,
                url: nativeEvent.url,
                timestamp: new Date().toISOString()
              };
              
              console.warn('WebView error:', errorInfo);
              
              // Verificar se é um erro de conexão
              if (errorInfo.description?.toLowerCase().includes('offline') || 
                  errorInfo.description?.toLowerCase().includes('no internet connection')) {
                setError({
                  type: 'offline',
                  message: 'Parece que você está sem conexão com a internet. Verifique sua conexão e tente novamente.'
                });
              } else {
                setError({
                  type: 'general',
                  message: 'Ocorreu um erro ao carregar a página. Tente novamente mais tarde.'
                });
              }
              
              // Criar um objeto de erro mais simples e serializável
              const error = new Error(errorInfo.description || 'WebView error');
              error.name = 'WebViewError';
              
              Sentry.captureException(error, {
                tags: {
                  location: 'WebView',
                  type: 'ERROR',
                  code: errorInfo.code,
                  domain: errorInfo.domain,
                  url: errorInfo.url
                },
                extra: {
                  errorInfo
                }
              });

              // Tentar recarregar após um erro
              if (webViewRef.current) {
                setTimeout(() => {
                  webViewRef.current?.reload();
                }, 3000);
              }
            }}
            onHttpError={syntheticEvent => {
              const {nativeEvent} = syntheticEvent;
              const errorInfo = {
                statusCode: nativeEvent.statusCode,
                url: nativeEvent.url,
                timestamp: new Date().toISOString()
              };
              
              console.warn('WebView HTTP error:', errorInfo);
              
              // Criar um objeto de erro mais simples e serializável
              const error = new Error(`HTTP Error ${nativeEvent.statusCode}`);
              error.name = 'WebViewHttpError';
              
              Sentry.captureException(error, {
                tags: {
                  location: 'WebView',
                  type: 'HTTP_ERROR',
                  statusCode: nativeEvent.statusCode,
                  url: nativeEvent.url
                },
                extra: {
                  errorInfo
                }
              });
            }}
            onContentProcessDidTerminate={() => {
              // Esta função é chamada quando o processo de conteúdo do WebView é terminado
              // Isso é comum no iOS quando o app fica em background por um tempo
              // console.log('iOS: Processo de conteúdo do WebView foi terminado, recarregando...');
              
              Sentry.captureMessage('iOS WebView content process terminated', {
                level: 'warning',
                tags: {
                  platform: Platform.OS,
                  location: 'onContentProcessDidTerminate'
                },
                extra: {
                  url: currentNavigationStateRef.current?.url || 'unknown',
                  timestamp: new Date().toISOString()
                }
              });
              
              // Recarregar o WebView imediatamente
              if (webViewRef.current) {
                // console.log('Recarregando WebView após terminação do processo de conteúdo');
                webViewRef.current.reload();
              }
              
              // Garantir que o loading seja mostrado
              setLoading(true);
            }}
            onRenderProcessGone={(syntheticEvent) => {
              // Esta função é chamada quando o processo de renderização do WebView trava 
              // ou é terminado pelo sistema operacional no Android (API 26+)
              const { nativeEvent } = syntheticEvent;
              // console.log('Android: Processo de renderização do WebView foi terminado/travou, recarregando...');
              // console.log('Detalhes do crash:', nativeEvent.didCrash);
              
              Sentry.captureMessage('Android WebView render process gone', {
                level: 'warning',
                tags: {
                  platform: Platform.OS,
                  location: 'onRenderProcessGone',
                  didCrash: nativeEvent.didCrash
                },
                extra: {
                  didCrash: nativeEvent.didCrash,
                  url: currentNavigationStateRef.current?.url || 'unknown',
                  timestamp: new Date().toISOString()
                }
              });
              
              // Recarregar o WebView imediatamente
              if (webViewRef.current) {
                // console.log('Recarregando WebView após processo de renderização terminado');
                webViewRef.current.reload();
              }
              
              // Garantir que o loading seja mostrado
              setLoading(true);
            }}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ffffff" />
              </View>
            )}
          />
        </View>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        )}
        {error && (
          <View style={styles.errorContainer}>
            <View style={styles.errorContent}>
              <ActivityIndicator 
                size="large" 
                color="#3B82F6" 
                style={styles.errorIcon}
              />
              <Text style={styles.errorTitle}>
                {error.type === 'offline' ? 'Sem Conexão' : 'Erro ao Carregar'}
              </Text>
              <Text style={styles.errorMessage}>
                {error.message}
              </Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={() => {
                  setError(null);
                  setIsWebViewVisible(true);
                  if (webViewRef.current) {
                    webViewRef.current.reload();
                  }
                }}
              >
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.retryButtonText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    // Remover margem negativa que estava causando o corte na parte inferior do Android
    marginBottom: Platform.OS === 'android' ? 0 : -20,
    marginTop: Platform.OS === 'android' ? 0 : -5,
    paddingTop: Platform.OS === 'android' ? 20 : 0,
  },
  webviewContainer: {
    flex: 1,
    marginVertical: 2,
    backgroundColor: '#111827',
  },
  iosWebviewContainer: {
    paddingBottom: 1,
  },
  webview: {
    flex: 1,
    marginTop: 0,
    marginBottom: Platform.OS === 'android' ? 0 : -2,
    height: '100%',
    width: '100%',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: '#111827',
    overflow: 'hidden', // Para garantir que o conteúdo não saia dos limites
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333333',
  },
  webviewHidden: {
    opacity: 0,
    height: 0,
    width: 0,
  },
  errorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default Sentry.wrap(App);
