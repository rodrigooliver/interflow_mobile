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
  Text,
} from 'react-native';
import { WebView } from 'react-native-webview';
import OneSignal from 'react-native-onesignal';
import SplashScreen from 'react-native-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';

// Configuração do OneSignal - substitua com seu App ID
const ONESIGNAL_APP_ID = 'SEU_ONESIGNAL_APP_ID';

// URL base do Interflow
const BASE_URL = 'https://interflow.chat/app';

// Interfaces para o OneSignal
interface NotificationReceivedEvent {
  complete: (notification: any) => void;
  getNotification: () => any;
}

interface NotificationOpenedEvent {
  notification: {
    additionalData?: {
      url?: string;
    };
  };
}

const App = () => {
  const webViewRef = useRef<WebView | null>(null);
  const [url, setUrl] = useState(BASE_URL);
  const [loading, setLoading] = useState(true);
  const [webViewCanGoBack, setWebViewCanGoBack] = useState(false);

  useEffect(() => {
    // Inicializar o OneSignal
    initOneSignal();

    // Esconder a tela de splash após o carregamento
    setTimeout(() => {
      if (SplashScreen.hide) {
        SplashScreen.hide();
      }
    }, 1000);

    // Manipular o botão de voltar no Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);

    return () => {
      backHandler.remove();
    };
  }, [webViewCanGoBack]);

  const initOneSignal = async () => {
    // Configurar o OneSignal
    // @ts-ignore - Ignorando erro de tipagem do OneSignal
    OneSignal.setAppId(ONESIGNAL_APP_ID);

    // Solicitar permissão para notificações (iOS)
    if (Platform.OS === 'ios') {
      // @ts-ignore - Ignorando erro de tipagem do OneSignal
      OneSignal.promptForPushNotificationsWithUserResponse();
    }

    // Manipular notificações recebidas
    // @ts-ignore - Ignorando erro de tipagem do OneSignal
    OneSignal.setNotificationWillShowInForegroundHandler((notificationReceivedEvent: NotificationReceivedEvent) => {
      console.log("Notificação recebida: ", notificationReceivedEvent);
      // Completar o evento para mostrar a notificação
      notificationReceivedEvent.complete(notificationReceivedEvent.getNotification());
    });

    // Manipular cliques em notificações
    // @ts-ignore - Ignorando erro de tipagem do OneSignal
    OneSignal.setNotificationOpenedHandler((notification: NotificationOpenedEvent) => {
      console.log("Notificação aberta: ", notification);
      
      // Verificar se há dados adicionais na notificação
      const additionalData = notification.notification.additionalData;
      
      if (additionalData && additionalData.url) {
        // Navegar para a URL específica
        setUrl(additionalData.url);
      } else {
        // Navegar para a URL padrão
        setUrl(BASE_URL);
      }
    });
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

      // Ajustar margens do documento após o carregamento completo
      document.addEventListener('DOMContentLoaded', function() {
        document.body.style.margin = '2px 0';
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
            onLoadEnd={() => setLoading(false)}
            injectedJavaScript={INJECTED_JAVASCRIPT}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            allowsBackForwardNavigationGestures={true}
            pullToRefreshEnabled={true}
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066CC" />
                <Text style={styles.loadingText}>Carregando Interflow...</Text>
              </View>
            )}
          />
        </View>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#0066CC" />
            <Text style={styles.loadingText}>Carregando Interflow...</Text>
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
    paddingTop: 1,
    paddingBottom: 1,
  },
  webview: {
    flex: 1,
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
    backgroundColor: '#FFFFFF',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#333333',
  },
});

export default App;
