import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import env from '../../config/env';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type ChatDetails = {
  id?: string;
  ticket_number?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  last_message_at?: string | null;
  external_id?: string | null;
  assigned_to?: string | null;
  customer?: {name?: string | null} | null;
  channel?: {name?: string | null; type?: string | null} | null;
  channel_details?: {name?: string | null; type?: string | null} | null;
  assigned_agent?: {full_name?: string | null; email?: string | null} | null;
};

type Props = {
  visible: boolean;
  chatId: string;
  organizationId: string;
  onClose: () => void;
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pendente';
    case 'in_progress':
      return 'Em atendimento';
    case 'await_closing':
      return 'Aguardando encerramento';
    case 'closed':
      return 'Encerrado';
    default:
      return status || '—';
  }
}

async function loadChatDetails(
  organizationId: string,
  chatId: string,
): Promise<ChatDetails | null> {
  try {
    const {data: sessionData} = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      const response = await fetch(
        `${env.API_BASE_URL}/${organizationId}/chat/${chatId}?skip_messages=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        },
      );
      const json = (await response.json().catch(() => ({}))) as {
        chat?: ChatDetails;
        success?: boolean;
      };
      if (response.ok && json.chat) return json.chat;
    }
  } catch {
    // fallback supabase
  }

  const {data, error} = await supabase
    .from('chats')
    .select(
      `
      id,
      ticket_number,
      status,
      created_at,
      last_message_at,
      external_id,
      assigned_to,
      customer:customers(name),
      channel_details:chat_channels(name, type),
      assigned_agent:profiles(full_name, email)
    `,
    )
    .eq('id', chatId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  return data as ChatDetails | null;
}

export function ChatDetailsModal({
  visible,
  chatId,
  organizationId,
  onClose,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState<ChatDetails | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!chatId || !organizationId) return;
    setLoading(true);
    setError('');
    try {
      const data = await loadChatDetails(organizationId, chatId);
      setChat(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar detalhes');
    } finally {
      setLoading(false);
    }
  }, [chatId, organizationId]);

  useEffect(() => {
    if (visible && chatId) {
      void fetchDetails();
    } else if (!visible) {
      setChat(null);
      setError('');
    }
  }, [visible, chatId, fetchDetails]);

  const channel = chat?.channel_details || chat?.channel;
  const assignedName =
    chat?.assigned_agent?.full_name ||
    chat?.assigned_agent?.email ||
    chat?.assigned_to ||
    '—';

  return (
    <ChatSheetModal visible={visible} onClose={onClose} maxHeight="94%" minHeight="60%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Detalhes do chat
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator
          color={brand.blue}
          style={{marginVertical: spacing.xxl}}
        />
      ) : error ? (
        <Text style={[chatModalStyles.error, {color: '#EF4444'}]}>{error}</Text>
      ) : (
        <ScrollView
          style={chatModalStyles.scroll}
          contentContainerStyle={chatModalStyles.body}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          bounces>
          <DetailField
            label="Ticket"
            value={String(chat?.ticket_number ?? '—')}
            theme={theme}
          />
          <DetailField
            label="Status"
            value={statusLabel(chat?.status)}
            theme={theme}
          />
          <DetailField
            label="Cliente"
            value={chat?.customer?.name?.trim() || '—'}
            theme={theme}
          />
          <DetailField
            label="Canal"
            value={channel?.name || channel?.type || '—'}
            theme={theme}
          />
          <DetailField label="Atribuído a" value={assignedName} theme={theme} />
          <DetailField
            label="Criado em"
            value={formatDate(chat?.created_at)}
            theme={theme}
          />
          <DetailField
            label="Última mensagem"
            value={formatDate(chat?.last_message_at)}
            theme={theme}
          />
          <DetailField
            label="External ID"
            value={chat?.external_id || '—'}
            theme={theme}
          />
        </ScrollView>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: theme.fill}]}
          onPress={onClose}>
          <Text style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
            {t.common.cancel}
          </Text>
        </TouchableOpacity>
      </View>
    </ChatSheetModal>
  );
}

function DetailField({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: {secondaryLabel: string; label: string};
}) {
  return (
    <View style={chatModalStyles.detailRow}>
      <Text style={[chatModalStyles.detailLabel, {color: theme.secondaryLabel}]}>
        {label}
      </Text>
      <Text style={[chatModalStyles.detailValue, {color: theme.label}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
