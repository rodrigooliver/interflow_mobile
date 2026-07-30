import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Platform} from 'react-native';
import {ArrowDown} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';

type Props = {
  visible: boolean;
  newCount?: number;
  /** Distância do fundo (altura do input + gap) para ficar acima do composer. */
  bottomOffset?: number;
  onPress: () => void;
};

export function ScrollToBottomFab({
  visible,
  newCount = 0,
  bottomOffset = spacing.lg,
  onPress,
}: Props) {
  const {colors: theme} = useTheme();

  if (!visible) return null;

  const badgeLabel =
    newCount > 99
      ? '99+ novas'
      : newCount === 1
        ? '1 nova'
        : `${newCount} novas`;

  return (
    <View
      style={[styles.wrap, {bottom: bottomOffset}]}
      pointerEvents="box-none">
      {newCount > 0 ? (
        <TouchableOpacity
          onPress={onPress}
          style={[styles.newPill, {backgroundColor: brand.blue}]}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel={`${badgeLabel} mensagens`}>
          <Text style={styles.newPillText}>{badgeLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.fab,
          {
            backgroundColor: theme.card,
            borderColor: theme.border,
          },
        ]}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Ir para mensagens recentes">
        <ArrowDown size={20} color={theme.label} strokeWidth={2.25} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  newPill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.full,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 8,
        shadowOffset: {width: 0, height: 2},
      },
      android: {elevation: 3},
      default: {},
    }),
  },
  newPillText: {
    color: '#FFFFFF',
    fontSize: typography.footnote,
    fontWeight: '700',
  },
  fab: {
    alignSelf: 'flex-end',
    width: 44,
    height: 44,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: {width: 0, height: 3},
      },
      android: {elevation: 4},
      default: {},
    }),
  },
});
