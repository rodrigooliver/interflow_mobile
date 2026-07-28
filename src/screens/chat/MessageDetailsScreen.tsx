import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Check,
  Copy,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {useAuth} from '../../contexts/AuthContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChatMessage} from '../../services/chatsApi';
import {copyText, fetchMessageWebhookLogs} from '../../services/messageActions';
import {MessageStatusTicks} from '../../components/MessageStatusTicks';
import {MESSAGE_TYPE_LABELS} from '../../utils/chatListDisplay';

type Props = {
  chatId: string;
  message: ChatMessage;
  channelType?: string | null;
  onBack: () => void;
};

function DetailRow({
  label,
  children,
  borderColor,
  labelColor,
}: {
  label: string;
  children: React.ReactNode;
  borderColor: string;
  labelColor: string;
}) {
  return (
    <View style={[styles.row, {borderBottomColor: borderColor}]}>
      <Text style={[styles.rowLabel, {color: labelColor}]}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

export function MessageDetailsScreen({
  chatId,
  message,
  channelType,
  onBack,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const {currentOrganizationMember} = useAuth();
  const orgId = currentOrganizationMember?.organization_id;

  const [idCopied, setIdCopied] = useState(false);
  const [chatIdCopied, setChatIdCopied] = useState(false);
  const [supportCopied, setSupportCopied] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [expandedLogIds, setExpandedLogIds] = useState<string[]>([]);

  const loadLogs = useCallback(async () => {
    if (!orgId || !chatId || !message.id) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const result = await fetchMessageWebhookLogs(orgId, chatId, message.id);
      setLogs(result.logs);
    } catch (e) {
      setLogsError(e instanceof Error ? e.message : t.messageDetails.logsError);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [orgId, chatId, message.id, t.messageDetails.logsError]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleCopyId = async () => {
    const result = await copyText(message.id);
    if (result !== 'failed') {
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    }
  };

  const handleCopyChatId = async () => {
    const result = await copyText(chatId);
    if (result !== 'failed') {
      setChatIdCopied(true);
      setTimeout(() => setChatIdCopied(false), 1500);
    }
  };

  const handleCopySupport = async () => {
    const payload = {
      message_id: message.id,
      chat_id: chatId,
      external_id: message.external_id ?? null,
      sender_type: message.sender_type,
      type: message.type,
      error_message: message.error_message ?? null,
      channel_type: channelType ?? null,
      webhook_logs: logs.map(log => ({
        id: log.id,
        event_type: log.event_type,
        http_status: log.http_status,
        created_at: log.created_at,
      })),
    };
    const text = `${t.messageDetails.supportWhatsAppIntro}\n\n\`\`\`\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
    const result = await copyText(text);
    if (result !== 'failed') {
      setSupportCopied(true);
      setTimeout(() => setSupportCopied(false), 2000);
    }
  };

  const typeLabel =
    MESSAGE_TYPE_LABELS[message.type || ''] || message.type || '—';
  const senderLabel =
    message.sender_type === 'agent'
      ? t.messageDetails.agent
      : message.sender_type === 'customer'
        ? t.messageDetails.customer
        : message.sender_type === 'system'
          ? t.messageDetails.system
          : message.sender_type || '—';

  const agentName =
    message.sender_agent?.full_name ||
    (typeof message.metadata?.handled_by === 'object' &&
    message.metadata?.handled_by &&
    typeof (message.metadata.handled_by as {agent_name?: string}).agent_name ===
      'string'
      ? (message.metadata.handled_by as {agent_name: string}).agent_name
      : null);

  const createdAt = message.created_at
    ? new Date(message.created_at).toLocaleString()
    : '—';

  const metadataJson = message.metadata
    ? JSON.stringify(message.metadata, null, 2)
    : null;

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={['top', 'bottom']}>
      <View
        style={[
          styles.navBar,
          {
            backgroundColor: theme.stickyHeader,
            borderBottomColor: theme.border,
          },
        ]}>
        <TouchableOpacity onPress={onBack} style={styles.navSide} hitSlop={10}>
          <Text style={styles.navLink}>{t.thread.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, {color: theme.label}]} numberOfLines={1}>
          {t.messageDetails.title}
        </Text>
        <View style={styles.navSideEnd} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          onPress={() => void handleCopySupport()}
          activeOpacity={0.85}
          style={[
            styles.supportBtn,
            {
              backgroundColor: supportCopied
                ? 'rgba(22, 163, 74, 0.12)'
                : theme.card,
              borderColor: supportCopied
                ? 'rgba(22, 163, 74, 0.4)'
                : theme.border,
            },
          ]}>
          {supportCopied ? (
            <Check size={18} color="#16A34A" />
          ) : (
            <LifeBuoy size={18} color={brand.blue} />
          )}
          <Text
            style={[
              styles.supportBtnText,
              {color: supportCopied ? '#16A34A' : brand.blue},
            ]}>
            {supportCopied
              ? t.messageDetails.copied
              : t.messageDetails.copyForSupport}
          </Text>
        </TouchableOpacity>

        <View
          style={[
            styles.card,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          <DetailRow
            label={t.messageDetails.messageId}
            borderColor={theme.border}
            labelColor={theme.tertiaryLabel}>
            <View style={styles.copyRow}>
              <Text
                style={[styles.mono, {color: theme.label, borderColor: theme.border, backgroundColor: theme.fill}]}
                selectable>
                {message.id}
              </Text>
              <TouchableOpacity
                style={[styles.copyBtn, {borderColor: theme.border, backgroundColor: theme.fill}]}
                onPress={() => void handleCopyId()}>
                {idCopied ? (
                  <Check size={16} color="#16A34A" />
                ) : (
                  <Copy size={16} color={theme.secondaryLabel} />
                )}
              </TouchableOpacity>
            </View>
          </DetailRow>

          <DetailRow
            label={t.messageDetails.chatId}
            borderColor={theme.border}
            labelColor={theme.tertiaryLabel}>
            <View style={styles.copyRow}>
              <Text
                style={[styles.mono, {color: theme.label, borderColor: theme.border, backgroundColor: theme.fill}]}
                selectable>
                {chatId}
              </Text>
              <TouchableOpacity
                style={[styles.copyBtn, {borderColor: theme.border, backgroundColor: theme.fill}]}
                onPress={() => void handleCopyChatId()}>
                {chatIdCopied ? (
                  <Check size={16} color="#16A34A" />
                ) : (
                  <Copy size={16} color={theme.secondaryLabel} />
                )}
              </TouchableOpacity>
            </View>
          </DetailRow>

          <DetailRow
            label={t.messageDetails.type}
            borderColor={theme.border}
            labelColor={theme.tertiaryLabel}>
            <Text style={[styles.value, {color: theme.label}]}>{typeLabel}</Text>
          </DetailRow>

          <DetailRow
            label={t.messageDetails.senderType}
            borderColor={theme.border}
            labelColor={theme.tertiaryLabel}>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    message.sender_type === 'agent'
                      ? 'rgba(37, 99, 235, 0.12)'
                      : message.sender_type === 'customer'
                        ? 'rgba(22, 163, 74, 0.12)'
                        : theme.fill,
                },
              ]}>
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      message.sender_type === 'agent'
                        ? brand.blue
                        : message.sender_type === 'customer'
                          ? '#16A34A'
                          : theme.secondaryLabel,
                  },
                ]}>
                {senderLabel}
              </Text>
            </View>
          </DetailRow>

          {message.sender_type === 'agent' && message.status ? (
            <DetailRow
              label={t.messageDetails.status}
              borderColor={theme.border}
              labelColor={theme.tertiaryLabel}>
              <View style={styles.statusRow}>
                <MessageStatusTicks status={message.status} />
                <Text style={[styles.value, {color: theme.label}]}>
                  {message.status}
                </Text>
              </View>
            </DetailRow>
          ) : null}

          <DetailRow
            label={t.messageDetails.createdAt}
            borderColor={theme.border}
            labelColor={theme.tertiaryLabel}>
            <Text style={[styles.value, {color: theme.label}]}>{createdAt}</Text>
          </DetailRow>

          {agentName ? (
            <DetailRow
              label={t.messageDetails.sentBy}
              borderColor={theme.border}
              labelColor={theme.tertiaryLabel}>
              <Text style={[styles.value, {color: theme.label}]}>{agentName}</Text>
            </DetailRow>
          ) : null}

          {channelType ? (
            <DetailRow
              label={t.messageDetails.channel}
              borderColor={theme.border}
              labelColor={theme.tertiaryLabel}>
              <Text style={[styles.value, {color: theme.label}]}>
                {channelType}
              </Text>
            </DetailRow>
          ) : null}

          {message.content ? (
            <DetailRow
              label={t.messageDetails.content}
              borderColor={theme.border}
              labelColor={theme.tertiaryLabel}>
              <Text style={[styles.value, {color: theme.label}]} selectable>
                {message.content}
              </Text>
            </DetailRow>
          ) : null}

          {message.error_message ? (
            <DetailRow
              label={t.messageDetails.error}
              borderColor={theme.border}
              labelColor={theme.tertiaryLabel}>
              <Text style={[styles.value, {color: '#DC2626'}]} selectable>
                {String(message.error_message)}
              </Text>
            </DetailRow>
          ) : null}
        </View>

        {metadataJson ? (
          <View
            style={[
              styles.card,
              {backgroundColor: theme.card, borderColor: theme.border},
            ]}>
            <Pressable
              style={styles.sectionHeader}
              onPress={() => setMetaExpanded(v => !v)}>
              {metaExpanded ? (
                <ChevronDown size={18} color={theme.secondaryLabel} />
              ) : (
                <ChevronRight size={18} color={theme.secondaryLabel} />
              )}
              <Text style={[styles.sectionTitle, {color: theme.label}]}>
                {t.messageDetails.metadata}
              </Text>
            </Pressable>
            {metaExpanded ? (
              <Text
                style={[
                  styles.monoBlock,
                  {
                    color: theme.label,
                    backgroundColor: theme.fill,
                    borderColor: theme.border,
                  },
                ]}
                selectable>
                {metadataJson}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          <Text style={[styles.sectionTitle, {color: theme.label, marginBottom: 8}]}>
            {t.messageDetails.webhookLogs}
          </Text>
          {logsLoading ? (
            <ActivityIndicator color={brand.blue} />
          ) : logsError ? (
            <Text style={{color: '#DC2626', fontSize: typography.footnote}}>
              {logsError}
            </Text>
          ) : logs.length === 0 ? (
            <Text style={{color: theme.tertiaryLabel, fontSize: typography.footnote}}>
              {t.messageDetails.noLogs}
            </Text>
          ) : (
            logs.map((log, index) => {
              const id = String(log.id || index);
              const open = expandedLogIds.includes(id);
              return (
                <View
                  key={id}
                  style={[styles.logItem, {borderColor: theme.border}]}>
                  <Pressable
                    style={styles.sectionHeader}
                    onPress={() =>
                      setExpandedLogIds(prev =>
                        prev.includes(id)
                          ? prev.filter(x => x !== id)
                          : [...prev, id],
                      )
                    }>
                    {open ? (
                      <ChevronDown size={16} color={theme.secondaryLabel} />
                    ) : (
                      <ChevronRight size={16} color={theme.secondaryLabel} />
                    )}
                    <Text
                      style={[styles.logTitle, {color: theme.label}]}
                      numberOfLines={1}>
                      {String(log.event_type || 'event')}
                      {log.http_status != null ? ` · ${String(log.http_status)}` : ''}
                    </Text>
                  </Pressable>
                  {open ? (
                    <Text
                      style={[
                        styles.monoBlock,
                        {
                          color: theme.label,
                          backgroundColor: theme.fill,
                          borderColor: theme.border,
                        },
                      ]}
                      selectable>
                      {JSON.stringify(log, null, 2)}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  navSide: {width: 78},
  navSideEnd: {width: 78},
  navLink: {
    color: brand.blue,
    fontSize: typography.body,
    fontWeight: '600',
  },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.headline,
    fontWeight: '600',
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  supportBtnText: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    gap: 6,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowValue: {minWidth: 0},
  value: {
    fontSize: typography.subhead,
    lineHeight: 20,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  mono: {
    flex: 1,
    fontFamily: 'Menlo',
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  copyBtn: {
    width: 36,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.full,
  },
  badgeText: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  monoBlock: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 16,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginTop: 6,
    marginBottom: 8,
  },
  logItem: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: 4,
    marginTop: 4,
  },
  logTitle: {
    flex: 1,
    fontSize: typography.footnote,
    fontWeight: '500',
  },
});
