import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {
  MessageCircle,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import {useTheme} from '../contexts/ThemeContext';
import {useI18n} from '../contexts/I18nContext';
import {brand, radii, spacing} from '../theme/tokens';

const TAB_META: Record<
  string,
  {Icon: LucideIcon; labelKey: 'chats' | 'internal' | 'settings'}
> = {
  ChatsTab: {Icon: MessageCircle, labelKey: 'chats'},
  InternalTab: {Icon: Users, labelKey: 'internal'},
  SettingsTab: {Icon: Settings, labelKey: 'settings'},
};

/** Altura útil da nav flutuante (para padding das listas). */
export const FLOATING_TAB_BAR_CLEARANCE = 84;

export function BottomTabBar({state, navigation}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const {colors: theme, theme: mode} = useTheme();
  const {t} = useI18n();

  // Mais perto da borda inferior (ainda respeita home indicator)
  const bottomPad = Math.max(insets.bottom - 8, 4);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, {paddingBottom: bottomPad}]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor:
              mode === 'dark'
                ? 'rgba(31, 41, 55, 0.88)'
                : 'rgba(255, 255, 255, 0.92)',
            borderColor: theme.border,
            shadowColor: mode === 'dark' ? '#000000' : '#1E3A8A',
          },
        ]}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] || {
            Icon: MessageCircle,
            labelKey: 'chats' as const,
          };
          const label = t.tabs[meta.labelKey];
          const color = focused ? brand.blue : theme.tertiaryLabel;
          const Icon = meta.Icon;

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? {selected: true} : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              style={styles.item}
              activeOpacity={0.75}>
              <View
                style={[
                  styles.iconShell,
                  focused && {
                    backgroundColor:
                      mode === 'dark'
                        ? 'rgba(59,130,246,0.28)'
                        : 'rgba(37, 99, 235, 0.12)',
                  },
                ]}>
                <Icon
                  size={22}
                  color={color}
                  strokeWidth={focused ? 2.4 : 2}
                />
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color,
                    fontWeight: focused ? '700' : '600',
                  },
                ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    height: 64,
    borderRadius: radii.xl + 4,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.xs,
    ...Platform.select({
      ios: {
        shadowOffset: {width: 0, height: 10},
        shadowOpacity: 0.16,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  iconShell: {
    width: 44,
    height: 30,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
  },
});
