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
  Modal,
  Pressable,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import {
  useSafeAreaInsets,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import {
  Archive,
  Check,
  Eye,
  Filter,
  Globe,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react-native';
import {useAuth} from '../../contexts/AuthContext';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {usePermissions} from '../../hooks/usePermissions';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {
  DEFAULT_QUICK_FILTERS,
  applyQuickFilterCriteria,
  emptyFilterInput,
  resolveQuickFilterColor,
  type ChatFilterRpcInput,
} from '../../utils/chatFilterRpc';
import {
  PAGE_SIZE,
  fetchBatchFilterCounts,
  fetchChatsPage,
  type ChatListItem,
} from '../../services/chatsApi';
import {supabase} from '../../lib/supabase';
import {ChatListSkeleton} from '../../components/Skeleton';
import {ChatItem} from '../../components/chat/ChatItem';
import {ChatActionsSheet} from '../../components/chat/ChatActionsSheet';
import {ChatDetailsModal} from '../../components/chat/ChatDetailsModal';
import {StartChatModal} from '../../components/chat/StartChatModal';
import {CustomerAddModal} from '../../components/chat/CustomerAddModal';
import {ChatFiltersPanel} from '../../components/chat/ChatFiltersPanel';
import {TransferAgentModal} from '../../components/chat/TransferAgentModal';
import {TransferTeamModal} from '../../components/chat/TransferTeamModal';
import {MergeChatModal} from '../../components/chat/MergeChatModal';
import {TransferCustomerModal} from '../../components/chat/TransferCustomerModal';
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
  color: string;
  filters?: Record<string, unknown>;
  isDefault?: boolean;
  isCustom?: boolean;
  isVisible?: boolean;
  visibilityScope?: string;
  visibilityTeamIds?: string[];
  visibilityRoles?: string[];
  visibilityUserIds?: string[];
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

/** Evita keys duplicadas no FlatList (RPC/paginação pode repetir o mesmo id). */
function dedupeChatsById(items: ChatListItem[]): ChatListItem[] {
  const seen = new Set<string>();
  const out: ChatListItem[] = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function ChatsScreen({onOpenChat, onOpenWeb}: ChatsScreenProps) {
  const {session, currentOrganizationMember} = useAuth();
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const {chatsPermissions, isOwnerOrAdmin} = usePermissions();
  const insets = useSafeAreaInsets();
  // Congela o topo desde o 1º frame (evita 0→inset ao abrir)
  const topInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
  );

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
        .filter(f => f.isVisible !== false)
        .map(f => ({
          id: String(f.id),
          label: String(f.label || f.id),
          showCount: Boolean(f.showCount),
          color: resolveQuickFilterColor(
            typeof f.color === 'string' ? f.color : undefined,
          ),
          filters: (f.filters as Record<string, unknown>) || undefined,
          isDefault: Boolean(f.isDefault),
          isCustom: Boolean(f.isCustom),
          isVisible: f.isVisible !== false,
          visibilityScope: f.visibilityScope as string | undefined,
          visibilityTeamIds: (f.visibilityTeamIds as string[]) || [],
          visibilityRoles: (f.visibilityRoles as string[]) || [],
          visibilityUserIds: (f.visibilityUserIds as string[]) || [],
        }));
    }
    return DEFAULT_QUICK_FILTERS.map(f => ({
      id: f.id,
      label: f.label,
      showCount: f.showCount,
      color: resolveQuickFilterColor(f.color),
      isDefault: true,
      isCustom: false,
    }));
  }, [currentOrganizationMember?.organization?.settings]);

  const visibleFilters = useMemo((): QuickFilterItem[] => {
    const role = currentOrganizationMember?.role;
    return orgQuickFilters.filter((f: QuickFilterItem) => {
      if (!f.visibilityScope || f.visibilityScope === 'all') return true;
      if (f.visibilityScope === 'roles' && role) {
        return (f.visibilityRoles || []).includes(role);
      }
      if (f.visibilityScope === 'users') {
        const allowed = f.visibilityUserIds || [];
        return (
          (!!userId && allowed.includes(userId)) ||
          (!!currentOrganizationMember?.profile_id &&
            allowed.includes(currentOrganizationMember.profile_id))
        );
      }
      if (f.visibilityScope === 'teams') {
        // Sem membership de equipe no nativo ainda — não esconder o filtro
        return true;
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
  const [actionChat, setActionChat] = useState<ChatListItem | null>(null);
  const [detailsChatId, setDetailsChatId] = useState<string | null>(null);
  const [showStartChat, setShowStartChat] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [transferAgentChat, setTransferAgentChat] =
    useState<ChatListItem | null>(null);
  const [transferTeamChat, setTransferTeamChat] = useState<ChatListItem | null>(
    null,
  );
  const [mergeChat, setMergeChat] = useState<ChatListItem | null>(null);
  const [transferCustomerChat, setTransferCustomerChat] =
    useState<ChatListItem | null>(null);
  const [advancedFilter, setAdvancedFilter] = useState<ChatFilterRpcInput | null>(
    null,
  );
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  /** Compact bar só recebe toques quando já está visível o suficiente */
  const [compactInteractive, setCompactInteractive] = useState(false);
  const offsetRef = useRef(0);
  const listRef = useRef<FlatList<ChatListItem>>(null);
  const searchInputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const onListScroll = useMemo(
    () =>
      Animated.event(
        [{nativeEvent: {contentOffset: {y: scrollY}}}],
        {
          useNativeDriver: true,
          listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const y = e.nativeEvent.contentOffset.y;
            const next = y > 48;
            setCompactInteractive(prev => (prev === next ? prev : next));
          },
        },
      ),
    [scrollY],
  );

  const revealSearch = useCallback(() => {
    listRef.current?.scrollToOffset({offset: 0, animated: true});
    setTimeout(() => searchInputRef.current?.focus(), 280);
  }, []);

  const showCreateMenu = useCallback(() => {
    Alert.alert('', undefined, [
      {text: t.chats.newChat, onPress: () => setShowStartChat(true)},
      {text: t.chats.newCustomer, onPress: () => setShowAddCustomer(true)},
      {text: t.chats.cancel, style: 'cancel'},
    ]);
  }, [t.chats.cancel, t.chats.newChat, t.chats.newCustomer]);

  const listMenuActive = !!(advancedFilter || showUnreadOnly || showArchived);

  const handleChatUpdated = useCallback(
    (chatId: string, patch: Partial<ChatListItem>) => {
      setChats(prev =>
        prev.map(chat => (chat.id === chatId ? {...chat, ...patch} : chat)),
      );
    },
    [],
  );

  const handleChatRemoved = useCallback((chatId: string) => {
    setChats(prev => prev.filter(chat => chat.id !== chatId));
  }, []);

  const filtersPanelValue = useMemo((): ChatFilterRpcInput | null => {
    if (!orgId || !userId) return null;
    const filter = visibleFilters.find(
      (f: QuickFilterItem) => f.id === selectedFilter,
    );
    let input = emptyFilterInput(orgId, userId, selectedFilter);
    input = applyQuickFilterCriteria(input, selectedFilter, filter?.filters, {
      isDefault: filter?.isDefault,
      isCustom: filter?.isCustom,
    });
    if (advancedFilter) {
      input = {
        ...input,
        selectedStatuses: advancedFilter.selectedStatuses,
        selectedSpamFilter: advancedFilter.selectedSpamFilter,
        isCollaboratingFilter: advancedFilter.isCollaboratingFilter,
      };
    }
    input.showUnreadOnly = showUnreadOnly;
    input.showArchived = showArchived;
    return input;
  }, [
    orgId,
    userId,
    selectedFilter,
    visibleFilters,
    advancedFilter,
    showUnreadOnly,
    showArchived,
  ]);

  const buildInput = useCallback(
    (filterId: string, offset = 0, searchText = search) => {
      if (!orgId || !userId) return null;
      const filter = visibleFilters.find(
        (f: QuickFilterItem) => f.id === filterId,
      );
      let input = emptyFilterInput(orgId, userId, filterId);
      input = applyQuickFilterCriteria(input, filterId, filter?.filters, {
        isDefault: filter?.isDefault,
        isCustom: filter?.isCustom,
      });
      if (advancedFilter) {
        input = {
          ...input,
          selectedStatuses: advancedFilter.selectedStatuses,
          selectedSpamFilter: advancedFilter.selectedSpamFilter,
          isCollaboratingFilter: advancedFilter.isCollaboratingFilter,
        };
      }
      input.showUnreadOnly = showUnreadOnly;
      input.showArchived = showArchived;
      input.offset = offset;
      input.pageSize = PAGE_SIZE;
      if (searchText.trim()) input.searchText = searchText.trim();
      return input;
    },
    [
      orgId,
      userId,
      visibleFilters,
      search,
      advancedFilter,
      showUnreadOnly,
      showArchived,
    ],
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
        setChats(prev =>
          dedupeChatsById(reset ? page : [...prev, ...page]),
        );
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

  // Counts: só filtros com showCount; só no open da página / pull-to-refresh (sem polling)
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
    listRef.current?.scrollToOffset({offset: 0, animated: false});
    void loadChats(true);
  }, [
    selectedFilter,
    orgId,
    userId,
    showUnreadOnly,
    showArchived,
    advancedFilter,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !userId) return;
    void loadCounts();
  }, [orgId, userId, loadCounts]);

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
          // Atualiza lista; counts só no open/refresh (evita RPC a cada evento)
          void loadChats(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, loadChats]);

  // Barra compacta aparece aos poucos conforme o scroll (sem mudar altura da lista)
  const compactOpacity = scrollY.interpolate({
    inputRange: [12, 64],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const compactTranslateY = scrollY.interpolate({
    inputRange: [12, 64],
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.headerTop}>
        <Text style={[styles.largeTitle, {color: theme.label}]}>
          {t.chats.title}
        </Text>
        <View style={styles.compactActions}>
          <TouchableOpacity
            style={[
              styles.circleBtn,
              {
                backgroundColor: listMenuActive
                  ? brand.blueSoft
                  : theme.fill,
              },
            ]}
            onPress={() => setShowListMenu(true)}
            accessibilityLabel={t.chats.filters}
            hitSlop={8}>
            <MoreHorizontal
              size={20}
              color={listMenuActive ? brand.blue : theme.label}
              strokeWidth={2.2}
            />
            {listMenuActive ? <View style={styles.menuDot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
            onPress={showCreateMenu}
            accessibilityLabel={t.chats.newChat}
            hitSlop={8}>
            <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </View>

        <View style={styles.searchClip}>
          <View style={[styles.searchBox, {backgroundColor: theme.searchBg}]}>
            <Search size={16} color={theme.tertiaryLabel} strokeWidth={2.2} />
            <TextInput
              ref={searchInputRef}
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

        <View style={styles.filtersClip}>
          <FlatList
            horizontal
            data={visibleFilters}
            keyExtractor={item => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
            renderItem={({item}) => {
              const active = item.id === selectedFilter;
              const filterColor = resolveQuickFilterColor(item.color);
              const count =
                item.showCount && typeof counts[item.id] === 'number'
                  ? counts[item.id]
                  : null;
              const showBadge = count != null && count > 0;

              return (
                <TouchableOpacity
                  onPress={() => setSelectedFilter(item.id)}
                  style={[
                    styles.segment,
                    active
                      ? {backgroundColor: filterColor}
                      : {
                          backgroundColor: theme.fill,
                          borderColor: `${filterColor}33`,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                        },
                  ]}>
                  <Text
                    style={[
                      styles.segmentText,
                      {color: active ? '#FFFFFF' : theme.secondaryLabel},
                    ]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.showCount ? (
                    <View
                      style={[
                        styles.countBadge,
                        showBadge
                          ? active
                            ? styles.countBadgeOnActive
                            : {backgroundColor: filterColor}
                          : styles.countBadgePlaceholder,
                      ]}>
                      {showBadge ? (
                        <Text
                          style={[
                            styles.countBadgeText,
                            active
                              ? {color: filterColor}
                              : styles.countBadgeTextOnIdle,
                          ]}>
                          {count > 99 ? '99+' : count}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
  );

  if (!chatsPermissions.enabled) {
    return (
      <View
        style={[
          styles.root,
          {backgroundColor: theme.pageBg, paddingTop: topInset},
        ]}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, {color: theme.secondaryLabel}]}>
            {t.chats.noPermission}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.root,
        {backgroundColor: theme.pageBg, paddingTop: topInset},
      ]}>
      {/* Overlay compacto — só opacidade/translate (não altera altura da lista) */}
      <Animated.View
        pointerEvents={compactInteractive ? 'auto' : 'none'}
        style={[
          styles.compactOverlay,
          {
            // Absolute ignora o padding do SafeAreaView — respeitar o notch/horário
            paddingTop: topInset,
            backgroundColor: theme.pageBg,
            opacity: compactOpacity,
            transform: [{translateY: compactTranslateY}],
          },
        ]}>
        <View style={styles.compactBar}>
          <View style={{width: 36}} />

          <Text style={[styles.compactTitle, {color: theme.label}]}>
            {t.chats.title}
          </Text>

          <View style={styles.compactActions}>
            <TouchableOpacity
              style={[styles.circleBtn, {backgroundColor: theme.fill}]}
              onPress={revealSearch}
              hitSlop={8}>
              <Search size={18} color={theme.label} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.circleBtn,
                {
                  backgroundColor: listMenuActive ? brand.blueSoft : theme.fill,
                },
              ]}
              onPress={() => setShowListMenu(true)}
              accessibilityLabel={t.chats.filters}
              hitSlop={8}>
              <MoreHorizontal
                size={20}
                color={listMenuActive ? brand.blue : theme.label}
                strokeWidth={2.2}
              />
              {listMenuActive ? <View style={styles.menuDot} /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
              onPress={showCreateMenu}
              accessibilityLabel={t.chats.newChat}
              hitSlop={8}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Animated.FlatList
        ref={listRef}
        style={[styles.list, {backgroundColor: theme.pageBg}]}
        contentContainerStyle={[
          styles.listContent,
          chats.length === 0 && styles.listContentEmpty,
        ]}
        data={chats}
        keyExtractor={item => item.id}
        ListHeaderComponent={listHeader}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        // Evita o iOS somar safe-area de novo (já usamos paddingTop fixo)
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          // Só após o 1º load: RefreshControl no mount ajusta inset no iOS
          loading && chats.length === 0 ? undefined : (
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
          )
        }
        onEndReached={() => {
          if (!loadingMore && hasMore) void loadChats(false);
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            // Skeleton só na área da lista — header/filtros ficam montados
            <ChatListSkeleton />
          ) : fetchError ? (
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
            <ChatItem
              item={item}
              title={title}
              onPress={() => onOpenChat(item.id, title)}
              onLongPress={() => setActionChat(item)}
            />
          );
        }}
      />

      <Modal
        visible={showListMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowListMenu(false)}>
        <Pressable
          style={styles.listMenuBackdrop}
          onPress={() => setShowListMenu(false)}>
          <Pressable
            style={[
              styles.listMenuCard,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                top: topInset + 52,
              },
            ]}
            onPress={e => e.stopPropagation()}>
            <TouchableOpacity
              style={[styles.listMenuRow, {borderBottomColor: theme.separator}]}
              onPress={() => {
                setShowListMenu(false);
                setShowFilters(true);
              }}>
              <Filter
                size={18}
                color={advancedFilter ? brand.blue : theme.label}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.listMenuLabel,
                  {color: advancedFilter ? brand.blue : theme.label},
                ]}>
                {t.chats.filters}
              </Text>
              {advancedFilter ? (
                <Check size={16} color={brand.blue} strokeWidth={2.4} />
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.listMenuRow, {borderBottomColor: theme.separator}]}
              onPress={() => setShowUnreadOnly(prev => !prev)}>
              <Eye
                size={18}
                color={showUnreadOnly ? brand.blue : theme.label}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.listMenuLabel,
                  {color: showUnreadOnly ? brand.blue : theme.label},
                ]}>
                {t.chats.unreadOnly}
              </Text>
              {showUnreadOnly ? (
                <Check size={16} color={brand.blue} strokeWidth={2.4} />
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.listMenuRow, {borderBottomColor: theme.separator}]}
              onPress={() => setShowArchived(prev => !prev)}>
              <Archive
                size={18}
                color={showArchived ? brand.blue : theme.label}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.listMenuLabel,
                  {color: showArchived ? brand.blue : theme.label},
                ]}>
                {t.chats.archived}
              </Text>
              {showArchived ? (
                <Check size={16} color={brand.blue} strokeWidth={2.4} />
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.listMenuRow, {borderBottomWidth: 0}]}
              onPress={() => {
                setShowListMenu(false);
                const filterQuery = selectedFilter
                  ? `?filter=${encodeURIComponent(selectedFilter)}`
                  : '';
                onOpenWeb(`/app/chats${filterQuery}`);
              }}>
              <Globe size={18} color={theme.label} strokeWidth={2.2} />
              <Text style={[styles.listMenuLabel, {color: theme.label}]}>
                {t.chats.openWeb}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {orgId && userId && filtersPanelValue ? (
        <ChatFiltersPanel
          visible={showFilters}
          value={filtersPanelValue}
          onChange={next => {
            setAdvancedFilter(next);
            setShowUnreadOnly(next.showUnreadOnly);
            setShowArchived(next.showArchived);
          }}
          onClose={() => setShowFilters(false)}
          onApply={() => {
            offsetRef.current = 0;
          }}
        />
      ) : null}

      <ChatActionsSheet
        visible={!!actionChat}
        chat={actionChat}
        organizationId={orgId || ''}
        userId={userId || ''}
        isAdmin={isOwnerOrAdmin}
        canTransfer={chatsPermissions.canTransferChats}
        onClose={() => setActionChat(null)}
        onUpdated={handleChatUpdated}
        onRemoved={handleChatRemoved}
        onOpenDetails={chatId => setDetailsChatId(chatId)}
        onOpenCustomer={customerId => {
          console.log('[ChatsScreen] openCustomer', customerId);
          onOpenWeb(`/app/customers/${customerId}/edit`);
        }}
        onOpenMerge={chat => setMergeChat(chat)}
        onOpenTransferTeam={chat => setTransferTeamChat(chat)}
        onOpenTransferAttendance={chat => setTransferAgentChat(chat)}
        onOpenTransferCustomer={chat => setTransferCustomerChat(chat)}
      />

      <ChatDetailsModal
        visible={!!detailsChatId}
        chatId={detailsChatId || ''}
        organizationId={orgId || ''}
        onClose={() => setDetailsChatId(null)}
      />

      {orgId ? (
        <StartChatModal
          visible={showStartChat}
          organizationId={orgId}
          onClose={() => setShowStartChat(false)}
          onChatReady={(chatId, title) => {
            setShowStartChat(false);
            onOpenChat(chatId, title);
          }}
        />
      ) : null}

      {orgId ? (
        <CustomerAddModal
          visible={showAddCustomer}
          organizationId={orgId}
          onClose={() => setShowAddCustomer(false)}
          onCreated={() => {
            setShowAddCustomer(false);
            setShowStartChat(true);
          }}
        />
      ) : null}

      <TransferAgentModal
        visible={!!transferAgentChat}
        chatId={transferAgentChat?.id || ''}
        organizationId={orgId || ''}
        onClose={() => setTransferAgentChat(null)}
        onTransferred={() => {
          setTransferAgentChat(null);
          void loadChats(true);
        }}
      />

      <TransferTeamModal
        visible={!!transferTeamChat}
        chatId={transferTeamChat?.id || ''}
        organizationId={orgId || ''}
        currentTeamId={transferTeamChat?.team?.id}
        onClose={() => setTransferTeamChat(null)}
        onTransferred={() => {
          setTransferTeamChat(null);
          void loadChats(true);
        }}
      />

      <MergeChatModal
        visible={!!mergeChat}
        chatId={mergeChat?.id || ''}
        organizationId={orgId || ''}
        customerId={mergeChat?.customer?.id}
        onClose={() => setMergeChat(null)}
        onMerged={targetChatId => {
          const sourceId = mergeChat?.id;
          setMergeChat(null);
          if (sourceId) handleChatRemoved(sourceId);
          onOpenChat(targetChatId);
        }}
      />

      <TransferCustomerModal
        visible={!!transferCustomerChat}
        chatId={transferCustomerChat?.id || ''}
        organizationId={orgId || ''}
        currentCustomerId={transferCustomerChat?.customer?.id}
        onClose={() => setTransferCustomerChat(null)}
        onTransferred={() => {
          setTransferCustomerChat(null);
          void loadChats(true);
        }}
      />
    </View>
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
  listHeader: {
    paddingBottom: spacing.sm,
  },
  compactOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingTop: 0,
  },
  compactBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  compactTitle: {
    position: 'absolute',
    left: 56 + spacing.lg,
    right: 140 + spacing.lg,
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
    position: 'relative',
  },
  menuDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: brand.blue,
  },
  listMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  listMenuCard: {
    position: 'absolute',
    right: spacing.lg,
    minWidth: 220,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: {width: 0, height: 6},
      },
      android: {elevation: 8},
      default: {},
    }),
  },
  listMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listMenuLabel: {
    flex: 1,
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  circleBtnPrimary: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTop: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  largeTitle: {
    fontSize: typography.largeTitle,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchClip: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: 4,
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
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  filtersRow: {
    alignItems: 'center',
    gap: 6,
    // Alinha o 1º chip com a busca; o scroll vai até a borda da tela
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.full,
    paddingHorizontal: 11,
    paddingVertical: 5,
    // badge 18 + paddingVertical 5*2 — evita pulo quando o count chega
    minHeight: 28,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgePlaceholder: {
    backgroundColor: 'transparent',
  },
  countBadgeOnActive: {
    backgroundColor: '#FFFFFF',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  countBadgeTextOnIdle: {
    color: '#FFFFFF',
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
