import React, {useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {Calendar, ChevronDown, ChevronUp, Clock, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChatMessage} from '../../services/chatsApi';

type Props = {
  scheduled: ChatMessage[];
  onCancel?: (messageId: string) => void | Promise<void>;
};

function getScheduledAt(message: ChatMessage): string | null {
  const value = message.scheduled_at;
  return typeof value === 'string' ? value : null;
}

function formatScheduleTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function previewContent(message: ChatMessage): string {
  const text = message.content?.replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (message.type && message.type !== 'text') return message.type;
  return 'Mensagem agendada';
}

export function ScheduledMessagesStrip({scheduled, onCancel}: Props) {
  const {colors: theme} = useTheme();
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    return [...scheduled].sort((a, b) => {
      const aTime = getScheduledAt(a);
      const bTime = getScheduledAt(b);
      if (!aTime || !bTime) return 0;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
  }, [scheduled]);

  if (sorted.length === 0) return null;

  const next = sorted[0];
  const nextAt = next ? getScheduledAt(next) : null;

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.listItemPinned,
          borderColor: theme.borderPinned,
        },
      ]}>
      <Pressable
        style={({pressed}) => [
          styles.header,
          pressed && {opacity: 0.85},
        ]}
        onPress={() => setExpanded(v => !v)}>
        <Calendar size={14} color={brand.amber} />
        <Text style={[styles.headerTitle, {color: theme.label}]}>
          Agendadas
        </Text>
        <View style={[styles.countBadge, {backgroundColor: brand.amberSoft}]}>
          <Text style={[styles.countText, {color: brand.amber}]}>
            {sorted.length}
          </Text>
        </View>
        {nextAt ? (
          <View style={styles.nextRow}>
            <Clock size={12} color={theme.secondaryLabel} />
            <Text
              style={[styles.nextText, {color: theme.secondaryLabel}]}
              numberOfLines={1}>
              {formatScheduleTime(nextAt)}
            </Text>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
        {expanded ? (
          <ChevronUp size={18} color={brand.amber} />
        ) : (
          <ChevronDown size={18} color={brand.amber} />
        )}
      </Pressable>

      {expanded ? (
        <ScrollView
          style={styles.list}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled">
          {sorted.map(message => {
            const at = getScheduledAt(message);
            return (
              <View
                key={message.id}
                style={[styles.row, {borderTopColor: theme.separator}]}>
                <View style={styles.rowBody}>
                  {at ? (
                    <Text style={[styles.time, {color: brand.amber}]}>
                      {formatScheduleTime(at)}
                    </Text>
                  ) : null}
                  <Text
                    style={[styles.content, {color: theme.label}]}
                    numberOfLines={2}>
                    {previewContent(message)}
                  </Text>
                </View>
                {onCancel ? (
                  <TouchableOpacity
                    onPress={() => void onCancel(message.id)}
                    hitSlop={8}
                    style={styles.cancelBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar agendamento">
                    <X size={16} color={theme.secondaryLabel} />
                  </TouchableOpacity>
                ) : null}
              </View>
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
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  nextText: {
    fontSize: 10,
    flex: 1,
  },
  headerSpacer: {
    width: 4,
  },
  list: {
    maxHeight: 180,
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
  time: {
    fontSize: typography.caption,
    fontWeight: '600',
    marginBottom: 2,
  },
  content: {
    fontSize: typography.footnote,
  },
  cancelBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
});
