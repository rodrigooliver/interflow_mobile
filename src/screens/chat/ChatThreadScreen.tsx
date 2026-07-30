import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Keyboard,
  Modal,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {useAuth} from '../../contexts/AuthContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {
  fetchChatThreadBootstrap,
  fetchMessages,
  type ChatListItem,
  type ChatMessage,
} from '../../services/chatsApi';
import {
  MessageInput,
  COMPOSER_LIST_PAD,
} from '../../components/chat/composer';
import {
  attendChat,
  addCollaborator,
  leaveAttendance,
  markChatResolved,
  pauseFlow,
  reopenChat,
  markChatUnread,
} from '../../services/chatActions';
import {
  copyText,
  reactToMessage,
  deleteMessage,
  pinMessage,
  unpinMessage,
  canEditMessageByAge,
  canDeleteMessageByAge,
} from '../../services/messageActions';
import {usePermissions} from '../../hooks/usePermissions';
import {supabase} from '../../lib/supabase';
import {ChatThreadSkeleton} from '../../components/Skeleton';
import {FetchErrorState} from '../../components/FetchErrorState';
import {
  MessageBubble,
  type BubbleTheme,
} from '../../components/chat/MessageBubble';
import {DateSeparator} from '../../components/chat/DateSeparator';
import {
  buildMessageListRows,
  findNeighborMessage,
  formatMessageDayLabel,
  getSpacingAfterMessage,
  resolveStickyDateLabel,
  STICKY_DATE_SLOT,
  type MessageListRow,
} from '../../components/chat/messageListLayout';
import {
  MessageActionSheet,
  type MessageAnchor,
} from '../../components/chat/MessageActionSheet';
import {ChatEmojiPicker} from '../../components/chat/ChatEmojiPicker';
import {ChatThreadHeader} from '../../components/chat/ChatThreadHeader';
import {ChatThreadFooter} from '../../components/chat/ChatThreadFooter';
import {ScrollToBottomFab} from '../../components/chat/ScrollToBottomFab';
import {PinnedMessagesStrip} from '../../components/chat/PinnedMessagesStrip';
import {ScheduledMessagesStrip} from '../../components/chat/ScheduledMessagesStrip';
import {FlowPickerModal} from '../../components/chat/FlowPickerModal';
import {ActiveFlowModal} from '../../components/chat/ActiveFlowModal';
import {WhatsAppTemplateSheet} from '../../components/chat/WhatsAppTemplateSheet';
import {EditMessageModal} from '../../components/chat/EditMessageModal';
import {ChatDetailsModal} from '../../components/chat/ChatDetailsModal';
import {
  getChannelFeatures,
  isInternalChatType,
} from '../../utils/channelFeatures';
import {computeMessageWindow} from '../../utils/messageWindow';
import {
  getFetchErrorKind,
  type FetchErrorKind,
} from '../../utils/networkError';
import {
  getDownloadableMedia,
  isHiddenFromChatThread,
} from '../../components/chat/messageHelpers';
import {downloadMessageMedia} from '../../services/downloadMedia';

const PAGE_SIZE = 40;
const NEAR_BOTTOM_THRESHOLD = 300;

type PinnedRow = {
  id: string;
  message_id: string;
  comment?: string | null;
  message?: {content?: string | null; type?: string | null};
};

interface ChatThreadScreenProps {
  chatId: string;
  title?: string;
  /** Muda a cada abertura via notificação (mesmo chatId) para forçar reload. */
  refreshKey?: number;
  onBack: () => void;
  onOpenWeb: (path: string) => void;
  onOpenMessageDetails: (params: {
    chatId: string;
    message: ChatMessage;
    channelType?: string | null;
  }) => void;
}

