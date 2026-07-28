import {Linking} from 'react-native';
import env from '../config/env';

export const BASE_URL = env.BASE_URL;

export const extractDomain = (url: string): string => {
  try {
    let domain = url.trim();
    if (domain.indexOf('://') > -1) {
      domain = domain.split('://')[1];
    }
    domain = domain.split('/')[0].split('?')[0].split('#')[0];
    return domain;
  } catch {
    return '';
  }
};

export const extractPath = (url: string): string => {
  try {
    let path = url.trim();
    if (path.indexOf('://') > -1) {
      path = path.split('://')[1];
      path = path.substring(path.indexOf('/'));
    } else if (path.startsWith('/')) {
      return path;
    }
    return path;
  } catch {
    return '/';
  }
};

export const ALLOWED_DOMAINS = [
  'interflow.chat',
  'app.interflow.chat',
  'www.interflow.chat',
  'interflow.interdev.work',
  extractDomain(BASE_URL),
].filter(Boolean);

export const WEBVIEW_ALLOWED_SERVICES = [
  'stripe.com',
  'js.stripe.com',
  'm.stripe.com',
  'connect-js.stripe.com',
  'checkout.stripe.com',
  'hooks.stripe.com',
  'api.stripe.com',
  'files.stripe.com',
  'accounts.google.com',
  'www.google.com',
  'www.gstatic.com',
  'apis.google.com',
  'recaptcha.net',
  'www.recaptcha.net',
  'appleid.apple.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
];

export const isWebViewAllowedService = (url: string): boolean => {
  const domain = extractDomain(url);
  return WEBVIEW_ALLOWED_SERVICES.some(
    allowedDomain =>
      domain === allowedDomain || domain.endsWith('.' + allowedDomain),
  );
};

export const isInterflowDomain = (url: string): boolean => {
  const domain = extractDomain(url);
  return ALLOWED_DOMAINS.some(
    allowedDomain =>
      domain === allowedDomain || domain.endsWith('.' + allowedDomain),
  );
};

export const handleExternalLink = async (url: string): Promise<boolean> => {
  try {
    const lowerUrl = url.toLowerCase();
    if (
      lowerUrl.startsWith('tel:') ||
      lowerUrl.startsWith('mailto:') ||
      lowerUrl.startsWith('sms:')
    ) {
      await Linking.openURL(url);
      return true;
    }
    if (
      lowerUrl.includes('wa.me') ||
      lowerUrl.includes('api.whatsapp.com') ||
      lowerUrl.includes('whatsapp.com') ||
      lowerUrl.startsWith('whatsapp://')
    ) {
      await Linking.openURL(url);
      return true;
    }
    if (!isInterflowDomain(url) && !isWebViewAllowedService(url)) {
      await Linking.openURL(url);
      return true;
    }
    return false;
  } catch (e) {
    console.error('Erro ao abrir link externo:', e);
    return false;
  }
};
