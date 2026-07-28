/**
 * Tokens nativos Interflow — alinhados ao Glass UI da web
 * (docs/design-system/interflow-design-system.md), sem Tailwind/NativeWind.
 * Blur real fica de fora; usamos superfícies translúcidas + borda + sombra suave.
 */

import {Platform, type ViewStyle} from 'react-native';

export type AppThemeMode = 'light' | 'dark';

/** blue-600 / blue-500 — identidade Interflow (não iOS system blue) */
export const brand = {
  blue: '#2563EB',
  blueDark: '#3B82F6',
  bluePressed: '#1D4ED8',
  blueSoft: 'rgba(37, 99, 235, 0.12)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.12)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const typography = {
  largeTitle: 34,
  title: 22,
  headline: 17,
  body: 17,
  callout: 16,
  subhead: 15,
  footnote: 13,
  caption: 12,
};

/** rounded-2xl / rounded-3xl da web */
export const radii = {
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

const light = {
  pageBg: '#F3F4F6', // gray-100
  groupBg: '#F9FAFB', // gray-50 surface
  surface: 'rgba(249, 250, 251, 0.92)',
  stickyHeader: 'rgba(255, 255, 255, 0.92)',
  card: 'rgba(255, 255, 255, 0.9)',
  listItem: 'rgba(255, 255, 255, 0.55)',
  listItemPinned: 'rgba(255, 251, 235, 0.85)', // amber-50
  listItemSelected: 'rgba(239, 246, 255, 0.95)', // blue-50
  separator: 'rgba(229, 231, 235, 0.9)',
  border: 'rgba(229, 231, 235, 0.9)', // gray-200/80
  borderStrong: 'rgba(147, 197, 253, 0.7)', // blue-300
  borderPinned: 'rgba(252, 211, 77, 0.8)', // amber
  label: '#111827',
  secondaryLabel: '#4B5563',
  tertiaryLabel: '#9CA3AF',
  fill: '#E5E7EB',
  searchBg: 'rgba(255, 255, 255, 0.75)',
  inputBg: 'rgba(255, 255, 255, 0.8)',
  bubbleOut: brand.blue,
  bubbleOutText: '#FFFFFF',
  bubbleIn: 'rgba(255, 255, 255, 0.88)',
  bubbleInText: '#111827',
  bubbleInBorder: 'rgba(229, 231, 235, 0.95)',
  statusBarStyle: 'dark-content' as const,
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
};

const dark = {
  pageBg: '#111827', // gray-900
  groupBg: '#0B1220',
  surface: 'rgba(17, 24, 39, 0.75)',
  stickyHeader: 'rgba(31, 41, 55, 0.72)', // gray-800/45
  card: 'rgba(31, 41, 55, 0.55)',
  listItem: 'rgba(31, 41, 55, 0.45)',
  listItemPinned: 'rgba(120, 53, 15, 0.35)',
  listItemSelected: 'rgba(30, 58, 138, 0.45)',
  separator: 'rgba(55, 65, 81, 0.7)',
  border: 'rgba(59, 130, 246, 0.2)', // blue-500/20
  borderStrong: 'rgba(59, 130, 246, 0.45)',
  borderPinned: 'rgba(245, 158, 11, 0.45)',
  label: '#F9FAFB',
  secondaryLabel: '#D1D5DB',
  tertiaryLabel: '#9CA3AF',
  fill: '#374151',
  searchBg: 'rgba(31, 41, 55, 0.65)',
  inputBg: 'rgba(31, 41, 55, 0.7)',
  bubbleOut: brand.blueDark,
  bubbleOutText: '#FFFFFF',
  bubbleIn: 'rgba(55, 65, 81, 0.72)',
  bubbleInText: '#F9FAFB',
  bubbleInBorder: 'rgba(59, 130, 246, 0.18)',
  statusBarStyle: 'light-content' as const,
  text: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
};

/** Sombra suave azulada (substitui glow glass da web) */
export function glassShadow(mode: AppThemeMode = 'light'): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: mode === 'dark' ? '#3B82F6' : '#1E3A8A',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: mode === 'dark' ? 0.18 : 0.08,
      shadowRadius: 12,
    },
    android: {
      elevation: 2,
    },
    default: {},
  }) as ViewStyle;
}

/** @deprecated use brand */
export const colors = {
  primary: brand.blue,
  primaryStrong: brand.bluePressed,
  primarySoft: brand.blueSoft,
  danger: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
};

/** @deprecated use getThemeColors */
export const glass = {light, dark};

export function getThemeColors(mode: AppThemeMode) {
  return mode === 'dark' ? dark : light;
}

export const SPLASH_BACKGROUND_COLOR = '#1E2B3D';
