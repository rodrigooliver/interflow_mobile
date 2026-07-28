import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../contexts/ThemeContext';
import {useI18n} from '../contexts/I18nContext';
import {useAuth} from '../contexts/AuthContext';
import {
  brand,
  glassShadow,
  radii,
  spacing,
  typography,
} from '../theme/tokens';
import {
  resolveChatUiMode,
  setChatUiModeOverride,
} from '../config/chatUiMode';
import type {ChatUIMode} from '../config/env';
import type {AppLocale} from '../i18n/translations';
import {FLOATING_TAB_BAR_CLEARANCE} from '../components/BottomTabBar';

interface SettingsScreenProps {
  onModeChanged?: (mode: ChatUIMode) => void;
  onSignOut: () => void;
}

export function SettingsScreen({onModeChanged, onSignOut}: SettingsScreenProps) {
  const {theme, colors: colorsTheme, setTheme} = useTheme();
  const {t, locale, setLocale, locales} = useI18n();
  const {profile, session} = useAuth();
  const [uiMode, setUiMode] = useState<ChatUIMode>('hybrid');

  useEffect(() => {
    resolveChatUiMode().then(setUiMode).catch(() => undefined);
  }, []);

  const applyUiMode = async (next: ChatUIMode) => {
    try {
      setUiMode(next);
      await setChatUiModeOverride(next);
      onModeChanged?.(next);
    } catch (e) {
      console.warn('[Settings] failed to save ui mode', e);
      Alert.alert(t.thread.errorTitle, t.chats.loadError);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(t.settings.signOutConfirmTitle, t.settings.signOutConfirmMessage, [
      {text: t.common.cancel, style: 'cancel'},
      {
        text: t.settings.signOut,
        style: 'destructive',
        onPress: onSignOut,
      },
    ]);
  };

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: colorsTheme.pageBg}]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colorsTheme.stickyHeader,
            borderBottomColor: colorsTheme.border,
          },
        ]}>
        <Text style={[styles.title, {color: colorsTheme.label}]}>
          {t.settings.title}
        </Text>
        <Text style={[styles.subtitle, {color: colorsTheme.tertiaryLabel}]}>
          {profile?.full_name || session?.user?.email || ''}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.section, {color: colorsTheme.tertiaryLabel}]}>
          {t.settings.appearance}
        </Text>
        <View
          style={[
            styles.card,
            glassShadow(theme),
            {
              backgroundColor: colorsTheme.card,
              borderColor: colorsTheme.border,
            },
          ]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, {color: colorsTheme.label}]}>
                {t.settings.darkMode}
              </Text>
              <Text style={[styles.rowHint, {color: colorsTheme.tertiaryLabel}]}>
                {t.settings.darkModeHint}
              </Text>
            </View>
            <Switch
              value={theme === 'dark'}
              onValueChange={on => setTheme(on ? 'dark' : 'light')}
              trackColor={{false: colorsTheme.fill, true: brand.blue}}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.section, {color: colorsTheme.tertiaryLabel}]}>
          {t.settings.appMode}
        </Text>
        <View
          style={[
            styles.card,
            glassShadow(theme),
            {
              backgroundColor: colorsTheme.card,
              borderColor: colorsTheme.border,
            },
          ]}>
          <ModeOption
            label={t.settings.nativeMode}
            selected={uiMode === 'hybrid'}
            onPress={() => void applyUiMode('hybrid')}
          />
          <View
            style={[styles.divider, {backgroundColor: colorsTheme.separator}]}
          />
          <ModeOption
            label={t.settings.webMode}
            selected={uiMode === 'webview'}
            onPress={() => void applyUiMode('webview')}
          />
          <Text style={[styles.cardHint, {color: colorsTheme.tertiaryLabel}]}>
            {t.settings.appModeHint}
          </Text>
        </View>

        <Text style={[styles.section, {color: colorsTheme.tertiaryLabel}]}>
          {t.settings.language}
        </Text>
        <View
          style={[
            styles.card,
            glassShadow(theme),
            {
              backgroundColor: colorsTheme.card,
              borderColor: colorsTheme.border,
            },
          ]}>
          {locales.map((item, index) => (
            <React.Fragment key={item.id}>
              {index > 0 ? (
                <View
                  style={[
                    styles.divider,
                    {backgroundColor: colorsTheme.separator},
                  ]}
                />
              ) : null}
              <ModeOption
                label={item.label}
                selected={locale === item.id}
                onPress={() => setLocale(item.id as AppLocale)}
              />
            </React.Fragment>
          ))}
          <Text style={[styles.cardHint, {color: colorsTheme.tertiaryLabel}]}>
            {t.settings.languageHint}
          </Text>
        </View>

        <Text style={[styles.section, {color: colorsTheme.tertiaryLabel}]}>
          {t.settings.account}
        </Text>
        <TouchableOpacity
          style={[
            styles.card,
            styles.signOutCard,
            glassShadow(theme),
            {
              backgroundColor: colorsTheme.card,
              borderColor: colorsTheme.border,
            },
          ]}
          onPress={confirmSignOut}
          activeOpacity={0.7}>
          <Text style={styles.signOutText}>{t.settings.signOut}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const {colors: colorsTheme} = useTheme();
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.rowTitle, {color: colorsTheme.label}]}>{label}</Text>
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? brand.blue : colorsTheme.border,
            backgroundColor: selected ? brand.blue : 'transparent',
          },
        ]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  title: {
    fontSize: typography.largeTitle,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: typography.footnote,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE + spacing.lg,
  },
  section: {
    fontSize: typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowText: {flex: 1},
  rowTitle: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  rowHint: {
    marginTop: 2,
    fontSize: typography.footnote,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  cardHint: {
    fontSize: typography.caption,
    paddingBottom: spacing.md,
    paddingTop: 2,
  },
  signOutCard: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  signOutText: {
    color: '#EF4444',
    fontSize: typography.body,
    fontWeight: '700',
  },
});
