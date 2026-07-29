import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {MoreHorizontal, Plus, Search} from 'lucide-react-native';
import {useAuth} from '../../contexts/AuthContext';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {
  fetchInternalChatsFromCollab,
  internalChatToListItem,
} from '../../services/internalChatsApi';
import type {InternalChatSummary} from '../../utils/internalChats';
import {resolveInternalDisplayName} from '../../utils/internalChats';
import {supabase} from '../../lib/supabase';
import {ChatListSkeleton} from '../../components/Skeleton';
import {ChatListRow} from '../../components/ChatListRow';
import {FetchErrorState} from '../../components/FetchErrorState';
import {FLOATING_TAB_BAR_CLEARANCE} from '../../components/BottomTabBar';
import {
  getFetchErrorKind,
  type FetchErrorKind,
} from '../../utils/networkError';
import type {ChatListItem} from '../../services/chatsApi';

interface InternalChatsScreenProps {
  onOpenChat: (chatId: string, title?: string) => void;
  onOpenWeb: (path: string) => void;
}

export function InternalChatsScreen({
  onOpenChat,
  onOpenWeb,
}: InternalChatsScreenProps) {
  const {session, currentOrganizationMember} = useAuth();
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const insets = useSafeAreaInsets();

  const orgId = currentOrganizationMember?.organization_id;
  // Igual à web: profile_id || user_id
  const profileId =
    currentOrganizationMember?.profile_id || session?.user?.id || '';

  const [chats, setChats] = useState<InternalChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<FetchErrorKind | null>(null);
  const [search, setSearch] = useState('');
  const [compactInteractive, setCompactInteractive] = useState(false);

  const listRef = useRef<FlatList<ChatListItem>>(null);
  const searchInputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const loadChats = useCallback(
    async (isRefresh = false) => {
      if (!orgId || !profileId) return;

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setFetchError(null);
      }

      try {
        // Mesmo request da web (FloatingChatsContext)
        const list = await fetchInternalChatsFromCollab(profileId, orgId);
        setChats(list);
        setFetchError(null);
      } catch (e) {
        console.error('[InternalChats] load failed', e);
        if (!isRefresh) setFetchError(getFetchErrorKind(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, profileId],
  );

  useEffect(() => {
    setChats([]);
    void loadChats(false);
  }, [orgId, profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!orgId || !profileId) return;
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_collaborators',
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
  }, [orgId, profileId, loadChats]);

  // Busca client-side como na web (InternalChats.tsx)
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const source = !q
      ? chats
      : chats.filter(chat =>
          resolveInternalDisplayName(chat, profileId)
            .toLowerCase()
            .includes(q),
        );
    return source.map(chat => internalChatToListItem(chat, profileId));
  }, [chats, search, profileId]);

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
        <View style={styles.titleBlock}>
          <Text style={[styles.largeTitle, {color: theme.label}]}>
            {t.internal.title}
          </Text>
          <Text style={[styles.subtitle, {color: theme.tertiaryLabel}]}>
            {t.internal.subtitle}
          </Text>
        </View>
        <View style={styles.compactActions}>
          <TouchableOpacity
            style={[styles.circleBtn, {backgroundColor: theme.fill}]}
            onPress={() => onOpenWeb('/app/settings')}
            hitSlop={8}>
            <MoreHorizontal size={20} color={theme.label} strokeWidth={2.2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
            onPress={() => onOpenWeb('/app/internal-chats')}
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
            placeholder={t.chats.search}
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.root, {backgroundColor: theme.pageBg}]}
      edges={['top']}>
      <Animated.View
        pointerEvents={compactInteractive ? 'auto' : 'none'}
        style={[
          styles.compactOverlay,
          {
            paddingTop: insets.top,
            backgroundColor: theme.pageBg,
            opacity: compactOpacity,
            transform: [{translateY: compactTranslateY}],
          },
        ]}>
        <View style={styles.compactBar}>
          <TouchableOpacity
            style={[styles.circleBtn, {backgroundColor: theme.fill}]}
            onPress={() => onOpenWeb('/app/settings')}
            hitSlop={8}>
            <MoreHorizontal size={20} color={theme.label} strokeWidth={2.2} />
          </TouchableOpacity>

          <Text style={[styles.compactTitle, {color: theme.label}]}>
            {t.internal.title}
          </Text>

          <View style={styles.compactActions}>
            <TouchableOpacity
              style={[styles.circleBtn, {backgroundColor: theme.fill}]}
              onPress={revealSearch}
              hitSlop={8}>
              <Search size={18} color={theme.label} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtnPrimary, {backgroundColor: brand.blue}]}
              onPress={() => onOpenWeb('/app/internal-chats')}
              accessibilityLabel={t.chats.newChat}
              hitSlop={8}>
              <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {loading && chats.length === 0 ? (
        <ChatListSkeleton />
      ) : (
        <Animated.FlatList
          ref={listRef}
          style={[styles.list, {backgroundColor: theme.pageBg}]}
          contentContainerStyle={[
            styles.listContent,
            filteredItems.length === 0 && styles.listContentEmpty,
          ]}
          data={filteredItems}
          keyExtractor={item => item.id}
          ListHeaderComponent={listHeader}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadChats(true);
              }}
              tintColor={brand.blue}
            />
          }
          ListEmptyComponent={
            fetchError ? (
              <FetchErrorState
                kind={fetchError}
                compact
                onRetry={() => {
                  void loadChats(false);
                }}
              />
            ) : (
              <View style={styles.centered}>
                <Text style={[styles.emptyText, {color: theme.secondaryLabel}]}>
                  {search.trim()
                    ? t.chats.empty
                    : t.internal.empty}
                </Text>
              </View>
            )
          }
          renderItem={({item}) => {
            const title = item.group_name?.trim() || 'Chat';
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
                      onPress: () => onOpenWeb(`/app/internal-chats/${item.id}`),
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
  listHeader: {
    paddingBottom: spacing.sm,
  },
  compactOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
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
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  titleBlock: {
    flex: 1,
    paddingRight: spacing.md,
  },
  largeTitle: {
    fontSize: typography.largeTitle,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: typography.footnote,
    marginTop: 2,
  },
  searchClip: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
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
  list: {flex: 1},
  listContent: {
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
