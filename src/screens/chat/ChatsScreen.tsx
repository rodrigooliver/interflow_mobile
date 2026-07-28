import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {MoreHorizontal, Plus, Search} from 'lucide-react-native';
import {useAuth} from '../../contexts/AuthContext';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {usePermissions} from '../../hooks/usePermissions';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {
  DEFAULT_QUICK_FILTERS,
  applyQuickFilterCriteria,
  emptyFilterInput,
} from '../../utils/chatFilterRpc';
import {
  PAGE_SIZE,
  fetchBatchFilterCounts,
  fetchChatsPage,
  type ChatListItem,
} from '../../services/chatsApi';
import {supabase} from '../../lib/supabase';
import {ChatListSkeleton} from '../../components/Skeleton';
import {ChatListRow} from '../../components/ChatListRow';
import {FetchErrorState} from '../../components/FetchErrorState';
import {FLOATING_TAB_BAR_CLEARANCE} from '../../components/BottomTabBar';
import {
  getFetchErrorKind,
  type FetchErrorKind,
} from '../../utils/networkError';

interface ChatsScreenProps {
  onOpenChat: (chatId: string, title?: string) => void;
  onOpenWeb: (path: string) => void;
}

type QuickFilterItem = {
  id: string;
  label: string;
  showCount: boolean;
  filters?: Record<string, unknown>;
  visibilityScope?: string;
  visibilityIds?: string[];
};

function chatTitle(item: ChatListItem): string {
  const chatType = item.type || item.chat_type;
  if (
    chatType === 'internal_group' ||
    chatType === 'external_group' ||
    chatType === 'internal_direct'
  ) {
    return item.group_name?.trim() || 'Grupo';
  }
  return item.customer?.name?.trim() || 'Sem nome';
}

