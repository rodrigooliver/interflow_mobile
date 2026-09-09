import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Mail, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {useAuth} from '../../contexts/AuthContext';
import {radii, spacing, typography} from '../../theme/tokens';
import {fetchMessageEmail} from '../../services/messageActions';
import {
  buildEmailSrcDoc,
  formatEmailAddress,
  formatEmailDate,
  type EmailMessageMetadata,
} from './messageHelpers';

type Props = {
  visible: boolean;
  onClose: () => void;
  email: EmailMessageMetadata;
  chatId?: string | null;
  messageId?: string | null;
};

export function EmailPreviewModal({
  visible,
  onClose,
  email,
  chatId,
  messageId,
}: Props) {
  const {t} = useI18n();
  const {theme: mode, colors} = useTheme();
  const {currentOrganizationMember} = useAuth();
  const insets = useSafeAreaInsets();
  const {height: winH} = useWindowDimensions();
  const isDark = mode === 'dark';
  const organizationId = currentOrganizationMember?.organization_id;

  const [fetched, setFetched] = useState<EmailMessageMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFetched(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!organizationId || !chatId || !messageId) {
      setFetched(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchMessageEmail(organizationId, chatId, messageId)
      .then(data => {
        if (cancelled) return;
        if (!data) {
          setFetched(null);
          return;
        }
        setFetched({
          html: data.html || undefined,
          text: data.text || undefined,
          subject: data.subject || undefined,
          from: data.from || undefined,
          to: data.to || undefined,
          date: data.date || undefined,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : t.messages.emailLoadError,
        );
        setFetched(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, organizationId, chatId, messageId, t.messages.emailLoadError]);

  const merged: EmailMessageMetadata = {
    ...email,
    ...fetched,
    html: fetched?.html ?? email.html,
    text: fetched?.text ?? email.text,
    subject: fetched?.subject ?? email.subject,
    from: fetched?.from ?? email.from,
    to: fetched?.to ?? email.to,
    date: fetched?.date ?? email.date,
  };

  const html = typeof merged.html === 'string' ? merged.html.trim() : '';
  const text = typeof merged.text === 'string' ? merged.text.trim() : '';
  const hasHtml = Boolean(html);
  const hasText = Boolean(text);
  const [viewMode, setViewMode] = useState<'html' | 'text'>(
    hasHtml ? 'html' : 'text',
  );

  useEffect(() => {
    if (visible) {
      setViewMode(hasHtml ? 'html' : 'text');
    }
  }, [visible, hasHtml]);

  const from = formatEmailAddress(merged.from);
  const to = formatEmailAddress(merged.to);
  const dateLabel = formatEmailDate(merged.date);
  const subject =
    (typeof merged.subject === 'string' && merged.subject.trim()) ||
    t.messages.emailNoSubject;
  const srcDoc = useMemo(
    () => (html ? buildEmailSrcDoc(html, isDark) : ''),
    [html, isDark],
  );

  const contentH = Math.max(280, Math.min(winH * 0.55, 480));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.pageBg,
            paddingTop: Math.max(insets.top, spacing.sm),
            paddingBottom: Math.max(insets.bottom, spacing.sm),
          },
        ]}>
        <View style={[styles.header, {borderBottomColor: colors.border}]}>
          <View style={styles.headerLeft}>
            <Mail size={18} color={colors.secondaryLabel} />
            <Text style={[styles.headerTitle, {color: colors.label}]}>
              {t.messages.emailPreviewTitle}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({pressed}) => [styles.closeBtn, pressed && {opacity: 0.6}]}>
            <X size={20} color={colors.label} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View
            style={[
              styles.metaCard,
              {
                backgroundColor: isDark
                  ? 'rgba(17, 24, 39, 0.55)'
                  : 'rgba(249, 250, 251, 0.95)',
                borderColor: isDark
                  ? 'rgba(59, 130, 246, 0.22)'
                  : 'rgba(229, 231, 235, 0.9)',
              },
            ]}>
            <View style={styles.metaSubjectRow}>
              <Mail size={16} color={colors.secondaryLabel} />
              <View style={styles.metaSubjectCol}>
                <Text
                  style={[styles.subject, {color: colors.label}]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {subject}
                </Text>
                {dateLabel ? (
                  <Text style={[styles.date, {color: colors.secondaryLabel}]}>
                    {dateLabel}
                  </Text>
                ) : null}
              </View>
            </View>
            {from ? (
              <Text style={[styles.addr, {color: colors.secondaryLabel}]}>
                <Text style={styles.addrLabel}>{t.messages.emailFrom}: </Text>
                {from}
              </Text>
            ) : null}
            {to ? (
              <Text style={[styles.addr, {color: colors.secondaryLabel}]}>
                <Text style={styles.addrLabel}>{t.messages.emailTo}: </Text>
                {to}
              </Text>
            ) : null}
          </View>

          {(hasHtml || hasText) && !loading && (
            <View
              style={[
                styles.tabs,
                {
                  backgroundColor: isDark
                    ? 'rgba(31, 41, 55, 0.9)'
                    : 'rgba(243, 244, 246, 1)',
                },
              ]}>
              {hasHtml ? (
                <Pressable
                  onPress={() => setViewMode('html')}
                  style={[
                    styles.tab,
                    viewMode === 'html' && [
                      styles.tabActive,
                      {
                        backgroundColor: isDark
                          ? 'rgba(55, 65, 81, 1)'
                          : '#FFFFFF',
                      },
                    ],
                  ]}>
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color:
                          viewMode === 'html'
                            ? colors.label
                            : colors.secondaryLabel,
                      },
                    ]}>
                    {t.messages.emailHtml}
                  </Text>
                </Pressable>
              ) : null}
              {hasText ? (
                <Pressable
                  onPress={() => setViewMode('text')}
                  style={[
                    styles.tab,
                    viewMode === 'text' && [
                      styles.tabActive,
                      {
                        backgroundColor: isDark
                          ? 'rgba(55, 65, 81, 1)'
                          : '#FFFFFF',
                      },
                    ],
                  ]}>
                  <Text
                    style={[
                      styles.tabText,
                      {
                        color:
                          viewMode === 'text'
                            ? colors.label
                            : colors.secondaryLabel,
                      },
                    ]}>
                    {t.messages.emailText}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <View
            style={[
              styles.bodyCard,
              {
                height: contentH,
                borderColor: isDark
                  ? 'rgba(59, 130, 246, 0.22)'
                  : 'rgba(229, 231, 235, 0.9)',
                backgroundColor: isDark ? '#030712' : '#FFFFFF',
              },
            ]}>
            {loading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.secondaryLabel} />
                <Text style={[styles.stateText, {color: colors.secondaryLabel}]}>
                  {t.messages.emailLoading}
                </Text>
              </View>
            ) : error && !hasHtml && !hasText ? (
              <View style={styles.centerState}>
                <Text style={[styles.stateText, {color: colors.secondaryLabel}]}>
                  {error}
                </Text>
              </View>
            ) : viewMode === 'html' && hasHtml ? (
              <WebView
                originWhitelist={['*']}
                source={{html: srcDoc}}
                style={[
                  styles.webview,
                  {backgroundColor: isDark ? '#111827' : '#FFFFFF'},
                ]}
                setSupportMultipleWindows={false}
                nestedScrollEnabled
              />
            ) : (
              <ScrollView contentContainerStyle={styles.textPad}>
                <Text style={[styles.plainText, {color: colors.label}]}>
                  {text || t.messages.emailEmpty}
                </Text>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: typography.headline,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: 12,
  },
  metaCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    gap: 6,
  },
  metaSubjectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metaSubjectCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  subject: {
    fontSize: typography.subhead,
    fontWeight: '700',
  },
  date: {
    fontSize: typography.caption,
  },
  addr: {
    fontSize: typography.caption,
    lineHeight: 16,
  },
  addrLabel: {
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 1,
  },
  tabText: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  bodyCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  stateText: {
    fontSize: typography.subhead,
    textAlign: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  textPad: {
    padding: 14,
  },
  plainText: {
    fontSize: typography.subhead,
    lineHeight: 20,
  },
});
