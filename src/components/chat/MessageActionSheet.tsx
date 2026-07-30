import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Platform,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {
  Reply,
  Copy,
  Info,
  Plus,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Download,
} from 'lucide-react-native';
import {useI18n} from '../../contexts/I18nContext';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChatMessage} from '../../services/chatsApi';
import type {ChannelFeatures} from '../../utils/channelFeatures';
import {
  getDownloadableMedia,
  isOutgoing,
  isSystemEvent,
  type MessageAnchor,
} from './messageHelpers';
import {MessageBubble, type BubbleTheme} from './MessageBubble';
import {hapticSelection} from '../../utils/haptics';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
export type {MessageAnchor};

type Props = {
  visible: boolean;
  message: ChatMessage | null;
  anchor: MessageAnchor | null;
  bubbleTheme: BubbleTheme;
  channelFeatures: ChannelFeatures;
  chatStatus?: string | null;
  reacting?: boolean;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void | Promise<void>;
  onCopy: (message: ChatMessage) => void | Promise<void>;
  onDetails: (message: ChatMessage) => void;
  /** Abre o teclado completo — deve rodar fora deste Modal (RN não empilha bem). */
  onMoreEmojis: (message: ChatMessage) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canPin?: boolean;
  isPinned?: boolean;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (message: ChatMessage) => void;
  onDownload?: (message: ChatMessage) => void;
};

const REACTION_H = 56;
const MENU_ROW_H = 50;
const GAP = 10;
const PAD = 12;
const MENU_W = 260;
const CLOSE_MS = 140;
const EMOJI_BTN = 44;

