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
  const [isWebViewVisible, setIsWebViewVisible] = useState(true);
  const lastNotificationRef = useRef<NotificationEvent | null>(null);
  const appStateSubscription = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);
  const backHandlerSubscription = useRef<ReturnType<typeof BackHandler.addEventListener> | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const checkWhiteScreenTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backgroundTimeRef = useRef<number | null>(null);
  const currentNavigationStateRef = useRef<WebViewNavigation | null>(null);
  const whiteScreenDetectionAttemptsRef = useRef<number>(0);
  const [error, setError] = useState<{
    type: 'offline' | 'general';
    message: string;
  } | null>(null);

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
        console.log('App foi para o background');
        backgroundTimeRef.current = Date.now();
      }
      
      // Se o app está voltando para o primeiro plano
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App voltou para o primeiro plano');
        const timeInBackground = backgroundTimeRef.current ? (Date.now() - backgroundTimeRef.current) : 0;
        console.log(`Tempo em background: ${timeInBackground / 1000} segundos`);
        
        // Resetar contagem de tentativas de detecção
        whiteScreenDetectionAttemptsRef.current = 0;
        
        // Se ficou muito tempo em background (mais de 10 minutos), força um reload para garantir
        if (timeInBackground > 10 * 60 * 1000) {
          console.log('Detectado longo período em background, recarregando WebView');
          if (webViewRef.current) {
            webViewRef.current.reload();
          }
          return;
        }
        
        // Verificar integridade do WebView após retornar do background
        scheduleWhiteScreenDetection();
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

  // Função para agendar detecções de tela branca em sequência
  const scheduleWhiteScreenDetection = () => {
    if (checkWhiteScreenTimeoutRef.current) {
      clearTimeout(checkWhiteScreenTimeoutRef.current);
    }

    // Reduzir a frequência das verificações para evitar sobrecarregar a WebView
    const checkTimes = [1000, 3000];
    
    // Função recursiva para verificar em intervalos sequenciais
    const scheduleCheck = (index: number) => {
      if (index >= checkTimes.length) return;
      
      checkWhiteScreenTimeoutRef.current = setTimeout(() => {
        checkWhiteScreen();
        scheduleCheck(index + 1);
      }, checkTimes[index]);
    };
    
    // Iniciar sequência de verificações
    scheduleCheck(0);
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

  // Função para verificar se o WebView está com tela branca
  const checkWhiteScreen = () => {
    if (!webViewRef.current || !isWebViewVisible) {
      return;
    }
    
    try {
      // Injetar JavaScript para verificar diversos indicadores de tela branca
      webViewRef.current.injectJavaScript(`
        (function() {
          try {
            // Verificar se o body está vazio ou tem apenas elementos vazios
            const body = document.body;
            const hasContent = body.children.length > 0 && 
              Array.from(body.children).some(el => 
                el.offsetHeight > 0 && el.offsetWidth > 0
              );
            
            // Verificar se há elementos visíveis com conteúdo real
            // Modificado para ser menos sensível e evitar falsos positivos
            const visibleElements = document.querySelectorAll('body *');
            const hasVisibleElements = Array.from(visibleElements).some(el => {
              if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'META' || el.tagName === 'LINK') {
                return false;
              }
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     el.offsetHeight > 10 && 
                     el.offsetWidth > 10;
            });

            // Verificar se o body está vazio ou só tem um loader
            // Modificado para ser mais tolerante com loaders
            const hasOnlyLoader = document.body.innerHTML.trim() === '';

            // Verificação adicional para detectar conteúdo renderizado mas invisível
            const mainRoot = document.getElementById('root');
            const appContainer = document.querySelector('.mobile-container, .app-container, #app, .app, main');
            
            // Verificar presença de elementos específicos da aplicação
            // Modificado para considerar diferentes estruturas de aplicações
            const hasAppStructure = mainRoot || appContainer || document.querySelector('main') || document.querySelector('[role="main"]');
            
            // Verificar se há texto visível em qualquer lugar da página
            const hasVisibleText = Array.from(document.querySelectorAll('body *')).some(el => {
              return el.textContent && 
                     el.textContent.trim().length > 0 && 
                     window.getComputedStyle(el).display !== 'none';
            });
            
            // Agora só considera tela branca em casos mais extremos
            // onde múltiplas condições indicam ausência de conteúdo
            const isWhiteScreen = !hasContent && 
                                 !hasVisibleElements && 
                                 hasOnlyLoader && 
                                 !hasAppStructure && 
                                 !hasVisibleText && 
                                 document.readyState === 'complete';

            if (isWhiteScreen) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'whiteScreen',
                timestamp: Date.now(),
                details: {
                  hasContent,
                  hasVisibleElements,
                  hasOnlyLoader,
                  hasAppStructure,
                  hasVisibleText,
                  url: window.location.href,
                  readyState: document.readyState
                }
              }));
            } else {
              // Tela está normal
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'screenOk',
                timestamp: Date.now()
              }));
            }
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              error: error.message,
              location: 'checkWhiteScreen'
            }));
          }
        })();
        true;
      `);
    } catch (error) {
      console.error('Erro ao injetar script de verificação de tela branca:', error);
      Sentry.captureException(error, {
        tags: {
          location: 'checkWhiteScreen',
          type: 'INJECTION_ERROR',
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

      // Verificar se é uma mensagem de tela branca
      if (data.type === 'whiteScreen') {
        console.log('Tela branca detectada, tentativa:', whiteScreenDetectionAttemptsRef.current);
        
        // Incrementar o contador apenas se a página estiver completamente carregada
        if (data.details?.readyState === 'complete') {
          whiteScreenDetectionAttemptsRef.current += 1;
        }
        
        // Registrar no Sentry para diagnóstico
        Sentry.captureMessage('Tela branca detectada no WebView', {
          level: 'warning',
          tags: {
            location: 'WhiteScreenDetection',
            attempt: whiteScreenDetectionAttemptsRef.current,
            platform: Platform.OS
          },
          extra: data.details
        });
        
        // Estratégia de recuperação progressiva - só agir após múltiplas tentativas
        if (whiteScreenDetectionAttemptsRef.current >= 3) {
          // Reinjetar navegação para a mesma URL após múltiplas detecções
          if (webViewRef.current && currentNavigationStateRef.current) {
            console.log('Tentativa 1: Reinjetando navegação para a mesma URL');
            webViewRef.current.injectJavaScript(`
              window.location.href = "${currentNavigationStateRef.current.url}";
              true;
            `);
          }
        } else if (whiteScreenDetectionAttemptsRef.current >= 5) {
          // Segunda tentativa: recarregar o webview
          console.log('Tentativa 2: Recarregando o WebView');
          if (webViewRef.current) {
            webViewRef.current.reload();
          }
        } else if (whiteScreenDetectionAttemptsRef.current >= 7) {
          // Tentativas subsequentes: resetar completamente o WebView
          console.log('Tentativa 3+: Resetando WebView completamente');
          setIsWebViewVisible(false);
          setLoading(true);
          
          // Pequeno delay para garantir que o WebView seja removido e recriado
          setTimeout(() => {
            setIsWebViewVisible(true);
            // Forçar nova URL para garantir um carregamento limpo
            setUrl(BASE_URL + '?reload=' + Date.now());
          }, 500);
        }
      }
      // Verificar se a tela está ok
      else if (data.type === 'screenOk') {
        // Resetar contador de tentativas se a tela estiver ok
        whiteScreenDetectionAttemptsRef.current = 0;
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
      // Armazenar o estado atual da navegação para referência
      currentNavigationStateRef.current = navState;
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
      setIsWebViewVisible(true);
      
      // Resetar contagem de tentativas de detecção de tela branca
      whiteScreenDetectionAttemptsRef.current = 0;

      // Limpar timeout de retry se existir
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Agendar verificação de tela branca para garantir que tudo carregou corretamente
      setTimeout(checkWhiteScreen, 1000);

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
            overscroll-behavior: none;
            touch-action: manipulation;
            user-select: none;
            padding: 2px 0 !important;
          }
          
          ::-webkit-scrollbar {
            display: none;
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
            /* Estilos específicos para iOS */
          }

          .platform-android {
            /* Estilos específicos para Android */
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
            
            // Verificar se a página está renderizada corretamente
            setTimeout(function() {
              const hasContent = document.body.children.length > 0;
              const hasVisibleElements = Array.from(document.querySelectorAll('*')).some(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && el.offsetHeight > 0;
              });
              
              if (!hasContent || !hasVisibleElements) {
                // Página em branco, forçar um recarregamento
                console.log('Tela em branco detectada após restauração do cache, recarregando');
                window.location.reload();
              }
            }, 500);
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
            style={[
              styles.webview,
              !isWebViewVisible && styles.webviewHidden
            ]}
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
            cacheEnabled={true}
            cacheMode="LOAD_DEFAULT"
            incognito={false}
            thirdPartyCookiesEnabled={true}
            sharedCookiesEnabled={true}
            allowsLinkPreview={false}
            bounces={true}
            mediaPlaybackRequiresUserAction={false}
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
    marginBottom: -20,
    marginTop: -5,
    paddingTop: 0,
  },
  webviewContainer: {
    flex: 1,
    marginVertical: 2,
  },
  iosWebviewContainer: {
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
