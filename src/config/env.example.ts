// Arquivo de configuração de ambiente

// Importa as variáveis de ambiente do arquivo .env
const ENV = {
  // Sentry Configuration
  SENTRY_DSN: '',
  SENTRY_DISABLE_AUTO_UPLOAD: true,
  SENTRY_ALLOW_FAILURE: true,

  // OneSignal Configuration
  ONESIGNAL_APP_ID: '',

  // Base URL Configuration
  BASE_URL: 'https://app.interflow.chat/app',
};

export default ENV; 