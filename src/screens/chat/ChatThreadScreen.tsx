import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Keyboard,
  type ListRenderItemInfo,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {useAuth} from '../../contexts/AuthContext';
import {brand, spacing, typography} from '../../theme/tokens';
import {
  fetchChatThreadBootstrap,
  fetchMessages,
  type ChatListItem,
  type ChatMessage,
} from '../../services/chatsApi';
import {
  MessageComposer,
  COMPOSER_LIST_PAD,
} from '../../components/chat/composer';
import {
  assignChatToMe,
  markChatRead,
  markChatResolved,
} from '../../services/chatActions';
import {copyText, reactToMessage} from '../../services/messageActions';
import {usePermissions} from '../../hooks/usePermissions';
import {supabase} from '../../lib/supabase';
import {ChatThreadSkeleton} from '../../components/Skeleton';
import {FetchErrorState} from '../../components/FetchErrorState';
import {
  MessageBubble,
  type BubbleTheme,
} from '../../components/chat/MessageBubble';
import {
  MessageActionSheet,
  type MessageAnchor,
} from '../../components/chat/MessageActionSheet';
import {ChatEmojiPicker} from '../../components/chat/ChatEmojiPicker';
import {
  getChannelFeatures,
  isInternalChatType,
} from '../../utils/channelFeatures';
import {
  getFetchErrorKind,
  type FetchErrorKind,
} from '../../utils/networkError';
import {isHiddenFromChatThread} from '../../components/chat/messageHelpers';

const PAGE_SIZE = 40;

