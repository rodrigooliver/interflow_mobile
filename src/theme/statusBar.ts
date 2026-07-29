import {Platform, StatusBar} from 'react-native';
import type {AppThemeMode} from './tokens';

const BOOT_LOADING_BG = '#030712';

/** Status bar do loading de abertura (fundo sempre escuro). */
export function applyBootLoadingStatusBar() {
  StatusBar.setBarStyle('light-content', true);
  if (Platform.OS === 'android') {
    StatusBar.setBackgroundColor(BOOT_LOADING_BG, true);
  }
}

/** Status bar alinhado ao tema do app (light → ícones escuros). */
export function applyThemeStatusBar(theme: AppThemeMode) {
  StatusBar.setBarStyle(
    theme === 'dark' ? 'light-content' : 'dark-content',
    true,
  );
  if (Platform.OS === 'android') {
    StatusBar.setBackgroundColor(
      theme === 'dark' ? '#111827' : '#F3F4F6',
      true,
    );
  }
}