export function ChatThreadScreen({
  chatId,
  title,
  refreshKey,
  onBack,
  onOpenWeb,
  onOpenMessageDetails,
}: ChatThreadScreenProps) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const {width: windowWidth} = useWindowDimensions();
  const {currentOrganizationMember, session} = useAuth();
  const {chatsPermissions, isOwnerOrAdmin} = usePermissions();
  const orgId = currentOrganizationMember?.organization_id;
  const userId = session?.user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatListItem | null>(null);
  const [pinned, setPinned] = useState<PinnedRow[]>([]);
  const [scheduled, setScheduled] = useState<ChatMessage[]>([]);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [collaborators, setCollaborators] = useState<
    Array<{id: string; user_id: string; left_at?: string | null}>
  >([]);
  const [threadTitle, setThreadTitle] = useState<string | undefined>(title);
  const [loading, setLoading] = useState(true);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [footerLoading, setFooterLoading] = useState(true);
  const [fetchError, setFetchError] = useState<FetchErrorKind | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const loadingOlderRef = useRef(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null);
  const [reacting, setReacting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<ChatMessage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_LIST_PAD);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [flowModalOpen, setFlowModalOpen] = useState(false);
  const [activeFlowModalOpen, setActiveFlowModalOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editMessage, setEditMessage] = useState<ChatMessage | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [headerChromeHeight, setHeaderChromeHeight] = useState(72);
  const [stickyDateLabel, setStickyDateLabel] = useState<string | null>(null);
  const listRef = useRef<FlatList<MessageListRow>>(null);
  const nearBottomRef = useRef(true);
  const listRowsRef = useRef<MessageListRow[]>([]);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  const scrollYRef = useRef(0);
  const listHeightRef = useRef(0);
  const headerChromeHeightRef = useRef(headerChromeHeight);
  const listComposerPadRef = useRef(COMPOSER_LIST_PAD);
  const dateLabelsRef = useRef({today: '', yesterday: ''});
  const stickyDateLabelRef = useRef<string | null>(null);
  headerChromeHeightRef.current = headerChromeHeight;
  stickyDateLabelRef.current = stickyDateLabel;

  const pinListToBottom = useCallback(() => {
    if (!nearBottomRef.current) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({offset: 0, animated: false});
        setTimeout(() => {
          listRef.current?.scrollToOffset({offset: 0, animated: false});
        }, 32);
      });
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    nearBottomRef.current = true;
    setShowScrollFab(false);
    setNewMessagesCount(0);
    listRef.current?.scrollToOffset({offset: 0, animated: true});
  }, []);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, e => {
      setKeyboardHeight(e.endCoordinates.height);
      pinListToBottom();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      pinListToBottom();
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [pinListToBottom]);

  const listComposerPad = composerHeight;
  listComposerPadRef.current = listComposerPad;

  const handleComposerHeight = useCallback((height: number) => {
    setComposerHeight(height);
  }, []);

  const syncStickyDate = useCallback(() => {
    const next = resolveStickyDateLabel(
      listRowsRef.current,
      rowHeightsRef.current,
      scrollYRef.current,
      listHeightRef.current,
      headerChromeHeightRef.current + STICKY_DATE_SLOT / 2,
      listComposerPadRef.current,
      dateLabelsRef.current,
    );
    if (next && next !== stickyDateLabelRef.current) {
      stickyDateLabelRef.current = next;
      setStickyDateLabel(next);
    }
  }, []);

  const handleListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      syncStickyDate();
      const near = y < NEAR_BOTTOM_THRESHOLD;
      nearBottomRef.current = near;
      setShowScrollFab(!near);
      if (near && newMessagesCount > 0) {
        setNewMessagesCount(0);
      }
    },
    [newMessagesCount, syncStickyDate],
  );

  useEffect(() => {
    pinListToBottom();
  }, [keyboardHeight, listComposerPad, pinListToBottom]);

  const bubbleTheme: BubbleTheme = useMemo(
    () => ({
      bubbleOut: theme.bubbleOut,
      bubbleIn: theme.bubbleIn,
      bubbleOutText: theme.bubbleOutText,
      bubbleOutBorder: theme.bubbleOutBorder,
      bubbleOutMuted: theme.bubbleOutMuted,
      bubbleInText: theme.bubbleInText,
      bubbleInBorder: theme.bubbleInBorder,
      tertiaryLabel: theme.tertiaryLabel,
      secondaryLabel: theme.secondaryLabel,
      fill: theme.fill,
      border: theme.border,
      label: theme.label,
    }),
    [theme],
  );

  const channelType =
    chatMeta?.channel?.type ||
    (chatMeta?.channel_details as {type?: string} | undefined)?.type ||
    null;
  const chatType = chatMeta?.type || chatMeta?.chat_type || null;
  const isInternal = isInternalChatType(chatType);
  const isGroupChat =
    chatType === 'internal_group' ||
    chatType === 'external_group' ||
    chatType === 'internal_direct';

  const channelFeatures = useMemo(
    () =>
      getChannelFeatures(channelType, {
        isInternalChat: isInternal,
      }),
    [channelType, isInternal],
  );

  const messageWindow = useMemo(
    () =>
      computeMessageWindow({
        channelType,
        lastCustomerMessageAt: chatMeta?.last_customer_message_at as
          | string
          | null
          | undefined,
        isInternalChat: isInternal,
        channelFeatures,
      }),
    [channelType, chatMeta?.last_customer_message_at, isInternal, channelFeatures],
  );

  const isAssignee = !!userId && chatMeta?.assigned_to === userId;
  const isCollaborator = collaborators.some(
    c => c.user_id === userId && !c.left_at,
  );
  const canInteract = isAssignee || isCollaborator;
  const canSendAsCollaborator =
    isCollaborator && chatsPermissions.canBecomeCollaborator;

  const loadCollaborators = useCallback(async () => {
    if (!chatId) return;
    const {data} = await supabase
      .from('chat_collaborators')
      .select('id, user_id, left_at')
      .eq('chat_id', chatId);
    setCollaborators((data as typeof collaborators) || []);
  }, [chatId]);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(true);
      setHeaderLoading(true);
      setFooterLoading(true);
      return;
    }
    setLoading(true);
    setHeaderLoading(true);
    setFooterLoading(true);
    setFetchError(null);
    setMessages([]);
    setPinned([]);
    setScheduled([]);
    setHasMoreOlder(true);
    setNewMessagesCount(0);
    try {
      const result = await fetchChatThreadBootstrap(chatId, orgId, PAGE_SIZE);
      setMessages(result.messages.filter(m => !isHiddenFromChatThread(m)));
      setChatMeta(result.chat);
      setPinned((result.pinned || []) as PinnedRow[]);
      setScheduled(result.scheduled || []);
      setHasMoreOlder(result.pagination.has_more);
      setFetchError(null);

      const chatName =
        result.chat?.customer?.name ||
        result.chat?.group_name ||
        (typeof result.chat?.name === 'string' ? result.chat.name : undefined);
      if (chatName) {
        setThreadTitle(chatName);
      } else if (title) {
        setThreadTitle(title);
      }
      await loadCollaborators();
    } catch (e) {
      console.error('[ChatThread] load failed', e);
      setFetchError(getFetchErrorKind(e));
    } finally {
      setLoading(false);
      setHeaderLoading(false);
      setFooterLoading(false);
    }
  }, [chatId, orgId, title, loadCollaborators]);

  const loadOlder = useCallback(async () => {
    if (!orgId || loadingOlderRef.current || !hasMoreOlder) return;
    const oldest = messages[messages.length - 1]?.created_at;
    if (!oldest) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const result = await fetchMessages(chatId, orgId, PAGE_SIZE, oldest);
      if (result.data.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id));
        const unique = result.data.filter(
          m => !seen.has(m.id) && !isHiddenFromChatThread(m),
        );
        return [...prev, ...unique];
      });
      setHasMoreOlder(result.pagination.has_more);
    } catch (e) {
      console.warn('[ChatThread] loadOlder failed', e);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [chatId, orgId, hasMoreOlder, messages]);

  useEffect(() => {
    void load();
  }, [load, chatId, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel(`native-messages-${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`,
        },
        payload => {
          if (payload.eventType === 'INSERT' && payload.new) {
            const msg = payload.new as ChatMessage;
            if (isHiddenFromChatThread(msg)) return;
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              return [msg, ...prev];
            });
            if (!nearBottomRef.current) {
              setNewMessagesCount(c => c + 1);
              setShowScrollFab(true);
            } else {
              pinListToBottom();
            }
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const msg = payload.new as ChatMessage;
            if (isHiddenFromChatThread(msg)) {
              setMessages(prev => prev.filter(m => m.id !== msg.id));
              return;
            }
            setMessages(prev =>
              prev.map(m => (m.id === msg.id ? {...m, ...msg} : m)),
            );
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const id = (payload.old as {id?: string}).id;
            if (id) setMessages(prev => prev.filter(m => m.id !== id));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pinned_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        () => {
          void supabase
            .from('pinned_messages')
            .select('id, message_id, comment, message:messages(content, type)')
            .eq('chat_id', chatId)
            .then(({data}) => {
              if (data) setPinned(data as PinnedRow[]);
            });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chats',
          filter: `id=eq.${chatId}`,
        },
        payload => {
          const updated = payload.new as Partial<ChatListItem> | undefined;
          if (!updated) return;
          setChatMeta(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              ...updated,
              // Relacionamentos embutidos não vêm no payload realtime
              customer: prev.customer,
              channel: prev.channel,
              channel_details: prev.channel_details,
              team: prev.team,
              last_message: prev.last_message,
              metadata: prev.metadata,
            };
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, pinListToBottom]);

  const openMoreActions = () => {
    const buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: 'cancel' | 'destructive';
    }> = [
      {text: t.chats.cancel, style: 'cancel'},
      {
        text: t.thread.chatDetails || 'Detalhes do chat',
        onPress: () => setDetailsOpen(true),
      },
      {
        text: t.chats.openWeb,
        onPress: () => onOpenWeb(`/app/chats/${chatId}`),
      },
    ];
    if (isAssignee) {
      buttons.push({
        text: t.thread.leaveAttendance || 'Sair do atendimento',
        onPress: () => {
          if (!orgId) return;
          void leaveAttendance(orgId, chatId)
            .then(() => load())
            .catch(() =>
              Alert.alert(t.thread.errorTitle, 'Não foi possível sair'),
            );
        },
      });
    }
    if (chatMeta?.status === 'in_progress') {
      buttons.push({
        text: t.thread.resolve || 'Resolver',
        style: 'destructive',
        onPress: () => {
          if (!orgId) return;
          void markChatResolved(orgId, chatId)
            .then(() => load())
            .catch(() =>
              Alert.alert(t.thread.errorTitle, 'Não foi possível resolver'),
            );
        },
      });
    }
    Alert.alert(t.thread.actions, undefined, buttons);
  };

  const handleAttend = useCallback(async () => {
    if (!orgId || actionBusy) return;
    setActionBusy(true);
    try {
      if (chatMeta?.flow_session_id) {
        await pauseFlow(orgId, chatId);
      }
      await attendChat(orgId, chatId);
      await load();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : 'Erro ao atender',
      );
    } finally {
      setActionBusy(false);
    }
  }, [orgId, actionBusy, chatMeta?.flow_session_id, chatId, load, t.thread.errorTitle]);

  const handleJoin = useCallback(async () => {
    if (!orgId || !userId || actionBusy) return;
    setActionBusy(true);
    try {
      await addCollaborator(orgId, chatId, userId);
      await load();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : 'Erro ao participar',
      );
    } finally {
      setActionBusy(false);
    }
  }, [orgId, userId, actionBusy, chatId, load, t.thread.errorTitle]);

  const handleReopen = useCallback(async () => {
    if (!orgId || actionBusy) return;
    setActionBusy(true);
    try {
      await reopenChat(orgId, chatId);
      await load();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : 'Erro ao reabrir',
      );
    } finally {
      setActionBusy(false);
    }
  }, [orgId, actionBusy, chatId, load, t.thread.errorTitle]);

  const handleComposerSent = useCallback(() => {
    if (!orgId) return;
    void markChatUnread(orgId, chatId, false).catch(() => undefined);
  }, [orgId, chatId]);

  const handleLongPress = useCallback(
    (message: ChatMessage, anchor: MessageAnchor) => {
      setActionMessage(message);
      setActionAnchor(anchor);
    },
    [],
  );

  const closeActionSheet = useCallback(() => {
    setActionMessage(null);
    setActionAnchor(null);
  }, []);

  const handleReply = useCallback((message: ChatMessage) => {
    setReplyTo(message);
  }, []);

  const handleCopy = useCallback(
    async (message: ChatMessage) => {
      const content = message.content?.trim();
      if (!content) return;
      const result = await copyText(content);
      if (result === 'copied') {
        Alert.alert(t.messageActions.copied);
      }
    },
    [t.messageActions.copied],
  );

  const handleDetails = useCallback(
    (message: ChatMessage) => {
      onOpenMessageDetails({chatId, message, channelType});
    },
    [chatId, channelType, onOpenMessageDetails],
  );

  const handleDownload = useCallback(
    async (message: ChatMessage) => {
      const media = getDownloadableMedia(message);
      if (!media) return;

      setDownloading(true);
      const result = await downloadMessageMedia(media);
      setDownloading(false);

      switch (result) {
        case 'saved_gallery':
          Alert.alert(t.messageActions.downloadedToGallery);
          break;
        case 'saved_file':
          Alert.alert(t.messageActions.downloadedToFiles);
          break;
        case 'permission_denied':
          Alert.alert(
            t.messageActions.downloadError,
            t.imageViewer.permissionDenied,
          );
          break;
        case 'unavailable':
          Alert.alert(
            t.messageActions.downloadError,
            t.imageViewer.rebuildRequired,
          );
          break;
        case 'error':
          Alert.alert(t.messageActions.downloadError);
          break;
        default:
          // 'shared' | 'opened' | 'cancelled': o sistema já deu o feedback
          break;
      }
    },
    [t.messageActions, t.imageViewer],
  );

  const handleReact = useCallback(
    async (message: ChatMessage, emoji: string) => {
      if (!orgId || reacting) return;
      setReacting(true);
      try {
        await reactToMessage(orgId, chatId, message.id, emoji);
        if (userId) {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== message.id) return m;
              const meta = {
                ...((m.metadata as Record<string, unknown>) || {}),
              };
              const current =
                (meta.reactions as Record<
                  string,
                  {reaction: string; created_at?: string}
                >) || {};
              const existing = current[userId];
              const nextReactions =
                existing?.reaction === emoji
                  ? Object.fromEntries(
                      Object.entries(current).filter(([id]) => id !== userId),
                    )
                  : {
                      ...current,
                      [userId]: {
                        reaction: emoji,
                        created_at: new Date().toISOString(),
                      },
                    };
              return {
                ...m,
                metadata: {...meta, reactions: nextReactions},
              };
            }),
          );
        }
      } catch (e) {
        console.error('[ChatThread] react failed', e);
        Alert.alert(t.thread.errorTitle, t.messageActions.reactError);
      } finally {
        setReacting(false);
      }
    },
    [orgId, chatId, reacting, userId, t.thread.errorTitle, t.messageActions.reactError],
  );

  const handleMoreEmojis = useCallback((message: ChatMessage) => {
    setEmojiTarget(message);
    setTimeout(() => setEmojiPickerOpen(true), 80);
  }, []);

  const handleEmojiPickerClose = useCallback(() => {
    setEmojiPickerOpen(false);
    setEmojiTarget(null);
  }, []);

  const handleEmojiPicked = useCallback(
    (emoji: string) => {
      const message = emojiTarget;
      setEmojiPickerOpen(false);
      setEmojiTarget(null);
      if (message) {
        void handleReact(message, emoji);
      }
    },
    [emojiTarget, handleReact],
  );

  const pinnedIds = useMemo(
    () => new Set(pinned.map(p => p.message_id)),
    [pinned],
  );

  const actionCanEdit =
    !!actionMessage &&
    actionMessage.sender_type === 'agent' &&
    (actionMessage.type === 'text' || !actionMessage.type) &&
    channelFeatures.canEditMessages &&
    canEditMessageByAge(actionMessage.created_at);

  const actionCanDelete =
    !!actionMessage &&
    channelFeatures.canDeleteMessages &&
    canDeleteMessageByAge(actionMessage.created_at, chatMeta?.status) &&
    (actionMessage.sender_type === 'agent' ||
      actionMessage.status === 'scheduled');

  const actionCanPin = !!actionMessage && !isHiddenFromChatThread(actionMessage);

  const handleDeleteMsg = useCallback(
    (message: ChatMessage) => {
      if (!orgId) return;
      Alert.alert('Excluir mensagem', 'Deseja excluir esta mensagem?', [
        {text: t.chats.cancel, style: 'cancel'},
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            void deleteMessage(orgId, chatId, message.id)
              .then(() =>
                setMessages(prev => prev.filter(m => m.id !== message.id)),
              )
              .catch(() =>
                Alert.alert(t.thread.errorTitle, 'Falha ao excluir'),
              );
          },
        },
      ]);
    },
    [orgId, chatId, t.chats.cancel, t.thread.errorTitle],
  );

  const handlePinMsg = useCallback(
    async (message: ChatMessage) => {
      try {
        await pinMessage(chatId, message.id);
      } catch {
        Alert.alert(t.thread.errorTitle, 'Falha ao fixar');
      }
    },
    [chatId, t.thread.errorTitle],
  );

  const handleUnpinMsg = useCallback(
    async (message: ChatMessage) => {
      try {
        await unpinMessage(chatId, message.id);
        setPinned(prev => prev.filter(p => p.message_id !== message.id));
      } catch {
        Alert.alert(t.thread.errorTitle, 'Falha ao desfixar');
      }
    },
    [chatId, t.thread.errorTitle],
  );

  const handleCancelScheduled = useCallback(
    (messageId: string) => {
      if (!orgId) return;
      void deleteMessage(orgId, chatId, messageId)
        .then(() =>
          setScheduled(prev => prev.filter(m => m.id !== messageId)),
        )
        .catch(() =>
          Alert.alert(t.thread.errorTitle, 'Falha ao cancelar agendamento'),
        );
    },
    [orgId, chatId, t.thread.errorTitle],
  );

  const externalId =
    (chatMeta?.external_id as string | undefined) ||
    chatMeta?.customer?.whatsapp ||
    null;

  const dateLabels = useMemo(
    () => ({today: t.thread.today, yesterday: t.thread.yesterday}),
    [t.thread.today, t.thread.yesterday],
  );

  const listRows = useMemo(
    () => buildMessageListRows(messages, dateLabels),
    [messages, dateLabels],
  );
  listRowsRef.current = listRows;
  dateLabelsRef.current = dateLabels;

  useEffect(() => {
    stickyDateLabelRef.current = null;
    setStickyDateLabel(null);
    rowHeightsRef.current.clear();
    scrollYRef.current = 0;
  }, [chatId]);

  useEffect(() => {
    syncStickyDate();
    if (stickyDateLabelRef.current || !messages[0]) return;
    const fallback = formatMessageDayLabel(messages[0].created_at, dateLabels);
    if (!fallback) return;
    stickyDateLabelRef.current = fallback;
    setStickyDateLabel(fallback);
  }, [listRows, headerChromeHeight, listComposerPad, syncStickyDate, messages, dateLabels]);

  const renderItem = useCallback(
    ({item, index}: ListRenderItemInfo<MessageListRow>) => {
      if (item.kind === 'date') {
        return <DateSeparator label={item.label} />;
      }

      // Gap olha a vizinha mais nova (index-1). Se no caminho há chip de data,
      // o separador já dá respiro — evita somar 22px em cima do padding da data.
      const towardNewer = listRows[index - 1];
      const spacingAfter =
        towardNewer?.kind === 'date'
          ? 2
          : getSpacingAfterMessage(
              item.message,
              findNeighborMessage(listRows, index, -1),
            );

      return (
        <MessageBubble
          item={item.message}
          theme={bubbleTheme}
          spacingAfter={spacingAfter}
          onLongPress={handleLongPress}
        />
      );
    },
    [bubbleTheme, handleLongPress, listRows],
  );

  const keyExtractor = useCallback((item: MessageListRow) => item.id, []);

  const renderListCell = useCallback(
    ({
      children,
      style,
      onLayout,
      item,
    }: {
      children?: React.ReactNode;
      style?: object;
      onLayout?: (event: {
        nativeEvent: {layout: {height: number}};
      }) => void;
      item: MessageListRow;
      index: number;
    }) => (
      <View
        style={style}
        onLayout={e => {
          onLayout?.(e);
          const h = e.nativeEvent.layout.height;
          if (rowHeightsRef.current.get(item.id) !== h) {
            rowHeightsRef.current.set(item.id, h);
            syncStickyDate();
          }
        }}>
        {children}
      </View>
    ),
    [syncStickyDate],
  );

  const listFooter =
    hasMoreOlder || loadingOlder ? (
      <View style={[styles.loadOlder, loadingOlder && styles.loadOlderActive]}>
        {loadingOlder ? (
          <ActivityIndicator size="small" color={theme.tertiaryLabel} />
        ) : null}
      </View>
    ) : null;

  const showInput =
    chatMeta?.status === 'in_progress' &&
    messageWindow.canSendMessage &&
    (canInteract || canSendAsCollaborator);

  const avatarUrl = isGroupChat
    ? chatMeta?.group_avatar_url || chatMeta?.profile_picture || null
    : chatMeta?.profile_picture ||
      chatMeta?.customer?.profile_picture ||
      null;

  // Fades longos e suaves — atrás do header / input
  const topFadeHeight = Math.max(insets.top, 20) + 72;
  const bottomFadeHeight = Math.max(insets.bottom, 10) + 64;
  const edgeFadeColor = theme.pageBg;

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={[]}>
      {/* Fade no topo — legibilidade do horário iOS */}
      <View style={styles.topFade} pointerEvents="none">
        <Svg width={windowWidth} height={topFadeHeight}>
          <Defs>
            <LinearGradient id="topEdgeFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={edgeFadeColor} stopOpacity="1" />
              <Stop offset="0.28" stopColor={edgeFadeColor} stopOpacity="0.88" />
              <Stop offset="0.55" stopColor={edgeFadeColor} stopOpacity="0.45" />
              <Stop offset="0.78" stopColor={edgeFadeColor} stopOpacity="0.18" />
              <Stop offset="1" stopColor={edgeFadeColor} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={windowWidth}
            height={topFadeHeight}
            fill="url(#topEdgeFade)"
          />
        </Svg>
      </View>

      {/* Fade no bottom — baixo, atrás do input (home indicator) */}
      <View
        style={[styles.bottomFade, {bottom: keyboardHeight}]}
        pointerEvents="none">
        <Svg width={windowWidth} height={bottomFadeHeight}>
          <Defs>
            <LinearGradient id="bottomEdgeFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={edgeFadeColor} stopOpacity="0" />
              <Stop offset="0.22" stopColor={edgeFadeColor} stopOpacity="0.12" />
              <Stop offset="0.45" stopColor={edgeFadeColor} stopOpacity="0.32" />
              <Stop offset="0.68" stopColor={edgeFadeColor} stopOpacity="0.62" />
              <Stop offset="0.86" stopColor={edgeFadeColor} stopOpacity="0.88" />
              <Stop offset="1" stopColor={edgeFadeColor} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={windowWidth}
            height={bottomFadeHeight}
            fill="url(#bottomEdgeFade)"
          />
        </Svg>
      </View>

      {/* Sticker de data sticky (Hoje / Ontem / …) — abaixo do header */}
      {stickyDateLabel ? (
        <View
          style={[styles.stickyDate, {top: headerChromeHeight}]}
          pointerEvents="none">
          <DateSeparator label={stickyDateLabel} floating />
        </View>
      ) : null}

      {/* Header flutuante com blur — sobrepõe a lista (paridade web) */}
      <View
        style={[styles.floatingHeader, {paddingTop: insets.top}]}
        pointerEvents="box-none"
        onLayout={e => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (h > 0 && h !== headerChromeHeight) {
            setHeaderChromeHeight(h);
          }
        }}>
        <ChatThreadHeader
          title={threadTitle || title || t.thread.conversation}
          subtitle={isGroupChat ? null : externalId}
          avatarUrl={avatarUrl}
          channelType={channelType}
          headerLoading={headerLoading || (loading && !chatMeta)}
          status={chatMeta?.status}
          hasActiveFlow={!!chatMeta?.flow_session_id}
          canStartFlow={
            !isGroupChat &&
            (chatMeta?.status === 'pending' ||
              chatMeta?.status === 'in_progress')
          }
          isAssignee={isAssignee}
          isCollaborator={isCollaborator}
          canBecomeCollaborator={chatsPermissions.canBecomeCollaborator}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canResolve={chatMeta?.status === 'in_progress'}
          onBack={onBack}
          onPauseFlow={() => setActiveFlowModalOpen(true)}
          onStartFlow={() => setFlowModalOpen(true)}
          onMore={openMoreActions}
          onPressProfile={
            chatMeta?.customer?.id
              ? () => {
                  const customerId = chatMeta.customer!.id!;
                  const qs = chatId
                    ? `?chatId=${encodeURIComponent(chatId)}`
                    : '';
                  onOpenWeb(`/app/customers/${customerId}/edit${qs}`);
                }
              : undefined
          }
        />
      </View>

      <View style={styles.flex}>
        {!loading && !fetchError ? (
          <View style={[styles.stripsBelowHeader, {top: headerChromeHeight}]}>
            <PinnedMessagesStrip
              pinned={pinned}
              expanded={pinnedExpanded}
              onToggle={() => setPinnedExpanded(v => !v)}
              onPressMessage={() => undefined}
              onUnpin={row => {
                void unpinMessage(chatId, row.message_id).then(() =>
                  setPinned(prev => prev.filter(p => p.id !== row.id)),
                );
              }}
            />
            <ScheduledMessagesStrip
              scheduled={scheduled}
              onCancel={handleCancelScheduled}
            />
          </View>
        ) : null}

        {loading || !orgId ? (
          <View style={{paddingTop: headerChromeHeight, flex: 1}}>
            <ChatThreadSkeleton />
          </View>
        ) : fetchError ? (
          <View style={{paddingTop: headerChromeHeight, flex: 1}}>
            <FetchErrorState kind={fetchError} onRetry={() => void load()} />
          </View>
        ) : (
          <View style={[styles.flex, {marginBottom: keyboardHeight}]}>
            {messages.length === 0 ? (
              <View
                style={[styles.emptyThread, {paddingTop: headerChromeHeight}]}>
                <Text
                  style={[
                    styles.emptyThreadText,
                    {color: theme.tertiaryLabel},
                  ]}>
                  {t.thread.empty}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={listRows}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                CellRendererComponent={renderListCell}
                inverted
                contentContainerStyle={[
                  styles.listContent,
                  {
                    // inverted: paddingTop = baixo (composer); paddingBottom = topo (header + sticky date)
                    paddingTop: listComposerPad,
                    paddingBottom:
                      headerChromeHeight + STICKY_DATE_SLOT + spacing.sm,
                  },
                ]}
                onLayout={e => {
                  const h = e.nativeEvent.layout.height;
                  if (h > 0 && h !== listHeightRef.current) {
                    listHeightRef.current = h;
                    syncStickyDate();
                  }
                }}
                onScroll={handleListScroll}
                scrollEventThrottle={16}
                onEndReached={loadOlder}
                onEndReachedThreshold={0.2}
                ListFooterComponent={listFooter}
                ListFooterComponentStyle={styles.loadOlderFooter}
                initialNumToRender={16}
                maxToRenderPerBatch={10}
                windowSize={7}
                updateCellsBatchingPeriod={50}
                removeClippedSubviews={Platform.OS === 'android'}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                maintainVisibleContentPosition={
                  Platform.OS === 'ios' && keyboardHeight === 0
                    ? {minIndexForVisible: 1}
                    : undefined
                }
              />
            )}
            <ScrollToBottomFab
              visible={showScrollFab}
              newCount={newMessagesCount}
              bottomOffset={listComposerPad + spacing.sm}
              onPress={scrollToBottom}
            />
          </View>
        )}

        {fetchError || !orgId || loading ? null : (
          <View style={styles.composerLayer} pointerEvents="box-none">
            <ChatThreadFooter
              status={chatMeta?.status}
              canSendMessage={messageWindow.canSendMessage}
              canInteract={canInteract}
              canSendAsCollaborator={canSendAsCollaborator}
              isGroupChat={isGroupChat}
              channelFeatures={channelFeatures}
              footerLoading={footerLoading}
              canBecomeCollaborator={chatsPermissions.canBecomeCollaborator}
              isOwnerOrAdmin={isOwnerOrAdmin}
              attending={actionBusy}
              joining={actionBusy}
              reopening={actionBusy}
              onAttend={() => void handleAttend()}
              onJoin={() => void handleJoin()}
              onTransferToMe={() => void handleAttend()}
              onOpenTemplate={() => setTemplateOpen(true)}
              onReopen={() => void handleReopen()}>
              {showInput ? (
                <MessageInput
                  chatId={chatId}
                  organizationId={orgId}
                  channelFeatures={channelFeatures}
                  replyTo={replyTo}
                  onClearReply={() => setReplyTo(null)}
                  onSent={handleComposerSent}
                  keyboardHeight={keyboardHeight}
                  onHeightChange={handleComposerHeight}
                  variableContext={{
                    customerName: chatMeta?.customer?.name,
                    customerFirstName: chatMeta?.customer?.name?.split(' ')[0],
                    chatStatus: chatMeta?.status,
                    ticketNumber: chatMeta?.ticket_number as string | undefined,
                  }}
                />
              ) : null}
            </ChatThreadFooter>
          </View>
        )}
      </View>

      <MessageActionSheet
        visible={!!actionMessage && !!actionAnchor}
        message={actionMessage}
        anchor={actionAnchor}
        bubbleTheme={bubbleTheme}
        channelFeatures={channelFeatures}
        chatStatus={chatMeta?.status}
        reacting={reacting}
        canEdit={actionCanEdit}
        canDelete={actionCanDelete}
        canPin={actionCanPin}
        isPinned={
          !!actionMessage && pinnedIds.has(actionMessage.id)
        }
        onClose={closeActionSheet}
        onReply={handleReply}
        onReact={handleReact}
        onCopy={msg => void handleCopy(msg)}
        onDetails={handleDetails}
        onMoreEmojis={handleMoreEmojis}
        onEdit={msg => setEditMessage(msg)}
        onDelete={handleDeleteMsg}
        onPin={msg => void handlePinMsg(msg)}
        onUnpin={msg => void handleUnpinMsg(msg)}
        onDownload={msg => void handleDownload(msg)}
      />

      <Modal visible={downloading} transparent animationType="fade">
        <View style={styles.downloadOverlay}>
          <View style={[styles.downloadCard, {backgroundColor: theme.groupBg}]}>
            <ActivityIndicator size="large" color={brand.blue} />
            <Text style={[styles.downloadText, {color: theme.label}]}>
              {t.messageActions.downloading}
            </Text>
          </View>
        </View>
      </Modal>

      <ChatEmojiPicker
        open={emojiPickerOpen}
        onClose={handleEmojiPickerClose}
        onEmojiSelected={handleEmojiPicked}
      />

      {orgId ? (
        <>
          <FlowPickerModal
            visible={flowModalOpen}
            organizationId={orgId}
            chatId={chatId}
            onClose={() => setFlowModalOpen(false)}
            onStarted={sessionId => {
              setFlowModalOpen(false);
              // Atualiza só o estado do chat — mensagens do fluxo entram via realtime
              if (sessionId) {
                setChatMeta(prev =>
                  prev
                    ? {...prev, flow_session_id: sessionId, status: 'in_progress'}
                    : prev,
                );
              }
            }}
          />
          {chatMeta?.flow_session_id ? (
            <ActiveFlowModal
              visible={activeFlowModalOpen}
              organizationId={orgId}
              chatId={chatId}
              flowSessionId={String(chatMeta.flow_session_id)}
              onClose={() => setActiveFlowModalOpen(false)}
              onPaused={() => {
                setActiveFlowModalOpen(false);
                setChatMeta(prev =>
                  prev ? {...prev, flow_session_id: null} : prev,
                );
              }}
            />
          ) : null}
          <WhatsAppTemplateSheet
            visible={templateOpen}
            organizationId={orgId}
            chatId={chatId}
            channelId={
              (chatMeta?.channel as {id?: string} | undefined)?.id ||
              (chatMeta?.channel_id as string | undefined)
            }
            onClose={() => setTemplateOpen(false)}
            onSent={() => {
              setTemplateOpen(false);
              void load();
            }}
          />
          <ChatDetailsModal
            visible={detailsOpen}
            chatId={chatId}
            organizationId={orgId}
            onClose={() => setDetailsOpen(false)}
          />
          <EditMessageModal
            visible={!!editMessage}
            organizationId={orgId}
            chatId={chatId}
            messageId={editMessage?.id || ''}
            initialContent={editMessage?.content}
            onClose={() => setEditMessage(null)}
            onSaved={content => {
              if (!editMessage) return;
              const id = editMessage.id;
              setMessages(prev =>
                prev.map(m => (m.id === id ? {...m, content} : m)),
              );
              setEditMessage(null);
            }}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  flex: {flex: 1},
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Atrás do header (nome/avatar) — só status bar + blend
    zIndex: 20,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Atrás do input — só cobre home indicator / base
    zIndex: 15,
  },
  composerLayer: {
    zIndex: 25,
    elevation: 25,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  stickyDate: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 28,
    alignItems: 'center',
  },
  stripsBelowHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 22,
  },

  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyThread: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyThreadText: {
    fontSize: typography.callout,
  },
  loadOlderFooter: {marginBottom: 2},
  loadOlder: {
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadOlderActive: {
    height: 40,
  },
  downloadOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  downloadCard: {
    minWidth: 180,
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.xl,
  },
  downloadText: {
    fontSize: typography.callout,
    fontWeight: '500',
  },
});