interface ChatThreadScreenProps {
  chatId: string;
  title?: string;
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
  onBack,
  onOpenWeb,
  onOpenMessageDetails,
}: ChatThreadScreenProps) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const {currentOrganizationMember, session} = useAuth();
  const {chatsPermissions, isOwnerOrAdmin} = usePermissions();
  const orgId = currentOrganizationMember?.organization_id;
  const userId = session?.user?.id;

  /** Newest-first — FlatList inverted mostra a mais nova embaixo. */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatMeta, setChatMeta] = useState<ChatListItem | null>(null);
  const [threadTitle, setThreadTitle] = useState<string | undefined>(title);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<FetchErrorKind | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const loadingOlderRef = useRef(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageAnchor | null>(null);
  const [reacting, setReacting] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<ChatMessage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const nearBottomRef = useRef(true);

  const pinListToBottom = useCallback(() => {
    if (!nearBottomRef.current) return;
    // Espera o layout do teclado/margin assentar (2 frames + tick)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({offset: 0, animated: false});
        setTimeout(() => {
          listRef.current?.scrollToOffset({offset: 0, animated: false});
        }, 32);
      });
    });
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

  // Com teclado aberto o composer não usa safe-area — alinhar o pad da lista
  const listComposerPad = useMemo(() => {
    const safe =
      keyboardHeight > 0 ? 0 : Math.max(0, insets.bottom - spacing.sm);
    return COMPOSER_LIST_PAD + safe;
  }, [keyboardHeight, insets.bottom]);

  const handleListScroll = useCallback(
    (e: {nativeEvent: {contentOffset: {y: number}}}) => {
      // inverted: perto do "fundo" visual quando offset é baixo
      nearBottomRef.current = e.nativeEvent.contentOffset.y < 80;
    },
    [],
  );

  // Depois que o pad/margin muda, reancora se estiver no fim
  useEffect(() => {
    pinListToBottom();
  }, [keyboardHeight, listComposerPad, pinListToBottom]);

  const bubbleTheme: BubbleTheme = useMemo(
    () => ({
      bubbleOut: theme.bubbleOut,
      bubbleIn: theme.bubbleIn,
      bubbleOutText: theme.bubbleOutText,
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
  const channelFeatures = useMemo(
    () =>
      getChannelFeatures(channelType, {
        isInternalChat: isInternalChatType(chatType),
      }),
    [channelType, chatType],
  );

  const load = useCallback(async () => {
    // Mantém skeleton enquanto a org ainda não hidratou (evita tela branca)
    if (!orgId) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setFetchError(null);
    setMessages([]);
    setHasMoreOlder(true);
    try {
      const result = await fetchChatThreadBootstrap(chatId, orgId, PAGE_SIZE);
      setMessages(result.messages.filter(m => !isHiddenFromChatThread(m)));
      setChatMeta(result.chat);
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
      // pinned / scheduled disponíveis em result para UI futura
    } catch (e) {
      console.error('[ChatThread] load failed', e);
      setFetchError(getFetchErrorKind(e));
    } finally {
      setLoading(false);
    }
  }, [chatId, orgId, title]);

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
        // inverted: páginas antigas vão para o fim do array
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
    // Unread só zera ao enviar (igual web) — não ao abrir o chat
  }, [load, chatId]);

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
            // Mesmo padrão da web / API: não exibir instructions_model nem scheduled
            if (isHiddenFromChatThread(msg)) return;
            setMessages(prev => {
              if (prev.some(m => m.id === msg.id)) return prev;
              // inverted: novas mensagens no início do array (= embaixo na tela)
              return [msg, ...prev];
            });
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId]);

  const openActions = () => {
    const buttons: Array<{
      text: string;
      onPress?: () => void;
      style?: 'cancel' | 'destructive';
    }> = [
      {text: 'Cancelar', style: 'cancel'},
      {
        text: 'Abrir na Web',
        onPress: () => onOpenWeb(`/app/chats/${chatId}`),
      },
    ];
    if (chatsPermissions.canTransferChats || isOwnerOrAdmin) {
      buttons.push({
        text: 'Transferir (Web)',
        onPress: () => onOpenWeb(`/app/chats/${chatId}`),
      });
    }
    if (session?.user?.id) {
      buttons.push({
        text: 'Assumir atendimento',
        onPress: () => {
          void assignChatToMe(chatId, session.user!.id)
            .then(() => Alert.alert('Ok', 'Chat atribuído a você'))
            .catch(() => Alert.alert('Erro', 'Não foi possível atribuir'));
        },
      });
    }
    buttons.push({
      text: 'Resolver',
      style: 'destructive',
      onPress: () => {
        if (!orgId) return;
        void markChatResolved(orgId, chatId)
          .then(() => Alert.alert('Ok', 'Chat resolvido'))
          .catch(() => Alert.alert('Erro', 'Não foi possível resolver'));
      },
    });
    Alert.alert('Ações', undefined, buttons);
  };

  const handleComposerSent = useCallback(() => {
    void markChatRead(chatId).catch(() => undefined);
  }, [chatId]);

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
    // Overlay fecha com fade no MessageActionSheet (onClose) — evita piscada
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

  const handleReact = useCallback(
    async (message: ChatMessage, emoji: string) => {
      if (!orgId || reacting) return;
      setReacting(true);
      try {
        await reactToMessage(orgId, chatId, message.id, emoji);
        // Optimistic local update (toggle same emoji removes)
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
    // Espera o Modal do action sheet desmontar antes de abrir o picker
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

  const renderItem = useCallback(
    ({item}: ListRenderItemInfo<ChatMessage>) => (
      <MessageBubble
        item={item}
        theme={bubbleTheme}
        onLongPress={handleLongPress}
      />
    ),
    [bubbleTheme, handleLongPress],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const listFooter =
    hasMoreOlder || loadingOlder ? (
      <View style={[styles.loadOlder, loadingOlder && styles.loadOlderActive]}>
        {loadingOlder ? (
          <ActivityIndicator size="small" color={theme.tertiaryLabel} />
        ) : null}
      </View>
    ) : null;

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={['top']}>
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
          {threadTitle || title || t.thread.conversation}
        </Text>
        <TouchableOpacity onPress={openActions} style={styles.navSideEnd} hitSlop={10}>
          <Text style={styles.navLink}>{t.thread.actions}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.flex}>
        {loading || !orgId ? (
          <ChatThreadSkeleton />
        ) : fetchError ? (
          <FetchErrorState kind={fetchError} onRetry={() => void load()} />
        ) : (
          <View style={[styles.flex, {marginBottom: keyboardHeight}]}>
            {messages.length === 0 ? (
              <View style={styles.emptyThread}>
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
                data={messages}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                inverted
                contentContainerStyle={[
                  styles.listContent,
                  // inverted: paddingTop = espaço visual embaixo (composer)
                  {paddingTop: listComposerPad},
                ]}
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
          </View>
        )}

        {fetchError || !orgId || loading ? null : (
          <MessageComposer
            chatId={chatId}
            organizationId={orgId}
            channelFeatures={channelFeatures}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            onSent={handleComposerSent}
            keyboardHeight={keyboardHeight}
          />
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
        onClose={closeActionSheet}
        onReply={handleReply}
        onReact={handleReact}
        onCopy={msg => void handleCopy(msg)}
        onDetails={handleDetails}
        onMoreEmojis={handleMoreEmojis}
      />

      <ChatEmojiPicker
        open={emojiPickerOpen}
        onClose={handleEmojiPickerClose}
        onEmojiSelected={handleEmojiPicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  flex: {flex: 1},
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  navSide: {width: 78},
  navSideEnd: {width: 78, alignItems: 'flex-end'},
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
});