export function MessageActionSheet({
  visible,
  message,
  anchor,
  bubbleTheme,
  channelFeatures,
  chatStatus,
  reacting,
  onClose,
  onReply,
  onReact,
  onCopy,
  onDetails,
  onMoreEmojis,
  canEdit,
  canDelete,
  canPin,
  isPinned,
  onEdit,
  onDelete,
  onPin,
  onUnpin,
  onDownload,
}: Props) {
  const {t} = useI18n();
  const {theme: mode, colors: theme} = useTheme();
  const {width: winW, height: winH} = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0.96)).current;
  const closingRef = useRef(false);
  const displayMessage = message;
  const displayAnchor = anchor;

  const capabilities = useMemo(() => {
    if (!displayMessage) {
      return {
        canReact: false,
        canReply: false,
        canCopy: false,
        canDownload: false,
        showEdit: false,
        showDelete: false,
        showPin: false,
        showUnpin: false,
        actionCount: 1,
      };
    }
    const type = displayMessage.type || '';
    const systemLike =
      isSystemEvent(displayMessage) ||
      type === 'alert' ||
      type === 'deleted' ||
      type === 'context';
    const interactive =
      !systemLike && type !== 'private' && displayMessage.status !== 'deleted';

    const canReact =
      interactive &&
      channelFeatures.canReplyToMessages &&
      type !== 'reaction';
    const canReply =
      interactive &&
      channelFeatures.canReplyToMessages &&
      chatStatus === 'in_progress';
    const canCopy = !!(displayMessage.content && displayMessage.content.trim());
    const canDownload = !!(
      onDownload &&
      displayMessage.status !== 'deleted' &&
      getDownloadableMedia(displayMessage)
    );

    const showEdit = !!(canEdit && onEdit);
    const showDelete = !!(canDelete && onDelete);
    const showPin = !!(canPin && !isPinned && onPin);
    const showUnpin = !!(canPin && isPinned && onUnpin);

    let actionCount = 1;
    if (canReply) actionCount += 1;
    if (canCopy) actionCount += 1;
    if (canDownload) actionCount += 1;
    if (showEdit) actionCount += 1;
    if (showDelete) actionCount += 1;
    if (showPin || showUnpin) actionCount += 1;

    return {
      canReact,
      canReply,
      canCopy,
      canDownload,
      showEdit,
      showDelete,
      showPin,
      showUnpin,
      actionCount,
    };
  }, [
    displayMessage,
    channelFeatures,
    chatStatus,
    canEdit,
    canDelete,
    canPin,
    isPinned,
    onEdit,
    onDelete,
    onPin,
    onUnpin,
    onDownload,
  ]);

  const layout = useMemo(() => {
    const screenW = winW || Dimensions.get('window').width;
    const screenH = winH || Dimensions.get('window').height;
    const a = displayAnchor || {
      x: 16,
      y: screenH * 0.35,
      width: 220,
      height: 60,
    };
    const out = displayMessage ? isOutgoing(displayMessage) : false;

    const menuH = capabilities.actionCount * MENU_ROW_H;
    const reactH = capabilities.canReact ? REACTION_H : 0;
    const spaceAbove = a.y;
    const spaceBelow = screenH - (a.y + a.height);

    let reactionsTop: number | null = null;
    let menuTop: number;

    const canReactionsAbove =
      capabilities.canReact && spaceAbove >= reactH + GAP + PAD;
    const canMenuBelow = spaceBelow >= menuH + GAP + PAD;

    if (canReactionsAbove) {
      reactionsTop = a.y - reactH - GAP;
    } else if (capabilities.canReact) {
      reactionsTop = a.y + a.height + GAP;
    }

    if (canMenuBelow) {
      if (reactionsTop != null && reactionsTop >= a.y + a.height) {
        menuTop = reactionsTop + reactH + GAP;
      } else {
        menuTop = a.y + a.height + GAP;
      }
    } else if (reactionsTop != null && reactionsTop < a.y) {
      menuTop = Math.max(PAD, reactionsTop - menuH - GAP);
    } else {
      menuTop = Math.max(PAD, a.y - menuH - GAP);
    }

    if (menuTop + menuH > screenH - PAD) {
      menuTop = Math.max(PAD, screenH - PAD - menuH);
    }
    if (reactionsTop != null) {
      reactionsTop = Math.min(
        Math.max(PAD, reactionsTop),
        screenH - reactH - PAD,
      );
    }

    const clampX = (x: number, width: number) =>
      Math.min(Math.max(PAD, x), screenW - width - PAD);

    const menuLeft = out
      ? clampX(a.x + a.width - MENU_W, MENU_W)
      : clampX(a.x, MENU_W);

    const reactionW = (QUICK_REACTIONS.length + 1) * EMOJI_BTN + 16;
    const reactionLeft = out
      ? clampX(a.x + a.width - reactionW, reactionW)
      : clampX(a.x, reactionW);

    return {
      bubble: {left: a.x, top: a.y, width: a.width, height: a.height},
      menu: {left: menuLeft, top: menuTop, width: MENU_W, height: menuH},
      reactions:
        reactionsTop != null
          ? {left: reactionLeft, top: reactionsTop, width: reactionW}
          : null,
    };
  }, [displayAnchor, displayMessage, capabilities, winW, winH]);

  const dismiss = useCallback(
    (after?: (msg: ChatMessage) => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      const msg = displayMessage;

      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: CLOSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(pop, {
          toValue: 0.98,
          duration: CLOSE_MS,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        closingRef.current = false;
        if (!finished) return;
        onClose();
        if (msg && after) after(msg);
      });
    },
    [displayMessage, fade, pop, onClose],
  );

  useEffect(() => {
    if (!visible) return;
    closingRef.current = false;
    fade.setValue(0);
    pop.setValue(0.96);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(pop, {
        toValue: 1,
        friction: 7,
        tension: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, pop]);

  const pickEmoji = (emoji: string) => {
    hapticSelection();
    const msg = displayMessage;
    if (!msg) return;
    void Promise.resolve(onReact(msg, emoji)).finally(() => {
      dismiss();
    });
  };

  if (!visible || !displayMessage || !displayAnchor) return null;

  const blurType = mode === 'dark' ? 'dark' : 'light';
  const blurAmount = Platform.OS === 'ios' ? 24 : 14;
  const solidMenuBg = mode === 'dark' ? '#1F2937' : '#FFFFFF';
  const solidBorder = mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#E5E7EB';

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => dismiss()}
      statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, {opacity: fade}]}>
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType={blurType}
            blurAmount={blurAmount}
            reducedTransparencyFallbackColor={
              mode === 'dark' ? 'rgba(17,24,39,0.92)' : 'rgba(243,244,246,0.92)'
            }
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  mode === 'dark'
                    ? 'rgba(0,0,0,0.42)'
                    : 'rgba(17, 24, 39, 0.32)',
              },
            ]}
          />
        </Animated.View>

        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.floating,
            {
              left: layout.bubble.left,
              top: layout.bubble.top,
              width: layout.bubble.width,
              opacity: fade,
              transform: [{scale: pop}],
            },
          ]}>
          <MessageBubble item={displayMessage} theme={bubbleTheme} pinned />
        </Animated.View>

        {capabilities.canReact && layout.reactions ? (
          <Animated.View
            style={[
              styles.floating,
              {
                left: layout.reactions.left,
                top: layout.reactions.top,
                opacity: fade,
                transform: [{scale: pop}],
              },
            ]}>
            <View
              style={[
                styles.reactionPanel,
                {
                  backgroundColor: solidMenuBg,
                  borderColor: solidBorder,
                  width: layout.reactions.width,
                },
              ]}>
              {reacting ? (
                <ActivityIndicator color={brand.blue} style={styles.reacting} />
              ) : (
                <View style={styles.reactionRow}>
                  {QUICK_REACTIONS.map(emoji => (
                    <Pressable
                      key={emoji}
                      style={({pressed}) => [
                        styles.reactionBtn,
                        pressed && styles.reactionBtnPressed,
                      ]}
                      onPress={() => pickEmoji(emoji)}
                      disabled={reacting || closingRef.current}>
                      <Text style={styles.reactionEmoji}>{emoji}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={({pressed}) => [
                      styles.expandBtn,
                      {
                        backgroundColor: theme.fill,
                        borderColor: solidBorder,
                      },
                      pressed && styles.reactionBtnPressed,
                    ]}
                    onPress={() => {
                      hapticSelection();
                      // Fecha este Modal antes de abrir o teclado (outro Modal)
                      dismiss(msg => onMoreEmojis(msg));
                    }}
                    accessibilityLabel={t.messageActions.moreEmojis}>
                    <Plus size={18} color={theme.secondaryLabel} />
                  </Pressable>
                </View>
              )}
            </View>
          </Animated.View>
        ) : null}

        <Animated.View
          style={[
            styles.floating,
            {
              left: layout.menu.left,
              top: layout.menu.top,
              width: layout.menu.width,
              opacity: fade,
              transform: [{scale: pop}],
            },
          ]}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: solidMenuBg,
                borderColor: solidBorder,
              },
            ]}>
            <ScrollView bounces={false}>
              {capabilities.canReply ? (
                <ActionRow
                  icon={<Reply size={20} color={theme.label} />}
                  label={t.messageActions.reply}
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onReply(msg))}
                />
              ) : null}
              {capabilities.canCopy ? (
                <ActionRow
                  icon={<Copy size={20} color={theme.label} />}
                  label={t.messageActions.copy}
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() =>
                    dismiss(msg => {
                      void onCopy(msg);
                    })
                  }
                />
              ) : null}
              {capabilities.canDownload ? (
                <ActionRow
                  icon={<Download size={20} color={theme.label} />}
                  label={t.messageActions.download}
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onDownload?.(msg))}
                />
              ) : null}
              {capabilities.showEdit ? (
                <ActionRow
                  icon={<Pencil size={20} color={theme.label} />}
                  label="Editar"
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onEdit?.(msg))}
                />
              ) : null}
              {capabilities.showDelete ? (
                <ActionRow
                  icon={<Trash2 size={20} color="#EF4444" />}
                  label="Excluir"
                  color="#EF4444"
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onDelete?.(msg))}
                />
              ) : null}
              {capabilities.showPin ? (
                <ActionRow
                  icon={<Pin size={20} color={theme.label} />}
                  label="Fixar"
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onPin?.(msg))}
                />
              ) : null}
              {capabilities.showUnpin ? (
                <ActionRow
                  icon={<PinOff size={20} color={theme.label} />}
                  label="Desafixar"
                  color={theme.label}
                  pressedBg={theme.fill}
                  borderColor={solidBorder}
                  onPress={() => dismiss(msg => onUnpin?.(msg))}
                />
              ) : null}
              <ActionRow
                icon={<Info size={20} color={theme.label} />}
                label={t.messageActions.details}
                color={theme.label}
                pressedBg={theme.fill}
                borderColor={solidBorder}
                onPress={() => dismiss(msg => onDetails(msg))}
                last
              />
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  color,
  pressedBg,
  borderColor,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  pressedBg: string;
  borderColor: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({pressed}) => [
        styles.actionRow,
        pressed && {backgroundColor: pressedBg},
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth * 2,
          borderBottomColor: borderColor,
        },
      ]}
      onPress={() => {
        hapticSelection();
        onPress();
      }}>
      {icon}
      <Text style={[styles.actionLabel, {color}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  floating: {
    position: 'absolute',
    zIndex: 2,
  },
  reactionPanel: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: {width: 0, height: 4},
      },
      android: {elevation: 8},
      default: {},
    }),
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reactionBtn: {
    width: EMOJI_BTN,
    height: EMOJI_BTN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  expandBtn: {
    width: 36,
    height: 36,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  reactionBtnPressed: {
    transform: [{scale: 1.18}],
  },
  reactionEmoji: {
    fontSize: 26,
  },
  reacting: {
    marginHorizontal: 48,
    marginVertical: 10,
  },
  sheet: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.22,
        shadowRadius: 16,
        shadowOffset: {width: 0, height: 8},
      },
      android: {elevation: 10},
      default: {},
    }),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    height: MENU_ROW_H,
  },
  actionLabel: {
    fontSize: typography.callout,
    fontWeight: '500',
  },
});
