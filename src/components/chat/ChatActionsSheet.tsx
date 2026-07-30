import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Archive,
  ArchiveRestore,
  Ban,
  CheckCircle,
  Eye,
  EyeOff,
  GitMerge,
  Info,
  Pin,
  PinOff,
  User,
  UserCog,
  Users2,
  X,
} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, spacing} from '../../theme/tokens';
import type {ChatListItem} from '../../services/chatsApi';
import {
  archiveChat,
  markChatRead,
  markChatResolvedFromList,
  markChatSpam,
  markChatUnread,
  pinChat,
} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

/** Tempo para o Modal de ações fechar antes de abrir o próximo (evita RN derrubar os dois). */
const HANDOFF_DELAY_MS = 350;

type Props = {
  visible: boolean;
  chat: ChatListItem | null;
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  canTransfer: boolean;
  onClose: () => void;
  onUpdated: (chatId: string, patch: Partial<ChatListItem>) => void;
  onRemoved: (chatId: string) => void;
  onOpenDetails: (chatId: string) => void;
  onOpenCustomer: (customerId: string) => void;
  onOpenMerge: (chat: ChatListItem) => void;
  onOpenTransferTeam: (chat: ChatListItem) => void;
  onOpenTransferAttendance: (chat: ChatListItem) => void;
  onOpenTransferCustomer: (chat: ChatListItem) => void;
};

type ActionItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  destructive?: boolean;
  onPress: () => void | Promise<void>;
};

function isArchived(chat: ChatListItem): boolean {
  if (chat.is_archived === true) return true;
  const meta = chat.metadata;
  if (meta && typeof meta === 'object' && meta.archived === true) return true;
  return false;
}

