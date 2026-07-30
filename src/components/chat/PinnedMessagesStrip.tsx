import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {ChevronDown, ChevronUp, Pin, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';

export type PinnedMessageItem = {
  id: string;
  message_id: string;
  comment?: string | null;
  message?: {
    content?: string | null;
    type?: string | null;
    attachments?: Array<{type?: string}> | null;
  } | null;
};

type Props = {
  pinned: PinnedMessageItem[];
  expanded: boolean;
  onToggle: () => void;
  onPressMessage: (item: PinnedMessageItem) => void;
  onUnpin: (item: PinnedMessageItem) => void;
};

function previewText(item: PinnedMessageItem): string {
  if (item.comment?.trim()) return item.comment.trim();
  const content = item.message?.content?.replace(/\s+/g, ' ').trim();
  if (content) return content;
  if (item.message?.attachments?.length) return 'Anexo';
  return 'Mensagem fixada';
}

export function PinnedMessagesStrip({
  pinned,
  expanded,
  onToggle,
  onPressMessage,
  onUnpin,
}: Props) {
  const {colors: theme} = useTheme();

  if (pinned.length === 0) return null;

  const firstPreview = previewText(pinned[0]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.listItemSelected,
          borderColor: theme.borderStrong,
        },
      ]}>
      <Pressable
        style={({pressed}) => [
          styles.header,
          pressed && {backgroundColor: brand.blueSoft},
        ]}
        onPress={onToggle}>
        <Pin size={14} color={brand.blue} />
        <Text style={[styles.headerTitle, {color: theme.label}]}>
          Fixadas
        </Text>
        <View style={[styles.countBadge, {backgroundColor: brand.blueSoft}]}>
          <Text style={[styles.countText, {color: brand.blue}]}>
            {pinned.length}
          </Text>
        </View>
        {!expanded ? (
          <Text
            style={[styles.preview, {color: theme.secondaryLabel}]}
            numberOfLines={1}>
            · {firstPreview}
          </Text>
        ) : null}
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Recolher' : 'Expandir'}>
          {expanded ? (
            <ChevronUp size={18} color={brand.blue} />
          ) : (
            <ChevronDown size={18} color={brand.blue} />
          )}
        </TouchableOpacity>
      </Pressable>

      {expanded ? (
        <ScrollView
          style={styles.list}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          {pinned.map(item => {
            const isPrivate = item.message?.type === 'private';
            return (
              <Pressable
                key={item.id}
                style={({pressed}) => [
                  styles.row,
                  {
                    borderTopColor: theme.separator,
                    backgroundColor: pressed
                      ? brand.blueSoft
                      : isPrivate
                        ? theme.listItemPinned
                        : 'transparent',
                  },
                ]}
                onPress={() => onPressMessage(item)}>
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.rowText, {color: theme.label}]}
                    numberOfLines={2}>
                    {previewText(item)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => onUnpin(item)}
                  hitSlop={8}
                  style={styles.unpinBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Desafixar">
                  <X size={16} color={theme.secondaryLabel} />
                </TouchableOpacity>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: typography.caption,
    fontWeight: '700',
  },
  countBadge: {
    borderRadius: radii.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
  },
  preview: {
    flex: 1,
    fontSize: 10,
    minWidth: 0,
  },
  headerSpacer: {
    width: 4,
  },
  list: {
    maxHeight: 160,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    fontSize: typography.footnote,
  },
  unpinBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
});
