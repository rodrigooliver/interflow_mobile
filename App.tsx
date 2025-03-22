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

const App = () => {
  const webViewRef = useRef<WebView | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [url, setUrl] = useState(BASE_URL);
  const [initialUrlLoaded, setInitialUrlLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [webViewCanGoBack, setWebViewCanGoBack] = useState(false);
  const lastNotificationRef = useRef<NotificationEvent | null>(null);

  // Verificar se há URL pendente no armazenamento ao iniciar
  useEffect(() => {
    const checkPendingUrl = async () => {
      try {
        const pendingUrl = await AsyncStorage.getItem(PENDING_URL_KEY);
        console.log('URL pendente encontrada:', pendingUrl);

        if (pendingUrl) {
          // Limpar a URL pendente do armazenamento
          await AsyncStorage.removeItem(PENDING_URL_KEY);
          // Definir como URL inicial
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
    // Inicializar o OneSignal assim que o componente montar
    initOneSignal();

    // Monitorar mudanças de estado do aplicativo
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    // Esconder a tela de splash após o carregamento
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

    // Manipular o botão de voltar no Android
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress,
    );

    return () => {
      subscription.remove();
      backHandler.remove();
    };
  }, [webViewCanGoBack]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    try {
      // Se o app está voltando para o primeiro plano
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App voltou para o primeiro plano');
        // Verificar se tem notificação pendente
        checkPendingUrl();
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
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Verificar se é uma mensagem de login
      if (data.type === 'login' && data.userId) {
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
      setWebViewCanGoBack(navState.canGoBack);
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
      setLoading(false);
      setInitialUrlLoaded(true);

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
    }
  };

  // Handler quando o WebView começar a carregar
  const handleLoadStart = () => {
    try {
      setLoading(true);
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

  // Injetar JavaScript para otimizar a experiência do WebView
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
          timestamp: new Date().getTime()
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
          /* Ajustes para melhorar a experiência mobile */
          body {
            -webkit-tap-highlight-color: transparent;
            overscroll-behavior: none;
            touch-action: manipulation;
            user-select: none;
            padding-top: 2px !important;
            padding-bottom: 2px !important;
          }
          
          /* Esconder barra de rolagem */
          ::-webkit-scrollbar {
            display: none;
          }
          
          /* Ajustes para inputs */
          input, textarea {
            font-size: 16px !important; /* Evita zoom em inputs no iOS */
          }

          /* Ajustes para cabeçalhos fixos */
          .fixed-header, .sticky-top, header, nav {
            top: 2px !important;
          }

          /* Ajustes para rodapés fixos */
          .fixed-footer, footer {
            bottom: 2px !important;
          }

          /* Estilos específicos para o app nativo */
          .native-app {
            /* Adicione estilos específicos aqui */
          }

          /* Estilos específicos para cada plataforma */
          .platform-ios {
            /* Estilos específicos para iOS */
          }

          .platform-android {
            /* Estilos específicos para Android */
          }
        \`;
        document.head.appendChild(style);
        
        // Desabilitar zoom
        const viewportMeta = document.querySelector('meta[name="viewport"]');
        if (viewportMeta) {
          viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        } else {
          const newViewportMeta = document.createElement('meta');
          newViewportMeta.name = 'viewport';
          newViewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
          document.head.appendChild(newViewportMeta);
        }

        // Adicionar evento para detectar quando o DOM estiver pronto
        document.addEventListener('DOMContentLoaded', function() {
          try {
            document.body.style.margin = '2px 0';
            
            // Disparar evento customizado para notificar que o app está pronto
            const nativeAppReadyEvent = new CustomEvent('nativeAppReady', {
              detail: window.nativeEnvironment
            });
            window.dispatchEvent(nativeAppReadyEvent);
            document.dispatchEvent(nativeAppReadyEvent);
            
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
        translucent={false}
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
            style={styles.webview}
            onNavigationStateChange={onNavigationStateChange}
            onLoadStart={handleLoadStart}
            onLoadEnd={handleLoadEnd}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={true}
            pullToRefreshEnabled={true}
            onError={syntheticEvent => {
              const {nativeEvent} = syntheticEvent;
              console.warn('WebView error: ', nativeEvent);
              Sentry.captureException(nativeEvent, {
                tags: {
                  location: 'WebView',
                  type: 'ERROR',
                },
              });
            }}
            onHttpError={syntheticEvent => {
              const {nativeEvent} = syntheticEvent;
              console.warn(
                'WebView HTTP error: ',
                `Code: ${nativeEvent.statusCode}`,
              );
              Sentry.captureException(nativeEvent, {
                tags: {
                  location: 'WebView',
                  type: 'HTTP_ERROR',
                  statusCode: nativeEvent.statusCode,
                },
              });
            }}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#ffffff" />
                {/* <Text style={styles.loadingText}>Carregando Interflow...</Text> */}
              </View>
            )}
          />
        </View>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            {/* <Text style={styles.loadingText}>Carregando Interflow...</Text> */}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: 'rgb(31, 41, 55)',
    backgroundColor: '#111827',
    marginBottom: -20,
    marginTop: -5,
    paddingTop: 0,
  },
  webviewContainer: {
    flex: 1,
    marginVertical: 2, // Reduzindo para uma margem ainda mais sutil
  },
  iosWebviewContainer: {
    // Ajustes específicos para iOS
    // paddingTop: 0,
    paddingBottom: 1,
  },
  webview: {
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
    height: '100%',
    width: '100%',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
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
    // backgroundColor: '#1f0939',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: '#111827',
    // backgroundColor: '#1f0939',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333333',
  },
});

export default Sentry.wrap(App);
