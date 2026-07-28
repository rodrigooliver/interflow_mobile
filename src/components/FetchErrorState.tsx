import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {WifiOff, AlertCircle, RefreshCw} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {useI18n} from '../contexts/I18nContext';
import {brand, radii, spacing, typography} from '../theme/tokens';
import type {FetchErrorKind} from '../utils/networkError';

type Props = {
  kind?: FetchErrorKind;
  onRetry?: () => void;
  /** Título/mensagem custom (senão usa i18n). */
  title?: string;
  message?: string;
  compact?: boolean;
};

export function FetchErrorState({
  kind = 'generic',
  onRetry,
  title,
  message,
  compact = false,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t} = useI18n();
  const isNetwork = kind === 'network';

  const resolvedTitle =
    title ||
    (isNetwork ? t.errors.networkTitle : t.errors.genericTitle);
  const resolvedMessage =
    message ||
    (isNetwork ? t.errors.networkMessage : t.errors.genericMessage);

  const Icon = isNetwork ? WifiOff : AlertCircle;
  const iconColor = isNetwork
    ? mode === 'dark'
      ? '#FBBF24'
      : '#D97706'
    : mode === 'dark'
      ? '#F87171'
      : '#DC2626';

  return (
    <View
      style={[
        styles.root,
        compact && styles.rootCompact,
        {backgroundColor: theme.pageBg},
      ]}>
      <View
        style={[
          styles.iconShell,
          {
            backgroundColor: isNetwork
              ? mode === 'dark'
                ? 'rgba(245, 158, 11, 0.16)'
                : 'rgba(245, 158, 11, 0.12)'
              : mode === 'dark'
                ? 'rgba(239, 68, 68, 0.16)'
                : 'rgba(239, 68, 68, 0.1)',
          },
        ]}>
        <Icon size={compact ? 28 : 34} color={iconColor} strokeWidth={2} />
      </View>

      <Text style={[styles.title, {color: theme.label}]}>{resolvedTitle}</Text>
      <Text style={[styles.message, {color: theme.secondaryLabel}]}>
        {resolvedMessage}
      </Text>

      {onRetry ? (
        <TouchableOpacity
          style={[styles.retryBtn, {backgroundColor: brand.blue}]}
          onPress={onRetry}
          activeOpacity={0.85}>
          <RefreshCw size={16} color="#FFFFFF" strokeWidth={2.4} />
          <Text style={styles.retryText}>{t.errors.retry}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  rootCompact: {
    minHeight: 220,
    paddingVertical: spacing.xl,
  },
  iconShell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: typography.subhead,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: spacing.md,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.full,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: typography.subhead,
    fontWeight: '700',
  },
});
