import React, {memo, useEffect, useState} from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import type {ChatListItem} from '../../services/chatsApi';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {MarkdownText} from '../MarkdownText';
import {ChannelIcon} from '../ChannelIcon';
import {
  CHAT_STATUS_LABELS,
  getChannelLabel,
  getLastMessagePreview,
  getTeamColor,
  getTeamInitials,
} from '../../utils/chatListDisplay';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }
  return d.toLocaleDateString([], {day: '2-digit', month: '2-digit'});
}

function Avatar({
  uri,
  name,
  channelType,
}: {
  uri?: string;
  name: string;
  channelType?: string | null;
}) {
  const {colors: theme} = useTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  return (
    <View style={styles.avatarWrap}>
      {uri && !failed ? (
        <Image
          source={{uri}}
          style={styles.avatar}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, {backgroundColor: theme.fill}]}>
          <Text style={[styles.avatarText, {color: theme.secondaryLabel}]}>
            {initials(name)}
          </Text>
        </View>
      )}
      {channelType ? (
        <View style={styles.channelOverlay}>
          <ChannelIcon type={channelType} size={12} />
        </View>
      ) : null}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map(c => c + c)
          .join('')
      : raw;
  if (full.length !== 6) return `rgba(37, 99, 235, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getStatusPalette(status: string, isDark: boolean) {
  if (status === 'pending') {
    return isDark
      ? {bg: 'rgba(245, 158, 11, 0.22)', fg: '#FBBF24', border: 'rgba(245, 158, 11, 0.35)'}
      : {bg: '#FEF3C7', fg: '#B45309', border: 'transparent'};
  }
  if (status === 'in_progress') {
    return isDark
      ? {bg: 'rgba(16, 185, 129, 0.22)', fg: '#34D399', border: 'rgba(16, 185, 129, 0.35)'}
      : {bg: '#D1FAE5', fg: '#047857', border: 'transparent'};
  }
  if (status === 'closed') {
    return isDark
      ? {bg: 'rgba(156, 163, 175, 0.18)', fg: '#D1D5DB', border: 'rgba(156, 163, 175, 0.3)'}
      : {bg: '#F3F4F6', fg: '#4B5563', border: 'transparent'};
  }
  return isDark
    ? {bg: 'rgba(156, 163, 175, 0.18)', fg: '#E5E7EB', border: 'rgba(156, 163, 175, 0.3)'}
    : {bg: '#E5E7EB', fg: '#374151', border: 'transparent'};
}

function StatusBadge({
  status,
  isDark,
}: {
  status?: string | null;
  isDark: boolean;
}) {
  if (!status) return null;
  const label = CHAT_STATUS_LABELS[status] || status;
  const palette = getStatusPalette(status, isDark);

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: StyleSheet.hairlineWidth,
        },
      ]}>
      <Text
        style={[styles.chipText, styles.chipTextClamp, {color: palette.fg}]}
        numberOfLines={1}
        ellipsizeMode="tail">
        {label}
      </Text>
    </View>
  );
}

type ChatItemProps = {
  item: ChatListItem;
  title: string;
  onPress: () => void;
  onLongPress: () => void;
};

export const ChatItem = memo(function ChatItem({
  item,
  title,
  onPress,
  onLongPress,
}: ChatItemProps) {
  const {theme: mode, colors: theme} = useTheme();
  const isDark = mode === 'dark';
  const unread = item.unread_count || 0;
  const preview = getLastMessagePreview(item);
  const isInternalChat =
    item.type === 'internal_group' ||
    item.type === 'internal_direct' ||
    item.chat_type === 'internal_group' ||
    item.chat_type === 'internal_direct';
  const avatarUri =
    item.profile_picture ||
    item.customer?.profile_picture ||
    item.group_avatar_url ||
    undefined;

  const channelName = getChannelLabel(item);
  const channelType = item.channel?.type;
  const tags = item.customer?.tags || [];
  const teamName = item.team?.name;
  const timeColor = unread > 0 ? brand.blue : theme.tertiaryLabel;

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.65}
      onPress={onPress}
      onLongPress={onLongPress}>
      <Avatar uri={avatarUri} name={title} channelType={channelType} />

      <View style={[styles.rowBody, {borderBottomColor: theme.separator}]}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowTitle,
              {color: theme.label},
              unread > 0 && styles.rowTitleUnread,
            ]}
            numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.rowTime, {color: timeColor}]}>
            {formatTime(item.last_message_at || item.created_at)}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          {/* Sem ticks de status; internos: "Nome: mensagem" (igual GroupChatItem web). */}
          {preview.kind === 'text' && !isInternalChat ? (
            <MarkdownText
              content={preview.displayText}
              color={
                unread > 0 ? theme.secondaryLabel : theme.tertiaryLabel
              }
              linkColor={
                unread > 0 ? theme.secondaryLabel : theme.tertiaryLabel
              }
              variant="compact"
              style={unread > 0 ? styles.previewUnread : undefined}
            />
          ) : (
            <Text
              style={[
                styles.rowPreview,
                {
                  color:
                    unread > 0 ? theme.secondaryLabel : theme.tertiaryLabel,
                  fontWeight: unread > 0 ? '500' : '400',
                },
              ]}
              numberOfLines={1}>
              {preview.displayText}
            </Text>
          )}

          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.metaScroll}
          contentContainerStyle={styles.metaRow}>
          <StatusBadge status={item.status} isDark={isDark} />

          {teamName ? (
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: isDark
                    ? hexToRgba(getTeamColor(teamName), 0.28)
                    : getTeamColor(teamName),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: isDark
                    ? hexToRgba(getTeamColor(teamName), 0.45)
                    : 'transparent',
                },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  {color: isDark ? '#F9FAFB' : '#FFFFFF'},
                ]}>
                {getTeamInitials(teamName)}
              </Text>
            </View>
          ) : null}

          {tags.map((tagItem, index) => {
            const tag = tagItem.tags;
            if (!tag?.name) return null;
            const color = tag.color || brand.blue;
            return (
              <View
                key={tagItem.tag_id || tag.id || `${tag.name}-${index}`}
                style={[
                  styles.chip,
                  {
                    backgroundColor: hexToRgba(color, isDark ? 0.22 : 0.14),
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: hexToRgba(color, isDark ? 0.45 : 0.28),
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    styles.chipTextClamp,
                    {color: isDark ? lightenForDark(color) : color},
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail">
                  {tag.name}
                </Text>
              </View>
            );
          })}

          <View
            style={[
              styles.chip,
              styles.channelChip,
              {
                backgroundColor: isDark
                  ? 'rgba(55, 65, 81, 0.85)'
                  : theme.fill,
                borderColor: isDark
                  ? 'rgba(156, 163, 175, 0.35)'
                  : theme.border,
              },
            ]}>
            {channelType ? (
              <View style={styles.channelIconSlot}>
                <ChannelIcon type={channelType} size={11} />
              </View>
            ) : null}
            <Text
              style={[
                styles.chipText,
                styles.channelChipText,
                {color: isDark ? '#E5E7EB' : theme.secondaryLabel},
              ]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {channelName}
            </Text>
          </View>
        </ScrollView>
      </View>
    </TouchableOpacity>
  );
});

/** No dark, evita texto de tag escuro demais sobre fundo translúcido. */
function lightenForDark(hex: string): string {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map(c => c + c)
          .join('')
      : raw;
  if (full.length !== 6) return '#93C5FD';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.55) return `#${full}`;
  const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.45));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: spacing.lg,
    paddingTop: 10,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    marginRight: spacing.md,
    marginTop: 2,
    position: 'relative',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  channelOverlay: {
    position: 'absolute',
    right: -2,
    bottom: -2,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rowTitle: {
    flex: 1,
    marginRight: spacing.sm,
    fontSize: typography.headline,
    fontWeight: '400',
  },
  rowTitleUnread: {fontWeight: '600'},
  rowTime: {
    fontSize: typography.footnote,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  rowPreview: {
    flex: 1,
    fontSize: typography.subhead,
    lineHeight: 18,
    marginRight: spacing.sm,
  },
  previewUnread: {
    fontWeight: '500',
  },
  badge: {
    backgroundColor: brand.blue,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  metaScroll: {
    marginTop: 6,
    // Compensa o paddingRight do rowBody pra os badges irem até a borda
    marginRight: -spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: spacing.lg,
  },
  chip: {
    borderRadius: radii.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 132,
    overflow: 'hidden',
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 132,
    overflow: 'hidden',
  },
  channelIconSlot: {
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextClamp: {
    maxWidth: 116,
    flexShrink: 1,
  },
  channelChipText: {
    maxWidth: 100,
    flexShrink: 1,
    minWidth: 0,
  },
});