export function ChatActionsSheet({
  visible,
  chat,
  organizationId,
  userId: _userId,
  isAdmin,
  canTransfer,
  onClose,
  onUpdated,
  onRemoved,
  onOpenDetails,
  onOpenCustomer,
  onOpenMerge,
  onOpenTransferTeam,
  onOpenTransferAttendance,
  onOpenTransferCustomer,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const lastChatRef = useRef<ChatListItem | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (chat) lastChatRef.current = chat;
  const activeChat = chat ?? lastChatRef.current;

  useEffect(() => {
    return () => {
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    };
  }, []);

  /**
   * Fecha este Modal e só depois abre o próximo.
   * Abrir dois <Modal> no mesmo frame faz o RN fechar o segundo sozinho.
   */
  const handoff = (openNext: () => void) => {
    onClose();
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = setTimeout(openNext, HANDOFF_DELAY_MS);
  };

  const runAction = async (key: string, fn: () => Promise<void>) => {
    if (busyKey || !activeChat) return;
    setBusyKey(key);
    try {
      await fn();
      onClose();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (!activeChat) return null;

  const unread = (activeChat.unread_count || 0) > 0;
  const archived = isArchived(activeChat);
  const isSpam = Boolean(activeChat.customer?.is_spam);
  const actions: ActionItem[] = [];

  actions.push({
    key: 'pin',
    label: activeChat.is_fixed ? 'Desafixar' : 'Fixar',
    icon: activeChat.is_fixed ? (
      <PinOff size={20} color={theme.label} />
    ) : (
      <Pin size={20} color={theme.label} />
    ),
    onPress: () =>
      runAction('pin', async () => {
        const pin = !activeChat.is_fixed;
        const res = (await pinChat(organizationId, activeChat.id, pin)) as {
          data?: Partial<ChatListItem>;
        };
        onUpdated(activeChat.id, res?.data || {is_fixed: pin});
      }),
  });

  const canArchive =
    archived ||
    activeChat.status === 'pending' ||
    activeChat.status === 'in_progress';
  if (canArchive) {
    actions.push({
      key: 'archive',
      label: archived ? 'Desarquivar' : 'Arquivar',
      icon: archived ? (
        <ArchiveRestore size={20} color={theme.label} />
      ) : (
        <Archive size={20} color={theme.label} />
      ),
      onPress: () =>
        runAction('archive', async () => {
          const archive = !archived;
          onRemoved(activeChat.id);
          await archiveChat(organizationId, activeChat.id, archive);
        }),
    });
  }

  actions.push({
    key: 'read',
    label: unread ? t.chats.markRead : 'Marcar como não lido',
    icon: unread ? (
      <Eye size={20} color={theme.label} />
    ) : (
      <EyeOff size={20} color={theme.label} />
    ),
    onPress: () =>
      runAction('read', async () => {
        if (unread) {
          await markChatRead(activeChat.id);
          onUpdated(activeChat.id, {unread_count: 0});
        } else {
          const res = (await markChatUnread(
            organizationId,
            activeChat.id,
            true,
          )) as {data?: Partial<ChatListItem>};
          onUpdated(
            activeChat.id,
            res?.data || {
              unread_count: Math.max(1, activeChat.unread_count || 0),
            },
          );
        }
      }),
  });

  if (activeChat.status === 'pending') {
    actions.push({
      key: 'resolved',
      label: 'Marcar como resolvido',
      icon: <CheckCircle size={20} color={theme.label} />,
      onPress: () =>
        runAction('resolved', async () => {
          const res = (await markChatResolvedFromList(
            organizationId,
            activeChat.id,
          )) as {data?: Partial<ChatListItem>};
          onUpdated(activeChat.id, res?.data || {status: 'closed'});
        }),
    });
  }

  if (activeChat.customer?.id) {
    actions.push({
      key: 'spam',
      label: isSpam ? 'Remover spam' : 'Marcar spam',
      icon: <Ban size={20} color={isSpam ? '#EF4444' : theme.label} />,
      destructive: !isSpam,
      onPress: () =>
        runAction('spam', async () => {
          const spam = !isSpam;
          onRemoved(activeChat.id);
          await markChatSpam(organizationId, activeChat.id, spam);
        }),
    });
  }

  actions.push({
    key: 'merge',
    label: 'Mesclar atendimento',
    icon: <GitMerge size={20} color={theme.label} />,
    onPress: () => {
      const snapshot = activeChat;
      handoff(() => onOpenMerge(snapshot));
    },
  });

  if (canTransfer && !isAdmin) {
    actions.push({
      key: 'transfer-team',
      label: 'Transferir equipe',
      icon: <Users2 size={20} color={theme.label} />,
      onPress: () => {
        const snapshot = activeChat;
        handoff(() => onOpenTransferTeam(snapshot));
      },
    });
  }

  if (isAdmin) {
    actions.push({
      key: 'transfer-attendance',
      label: 'Transferir atendimento',
      icon: <UserCog size={20} color={theme.label} />,
      onPress: () => {
        const snapshot = activeChat;
        handoff(() => onOpenTransferAttendance(snapshot));
      },
    });
  }

  actions.push({
    key: 'transfer-customer',
    label: 'Transferir para cliente',
    icon: <User size={20} color={theme.label} />,
    onPress: () => {
      const snapshot = activeChat;
      handoff(() => onOpenTransferCustomer(snapshot));
    },
  });

  if (activeChat.customer?.id) {
    actions.push({
      key: 'customer',
      label: 'Detalhes do cliente',
      icon: <User size={20} color={theme.label} />,
      onPress: () => {
        const customerId = activeChat.customer!.id!;
        handoff(() => onOpenCustomer(customerId));
      },
    });
  }

  actions.push({
    key: 'details',
    label: 'Detalhes do chat',
    icon: <Info size={20} color={theme.label} />,
    onPress: () => {
      const chatId = activeChat.id;
      handoff(() => onOpenDetails(chatId));
    },
  });

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="94%"
      minHeight="55%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Ações
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={chatModalStyles.scroll}
        bounces
        nestedScrollEnabled
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={action.key}
            style={[
              chatModalStyles.actionRow,
              {
                borderBottomColor: theme.border,
                opacity: busyKey && busyKey !== action.key ? 0.5 : 1,
              },
              index === actions.length - 1 && {borderBottomWidth: 0},
            ]}
            disabled={!!busyKey}
            onPress={() => void action.onPress()}>
            {busyKey === action.key ? (
              <ActivityIndicator color={brand.blue} size="small" />
            ) : (
              action.icon
            )}
            <Text
              style={[
                chatModalStyles.actionLabel,
                {
                  color: action.destructive ? '#EF4444' : theme.label,
                },
              ]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
        }}>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: theme.fill}]}
          onPress={onClose}>
          <Text style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
            {t.chats.cancel}
          </Text>
        </TouchableOpacity>
      </View>
    </ChatSheetModal>
  );
}