export function ChatsScreen({onOpenChat, onOpenWeb}: ChatsScreenProps) {
  const {session, currentOrganizationMember} = useAuth();
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const {chatsPermissions} = usePermissions();

  const orgId = currentOrganizationMember?.organization_id;
  const userId = session?.user?.id;

  const orgQuickFilters = useMemo((): QuickFilterItem[] => {
    const settings = currentOrganizationMember?.organization?.settings as
      | {
          chatQuickFilters?: {
            filters?: Array<Record<string, unknown>>;
            defaultFilterId?: string;
          };
        }
      | undefined;
    const configured = settings?.chatQuickFilters?.filters;
    if (Array.isArray(configured) && configured.length > 0) {
      return configured
        .filter((f): f is Record<string, unknown> => Boolean(f?.id))
        .map(f => ({
          id: String(f.id),
          label: String(f.label || f.id),
          showCount: Boolean(f.showCount),
          filters: (f.filters as Record<string, unknown>) || undefined,
          visibilityScope: f.visibilityScope as string | undefined,
          visibilityIds: (f.visibilityIds as string[]) || [],
        }));
    }
    return DEFAULT_QUICK_FILTERS.map(f => ({
      id: f.id,
      label: f.label,
      showCount: f.showCount,
    }));
  }, [currentOrganizationMember?.organization?.settings]);

  const visibleFilters = useMemo((): QuickFilterItem[] => {
    const role = currentOrganizationMember?.role;
    const memberId = currentOrganizationMember?.id;
    return orgQuickFilters.filter((f: QuickFilterItem) => {
      if (!f.visibilityScope || f.visibilityScope === 'all') return true;
      if (f.visibilityScope === 'roles' && role) {
        return (f.visibilityIds || []).includes(role);
      }
      if (f.visibilityScope === 'users' && memberId) {
        return (
          (f.visibilityIds || []).includes(userId || '') ||
          (f.visibilityIds || []).includes(memberId)
        );
      }
      return true;
    });
  }, [orgQuickFilters, currentOrganizationMember, userId]);

  const defaultFilterId =
    (
      currentOrganizationMember?.organization?.settings as {
        chatQuickFilters?: {defaultFilterId?: string};
      }
    )?.chatQuickFilters?.defaultFilterId ||
    visibleFilters[0]?.id ||
    'assigned-to-me';

  const [selectedFilter, setSelectedFilter] = useState(defaultFilterId);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState<FetchErrorKind | null>(null);
  const [search, setSearch] = useState('');
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const offsetRef = useRef(0);
  const lastScrollY = useRef(0);
  const expandProgress = useRef(new Animated.Value(1)).current;

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      setHeaderCollapsed(prev => {
        if (prev === collapsed) return prev;
        Animated.timing(expandProgress, {
          toValue: collapsed ? 0 : 1,
          duration: 180,
          useNativeDriver: false,
        }).start();
        return collapsed;
      });
    },
    [expandProgress],
  );

  const onListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - lastScrollY.current;

      if (y <= 12) {
        setCollapsed(false);
      } else if (delta > 4 && y > 28) {
        setCollapsed(true);
      } else if (delta < -6) {
        setCollapsed(false);
      }

      lastScrollY.current = y;
    },
    [setCollapsed],
  );

  const buildInput = useCallback(
    (filterId: string, offset = 0, searchText = search) => {
      if (!orgId || !userId) return null;
      const custom = visibleFilters.find(
        (f: QuickFilterItem) => f.id === filterId,
      )?.filters;
      let input = emptyFilterInput(orgId, userId, filterId);
      input = applyQuickFilterCriteria(input, filterId, custom);
      input.offset = offset;
      input.pageSize = PAGE_SIZE;
      if (searchText.trim()) input.searchText = searchText.trim();
      return input;
    },
    [orgId, userId, visibleFilters, search],
  );

  const loadChats = useCallback(
    async (reset = true) => {
      if (!orgId || !userId) return;
      const offset = reset ? 0 : offsetRef.current;
      const input = buildInput(selectedFilter, offset);
      if (!input) return;

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
        console.error('[ChatsScreen] load failed', e);
        if (reset) setFetchError(getFetchErrorKind(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [orgId, userId, selectedFilter, buildInput],
  );

  const loadCounts = useCallback(async () => {
    if (!orgId || !userId) return;
    try {
      const next = await fetchBatchFilterCounts(orgId, userId, visibleFilters);
      setCounts(next);
    } catch (e) {
      console.warn('[ChatsScreen] counts failed', e);
    }
  }, [orgId, userId, visibleFilters]);

  useEffect(() => {
    offsetRef.current = 0;
    setChats([]);
    void loadChats(true);
    void loadCounts();
  }, [selectedFilter, orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`native-chats-${orgId}`)
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
          void loadCounts();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, loadChats, loadCounts]);

  const compactHeight = expandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [52, 0],
  });
  const titleRowHeight = expandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 48],
  });
  const searchHeight = expandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 42],
  });
  const filtersHeight = expandProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 34],
  });
  const expandedOpacity = expandProgress;
  const compactOpacity = expandProgress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 0, 0],
  });

  if (!chatsPermissions.enabled) {
    return (
      <SafeAreaView style={[styles.root, {backgroundColor: theme.pageBg}]}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, {color: theme.secondaryLabel}]}>
            {t.chats.noPermission}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={['top']}>
      <View style={[styles.header, {backgroundColor: theme.pageBg}]}>
        {/* Compacto — estilo WhatsApp ao rolar */}
        <Animated.View
          pointerEvents={headerCollapsed ? 'auto' : 'none'}
          style={[
            styles.compactBar,
            {height: compactHeight, opacity: compactOpacity},
          ]}>
          <TouchableOpacity
            style={[styles.circleBtn, {backgroundColor: theme.fill}]}
            onPress={() => onOpenWeb('/app/settings')}
            hitSlop={8}>
            <MoreHorizontal size={20} color={theme.label} strokeWidth={2.2} />
          </TouchableOpacity>

          <Text style={[styles.compactTitle, {color: theme.label}]}>
            {t.chats.title}
          </Text>

          <View style={styles.compactActions}>
            <TouchableOpacity
              style={[styles.circleBtn, {backgroundColor: theme.fill}]}
              onPress={() => setCollapsed(false)}
              hitSlop={8}>
              <Search size={18} color={theme.label} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
              onPress={() => onOpenWeb('/app/chats')}
              accessibilityLabel={t.chats.newChat}
              hitSlop={8}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Expandido — título grande + pesquisa + filtros */}
        <Animated.View
          pointerEvents={headerCollapsed ? 'none' : 'auto'}
          style={[styles.headerTop, {height: titleRowHeight, opacity: expandedOpacity}]}>
          <Text style={[styles.largeTitle, {color: theme.label}]}>
            {t.chats.title}
          </Text>
          <View style={styles.compactActions}>
            <TouchableOpacity
              style={[styles.circleBtn, {backgroundColor: theme.fill}]}
              onPress={() => onOpenWeb('/app/settings')}
              hitSlop={8}>
              <MoreHorizontal size={20} color={theme.label} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
              onPress={() => onOpenWeb('/app/chats')}
              accessibilityLabel={t.chats.newChat}
              hitSlop={8}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.searchClip,
            {height: searchHeight, opacity: expandedOpacity},
          ]}>
          <View style={[styles.searchBox, {backgroundColor: theme.searchBg}]}>
            <Search size={16} color={theme.tertiaryLabel} strokeWidth={2.2} />
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
        </Animated.View>

        <Animated.View
          style={[
            styles.filtersClip,
            {height: filtersHeight, opacity: expandedOpacity},
          ]}>
          <FlatList
            horizontal
            data={visibleFilters}
            keyExtractor={item => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
            renderItem={({item}) => {
              const active = item.id === selectedFilter;
              const count = counts[item.id];
              return (
                <TouchableOpacity
                  onPress={() => setSelectedFilter(item.id)}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: active ? brand.blueSoft : theme.fill,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      {color: active ? brand.blue : theme.secondaryLabel},
                    ]}>
                    {item.label}
                    {typeof count === 'number'
                      ? ` ${count > 99 ? '99+' : count}`
                      : ''}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </Animated.View>
      </View>

      {loading && chats.length === 0 ? (
        <ChatListSkeleton />
      ) : (
        <FlatList
          style={[styles.list, {backgroundColor: theme.pageBg}]}
          contentContainerStyle={[
            styles.listContent,
            chats.length === 0 && styles.listContentEmpty,
          ]}
          data={chats}
          keyExtractor={item => item.id}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                offsetRef.current = 0;
                void loadChats(true);
                void loadCounts();
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
                  void loadCounts();
                }}
              />
            ) : (
              <View style={styles.centered}>
                <Text style={[styles.emptyText, {color: theme.secondaryLabel}]}>
                  {t.chats.empty}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                style={{margin: spacing.lg}}
                color={brand.blue}
              />
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
                    {
                      text: t.chats.markRead,
                      onPress: () => {
                        void supabase
                          .from('chats')
                          .update({unread_count: 0})
                          .eq('id', item.id)
                          .then(() => loadChats(true));
                      },
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 180,
  },
  header: {
    paddingBottom: spacing.xs,
    overflow: 'hidden',
  },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
  },
  compactTitle: {
    position: 'absolute',
    left: 56 + spacing.lg,
    right: 96 + spacing.lg,
    textAlign: 'center',
    fontSize: typography.headline,
    fontWeight: '700',
  },
  compactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnPrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
  },
  largeTitle: {
    fontSize: typography.largeTitle,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchClip: {
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body,
    paddingVertical: Platform.OS === 'ios' ? 0 : 4,
  },
  filtersClip: {
    overflow: 'hidden',
    justifyContent: 'flex-start',
    marginTop: 2,
  },
  filtersRow: {
    alignItems: 'center',
    gap: 6,
    // Alinha o 1º chip com a busca; o scroll vai até a borda da tela
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
  },
  segment: {
    borderRadius: radii.full,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {flex: 1},
  listContent: {
    paddingBottom: FLOATING_TAB_BAR_CLEARANCE,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: typography.callout,
    textAlign: 'center',
  },
});
