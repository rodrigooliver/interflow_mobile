export type ChatUIMode = 'hybrid' | 'webview';

const ENV = {
  SENTRY_DSN: '',
  ONESIGNAL_APP_ID: '',
  BASE_URL: 'https://app.interflow.chat/app',
  WEB_APP_URL: 'https://app.interflow.chat/app',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  API_BASE_URL: 'https://node.interflow.chat/api',
  IS_DEV: false,
  CHAT_UI_MODE: 'webview' as ChatUIMode,
};

export const CHAT_UI_MODE_STORAGE_KEY = 'INTERFLOW_CHAT_UI_MODE';

export default ENV;
