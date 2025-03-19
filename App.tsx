/**
 * Interflow Mobile App
 * WebView para acessar o Interflow
 *
 * @format
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { WebView } from 'react-native-webview';
import { LogLevel, OneSignal }  from 'react-native-onesignal';
import SplashScreen from 'react-native-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebViewNavigation, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuração do OneSignal - substitua com seu App ID
const ONESIGNAL_APP_ID = '7aef872c-3a1d-43db-bb0b-113a55a9f402';

// URL base do Interflow
const BASE_URL = 'https://interflow.chat/app';
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
  const lastNotificationRef = useRef<any>(null);

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
        setInitialUrlLoaded(true);
      }
    };
    
    checkPendingUrl();
  }, []);

  useEffect(() => {
    // Inicializar o OneSignal assim que o componente montar
    initOneSignal();

    // Monitorar mudanças de estado do aplicativo
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Esconder a tela de splash após o carregamento
    setTimeout(() => {
      if (SplashScreen.hide) {
        SplashScreen.hide();
      }
    }, 1000);

    // Manipular o botão de voltar no Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

    return () => {
      subscription.remove();
      backHandler.remove();
    };
  }, [webViewCanGoBack]);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    // Se o app está voltando para o primeiro plano
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App voltou para o primeiro plano');
      // Verificar se tem notificação pendente
      checkPendingUrl();
    }
    
    appState.current = nextAppState;
  };

  const checkPendingUrl = async () => {
    try {
      const pendingUrl = await AsyncStorage.getItem(PENDING_URL_KEY);
      
      if (pendingUrl) {
        console.log('URL pendente encontrada ao voltar para o primeiro plano:', pendingUrl);
        
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
    }
  };

  const initOneSignal = async () => {
    // Remove this method to stop OneSignal Debugging
    OneSignal.Debug.setLogLevel(LogLevel.Verbose);

    // Configurar o OneSignal
    OneSignal.initialize(ONESIGNAL_APP_ID);

    // requestPermission will show the native iOS or Android notification permission prompt.
    // We recommend removing the following code and instead using an In-App Message to prompt for notification permission
    OneSignal.Notifications.requestPermission(true);

    // Method for listening for notification clicks
    OneSignal.Notifications.addEventListener('click', async (event) => {
      console.log('OneSignal: notification clicked:', event);
      lastNotificationRef.current = event;
      
      // Processar a notificação
      await processNotification(event);
    });

    // Verificar se a notificação pode ter aberto o app
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
      console.log('Notificação recebida em primeiro plano:', event);
    });

    // Verificar se há notificação de fundo
    OneSignal.User.pushSubscription.addEventListener('change', (event) => {
      console.log('Mudança na assinatura push:', event);
    });
  };

  // Processar a notificação e navegar para URL correspondente
  const processNotification = async (event: any) => {
    // Verificar se há dados adicionais na notificação
    if (event.notification.additionalData) {
      const additionalData = event.notification.additionalData as { url?: string, path?: string };
      console.log('Dados adicionais:', additionalData);
      
      // Se houver um path nos dados adicionais, navegar para ele usando o React Router
      if (additionalData.path) {
        console.log('Navegando para Path interno:', additionalData.path);
        
        // Construir a URL completa
        const fullUrl = `${BASE_URL}${additionalData.path.startsWith('/') ? additionalData.path : '/' + additionalData.path}`;
        
        // Verificar se o WebView já foi carregado
        if (!webViewRef.current || !initialUrlLoaded) {
          console.log('WebView não disponível, salvando URL para carregamento posterior:', fullUrl);
          // Salvar a URL para quando o app iniciar completamente
          await AsyncStorage.setItem(PENDING_URL_KEY, fullUrl);
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
          // Fallback: definir URL diretamente
          setUrl(fullUrl);
        }
      } 
      // Se houver uma URL completa
      else if (additionalData.url) {
        console.log('Navegando para URL:', additionalData.url);
        
        // Verificar se o WebView já foi carregado
        if (!webViewRef.current || !initialUrlLoaded) {
          console.log('WebView não disponível, salvando URL para carregamento posterior:', additionalData.url);
          // Salvar a URL para quando o app iniciar completamente
          await AsyncStorage.setItem(PENDING_URL_KEY, additionalData.url);
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
          console.error("Erro ao analisar URL:", e);
          setUrl(additionalData.url);
        }
      }
    } else if (event.notification.launchURL) {
      // Se houver uma URL de lançamento, tentar o mesmo processo
      const launchURL = event.notification.launchURL;
      console.log('Navegando para URL de lançamento:', launchURL);
      
      // Verificar se o WebView já foi carregado
      if (!webViewRef.current || !initialUrlLoaded) {
        console.log('WebView não disponível, salvando URL para carregamento posterior:', launchURL);
        // Salvar a URL para quando o app iniciar completamente
        await AsyncStorage.setItem(PENDING_URL_KEY, launchURL);
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
        console.error("Erro ao analisar URL de lançamento:", e);
        setUrl(launchURL);
      }
    }
  };

  // Função para lidar com mensagens do WebView
  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      // Verificar se é uma mensagem de login
      if (data.type === 'login' && data.userId) {
        console.log('Login detectado, registrando userId no OneSignal:', data.userId);
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
    }
  };

  const handleBackPress = () => {
    if (webViewCanGoBack && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    } else {
      // Perguntar se o usuário deseja sair do aplicativo
      Alert.alert(
        'Sair do Interflow',
        'Tem certeza que deseja sair do aplicativo?',
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => {} },
          { text: 'Sair', style: 'destructive', onPress: () => BackHandler.exitApp() }
        ],
        { cancelable: true }
      );
      return true;
    }
  };

  const onNavigationStateChange = (navState: WebViewNavigation) => {
    setWebViewCanGoBack(navState.canGoBack);
  };

  // Handler quando o WebView terminar de carregar
  const handleLoadEnd = () => {
    setLoading(false);
    setInitialUrlLoaded(true);
    
    // Verificar se há uma notificação que abriu o app
    if (lastNotificationRef.current) {
      console.log('Processando notificação após WebView carregar:', lastNotificationRef.current);
      processNotification(lastNotificationRef.current);
      lastNotificationRef.current = null;
    } else {
      // Verificar no AsyncStorage se há uma URL pendente
      checkPendingUrl();
    }
  };

  // Injetar JavaScript para otimizar a experiência do WebView
  const INJECTED_JAVASCRIPT = `
    (function() {
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
      \`;
      document.head.appendChild(style);
      
      // Desabilitar zoom
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      } else {
        const newMeta = document.createElement('meta');
        newMeta.name = 'viewport';
        newMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(newMeta);
      }
      
      // Marcar como aplicativo mobile
      window.isNativeApp = true;

      // Adicionar função para comunicar com o app nativo
      window.loginToOneSignal = function(userId) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'login',
            userId: userId
          }));
        }
      };

      // Adicionar função para logout do OneSignal
      window.logoutFromOneSignal = function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'logout'
          }));
        }
      };

      // Adicionar função para navegação interna
      window.navigate = function(path) {
        try {
          // Tentar usar o React Router
          if (window.router && window.router.navigate) {
            window.router.navigate(path);
            return true;
          }
          
          // Tentar acessar o objeto history do React Router
          const reactRouterNavigate = () => {
            if (window.reactRouterNavigate) {
              window.reactRouterNavigate(path);
              return true;
            }
            return false;
          };
          
          // Tentar encontrar o React Router no escopo global
          if (window.ReactRouter && window.ReactRouter.navigate) {
            window.ReactRouter.navigate(path);
            return true;
          }
          
          // Tentar o useNavigate do React Router
          if (reactRouterNavigate()) {
            return true;
          }
          
          // Fallback: usar a API History
          if (window.history && window.history.pushState) {
            window.history.pushState({}, '', path);
            // Disparar um evento para que o React Router detecte a mudança
            const navEvent = new PopStateEvent('popstate');
            window.dispatchEvent(navEvent);
            return true;
          }
          
          return false;
        } catch (e) {
          console.error('Erro ao navegar:', e);
          return false;
        }
      };

      // Ajustar margens do documento após o carregamento completo
      document.addEventListener('DOMContentLoaded', function() {
        document.body.style.margin = '2px 0';
        
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
            }
          }, 1000);
        }
      });
    })();
  `;

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />
      <SafeAreaView style={styles.container}>
        <View style={[styles.webviewContainer, Platform.OS === 'ios' ? styles.iosWebviewContainer : null]}>
          <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={styles.webview}
            onNavigationStateChange={onNavigationStateChange}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={handleLoadEnd}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={true}
            pullToRefreshEnabled={true}
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
    backgroundColor: 'rgb(31, 41, 55)',
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
    backgroundColor: '#1f0939',
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
    backgroundColor: '#1f0939',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333333',
  },
});

export default App;
