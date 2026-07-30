import React from 'react';
import {View, Text, StyleSheet, Platform} from 'react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {radii, spacing, typography, glassShadow} from '../../theme/tokens';

type Props = {
  label: string;
  /** Versão flutuante sticky (sem margem grande) */
  floating?: boolean;
};

export function DateSeparator({label, floating = false}: Props) {
  const {colors: theme, theme: mode} = useTheme();
  if (!label) return null;

  return (
    <View
      style={[styles.shell, floating && styles.shellFloating]}
      pointerEvents="none">
      <View
        style={[
          styles.chip,
          glassShadow(mode),
          {
            backgroundColor:
              mode === 'dark'
                ? 'rgba(31, 41, 55, 0.72)'
                : 'rgba(255, 255, 255, 0.92)',
            borderColor:
              mode === 'dark'
                ? 'rgba(59, 130, 246, 0.22)'
                : 'rgba(229, 231, 235, 0.85)',
          },
        ]}>
        <Text style={[styles.label, {color: theme.secondaryLabel}]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    zIndex: 5,
  },
  shellFloating: {
    paddingVertical: spacing.xs,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    ...Platform.select({
      android: {elevation: 2},
      default: {},
    }),
  },
  label: {
    fontSize: typography.footnote,
    fontWeight: '600',
  },
});
