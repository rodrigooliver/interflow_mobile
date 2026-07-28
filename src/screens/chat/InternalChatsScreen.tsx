import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../contexts/AuthContext';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, glassShadow, radii, spacing, typography} from '../../theme/tokens';
import {
  applyQuickFilterCriteria,
  emptyFilterInput,
} from '../../utils/chatFilterRpc';
import {PAGE_SIZE, fetchChatsPage, type ChatListItem} from '../../services/chatsApi';
import {supabase} from '../../lib/supabase';
import {ChatListSkeleton} from '../../components/Skeleton';
import {ChatListRow} from '../../components/ChatListRow';
import {FetchErrorState} from '../../components/FetchErrorState';
import {FLOATING_TAB_BAR_CLEARANCE} from '../../components/BottomTabBar';
import {
  getFetchErrorKind,
  type FetchErrorKind,
} from '../../utils/networkError';

interface InternalChatsScreenProps {
  onOpenChat: (chatId: string, title?: string) => void;
  onOpenWeb: (path: string) => void;
}

function chatTitle(item: ChatListItem): string {
  return item.group_name?.trim() || item.customer?.name?.trim() || 'Chat';
}

const INTERNAL_FILTER = {
  selectedChatTypes: ['internal_group', 'internal_direct'],
  selectedStatuses: [] as string[],
  selectedSpamFilter: '',
  isCollaboratingFilter: '',
};

export function InternalChatsScreen({
  onOpenChat,
  onOpenWeb,
}: InternalChatsScreenProps) {
  const {session, currentOrganizationMember} = useAuth();
  const {theme: mode, colors: theme} = useTheme();
  const {t} = useI18n();

  const orgId = currentOrganizationMember?.organization_id;
  const userId = session?.user?.id;

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState<FetchErrorKind | null>(null);
  const [search, setSearch] = useState('');
  const offsetRef = useRef(0);

  const loadChats = useCallback(
    async (reset = true) => {
      if (!orgId || !userId) return;
      const offset = reset ? 0 : offsetRef.current;
      let input = emptyFilterInput(orgId, userId, 'internal');
      input = applyQuickFilterCriteria(input, 'internal', INTERNAL_FILTER);
      input.offset = offset;
      input.pageSize = PAGE_SIZE;
      if (search.trim()) input.searchText = search.trim();

      if (reset) {
        setLoading(true);
        setFetchError(null);
      } else setLoadingMore(true);

      try {
        const page = await fetchChatsPage(input);
        setChats(prev => (reset ? page : [...prev, ...page]));
        offsetRef.current = offset + page.length;
        setHasMore(page.length >= PAGE_SIZE);
        if (reset) setFetchError(null);
      } catch (e) {
        console.error('[InternalChats] load failed', e);
        if (reset) setFetchError(getFetchErrorKind(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [orgId, userId, search],
  );

  useEffect(() => {
    offsetRef.current = 0;
    setChats([]);
    void loadChats(true);
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`native-internal-chats-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats',
          filter: `organization_id=eq.${orgId}`,
        },
        () => {
          void loadChats(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, loadChats]);

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.stickyHeader,
            borderBottomColor: theme.border,
          },
        ]}>
        <Text style={[styles.title, {color: theme.label}]}>
          {t.internal.title}
        </Text>
        <Text style={[styles.subtitle, {color: theme.tertiaryLabel}]}>
          {t.internal.subtitle}
        </Text>

        <View
          style={[
            styles.searchBox,
            glassShadow(mode),
            {
              backgroundColor: theme.searchBg,
              borderColor: theme.border,
            },
          ]}>
          <Text style={[styles.searchIcon, {color: theme.tertiaryLabel}]}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => {
              offsetRef.current = 0;
              void loadChats(true);
            }}
            placeholder={t.chats.search}
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {loading && chats.length === 0 ? (
        <ChatListSkeleton />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            chats.length === 0 && styles.listContentEmpty,
          ]}
          data={chats}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                offsetRef.current = 0;
                void loadChats(true);
              }}
              tintColor={brand.blue}
            />
          }
          onEndReached={() => {
            if (!loadingMore && hasMore) void loadChats(false);
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            fetchError ? (
              <FetchErrorState
                kind={fetchError}
                compact
                onRetry={() => {
                  offsetRef.current = 0;
                  void loadChats(true);
                }}
              />
            ) : (
              <View style={styles.centered}>
                <Text style={[styles.emptyText, {color: theme.secondaryLabel}]}>
                  {t.internal.empty}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={{margin: spacing.lg}} color={brand.blue} />
            ) : null
          }
          renderItem={({item}) => {
            const title = chatTitle(item);
            return (
              <ChatListRow
                item={item}
                title={title}
                onPress={() => onOpenChat(item.id, title)}
                onLongPress={() => {
                  Alert.alert(title, undefined, [
                    {text: t.chats.cancel, style: 'cancel'},
                    {
                      text: t.chats.openWeb,
                      onPress: () => onOpenWeb(`/app/chats/${item.id}`),
                    },
                  ]);
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  title: {
    fontSize: typography.largeTitle,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: typography.footnote,
    marginBottom: spacing.md,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.md,
    height: 40,
    marginBottom: spacing.sm,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body,
    paddingVertical: Platform.OS === 'ios' ? 0 : 4,
  },
  list: {flex: 1},
  listContent: {
    paddingTop: spacing.sm,
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 180,
  },
  emptyText: {
    fontSize: typography.callout,
    textAlign: 'center',
  },
});
