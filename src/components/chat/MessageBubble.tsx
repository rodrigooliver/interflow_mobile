import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Linking,
  Modal,
  ScrollView,
  Animated,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {hapticLongPress, hapticSelection} from '../../utils/haptics';
import {
  FileText,
  MapPin,
  Play,
  User,
  Phone,
  Tag,
  MessageSquare,
  Ban,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  UserPlus,
  UserMinus,
  UserCog,
  Users,
  CheckCircle,
  RefreshCw,
  RotateCcw,
  Info,
  Building,
  SquareCheck,
  Mail,
} from 'lucide-react-native';
import {useI18n} from '../../contexts/I18nContext';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChatMessage} from '../../services/chatsApi';
import {MarkdownText} from '../MarkdownText';
import {MessageStatusTicks} from '../MessageStatusTicks';
import {ImageViewerModal} from './ImageViewerModal';
import {VideoPreviewModal} from './VideoPreviewModal';
import {ChatAudioPlayer} from './ChatAudioPlayer';
import {WhatsAppAdMessage} from './WhatsAppAdMessage';
import {EmailPreviewModal} from './EmailPreviewModal';
import {
  attachmentLabel,
  CHAT_MEDIA_MAX_WIDTH,
  CHAT_MEDIA_PROBE_PLACEHOLDER,
  extractContactInfo,
  extractLocation,
  formatMessageTime,
  getAttachments,
  getConstrainedMediaSize,
  getEmailSubject,
  getExternalAdReply,
  getInstagramStoryReply,
  getInteractiveButtons,
  getMetadata,
  getStageUpdateInfo,
  getSystemEventIconColor,
  getSystemEventLabel,
  hasEmailOriginalContent,
  isAudioAttachment,
  isImageAttachment,
  isOutgoing,
  isSystemEvent,
  isVideoAttachment,
  parseTemplateParts,
  type EmailMessageMetadata,
  type MessageAnchor,
  type MessageAttachment,
} from './messageHelpers';

export type BubbleTheme = {
  bubbleOut: string;
  bubbleIn: string;
  bubbleOutText: string;
  bubbleOutBorder: string;
  bubbleOutMuted: string;
  bubbleInText: string;
  bubbleInBorder: string;
  tertiaryLabel: string;
  secondaryLabel: string;
  fill: string;
  border: string;
  label: string;
};

type Props = {
  item: ChatMessage;
  theme: BubbleTheme;
  /** Overlay: bolha na posição medida, sem maxWidth da lista */
  pinned?: boolean;
  /** Esconde a bolha da lista enquanto o overlay está aberto */
  hidden?: boolean;
  /**
   * Espaço depois da bolha (em direção às msgs mais novas / baixo na tela).
   * No inverted, o gap de troca de lado vai na ÚLTIMA msg do grupo antigo.
   */
  spacingAfter?: number;
  /** Tipo do chat — interno: lado baseado no usuário logado */
  chatType?: string | null;
  /** user_id do usuário logado (para chats internos) */
  currentUserId?: string | null;
  onLongPress?: (message: ChatMessage, anchor: MessageAnchor) => void;
};

function openUrl(url?: string | null) {
  if (!url) return;
  void Linking.openURL(url).catch(() => undefined);
}

const LONG_PRESS_DELAY = 320;

/**
 * Um Pressable filho vira o responder do toque e engole o long press da bolha.
 * A bolha publica aqui o gatilho para os controles internos reemitirem o menu.
 */
const BubbleLongPressContext = createContext<(() => void) | null>(null);

/** Pressable de mídia dentro da bolha que preserva o long press do menu. */
function MediaPressable({
  onPress,
  disabled,
  style,
  accessibilityRole,
  accessibilityLabel,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: 'button' | 'imagebutton';
  accessibilityLabel?: string;
  children: React.ReactNode;
}) {
  const longPress = useContext(BubbleLongPressContext);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={longPress ?? undefined}
      delayLongPress={LONG_PRESS_DELAY}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={({pressed}) => [style, pressed && styles.mediaPressed]}>
      {children}
    </Pressable>
  );
}

function ImageAttachmentPreview({
  url,
  isSticker,
  out,
  width,
  height,
}: {
  url: string;
  isSticker: boolean;
  out?: boolean;
  width?: number | null;
  height?: number | null;
}) {
  const {width: windowWidth} = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [probed, setProbed] = useState<{width: number; height: number} | null>(
    null,
  );

  const hasKnownSize =
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0;

  useEffect(() => {
    if (hasKnownSize) {
      setProbed(null);
      return;
    }
    let cancelled = false;
    Image.getSize(
      url,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) {
          setProbed({width: w, height: h});
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [url, hasKnownSize, width, height]);

  const natural = hasKnownSize
    ? {width: width!, height: height!}
    : probed;
  // Bolha tem maxWidth 78% — não deixar a imagem estourar a borda direita
  const bubbleInnerMax = Math.max(
    120,
    Math.floor(windowWidth * 0.78) - 6,
  );
  const maxSide = isSticker
    ? Math.min(140, bubbleInnerMax)
    : Math.min(CHAT_MEDIA_MAX_WIDTH, bubbleInnerMax);
  const displaySize = natural
    ? getConstrainedMediaSize(natural.width, natural.height, maxSide, maxSide)
    : isSticker
      ? {width: Math.min(140, maxSide), height: Math.min(140, maxSide)}
      : getConstrainedMediaSize(
          CHAT_MEDIA_PROBE_PLACEHOLDER.width,
          CHAT_MEDIA_PROBE_PLACEHOLDER.height,
          maxSide,
          maxSide,
        );

  return (
    <>
      <MediaPressable
        onPress={() => setViewerOpen(true)}
        accessibilityRole="imagebutton"
        style={
          !isSticker
            ? [
                out ? styles.mediaOutClip : styles.mediaInClip,
                {
                  width: displaySize.width,
                  height: displaySize.height,
                  maxWidth: '100%',
                },
              ]
            : undefined
        }>
        <Image
          source={{uri: url}}
          style={
            isSticker
              ? [
                  styles.sticker,
                  {width: displaySize.width, height: displaySize.height},
                ]
              : [
                  styles.media,
                  out ? styles.mediaOut : styles.mediaIn,
                  {
                    width: '100%',
                    height: '100%',
                  },
                ]
          }
          resizeMode={isSticker ? 'contain' : 'cover'}
        />
      </MediaPressable>
      <ImageViewerModal
        visible={viewerOpen}
        uri={url}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

/** Card de resposta a story do Instagram — URL costuma ser vídeo (lookaside CDN). */
function InstagramStoryReplyCard({
  url,
  label,
  out,
  mutedColor,
  padded,
}: {
  url: string;
  label: string;
  out: boolean;
  mutedColor: string;
  padded?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <>
      <View style={[styles.storyReplyCard, padded && styles.imageInnerPad]}>
        <Text
          style={[styles.storyReplyLabel, {color: mutedColor}]}
          numberOfLines={1}>
          {label}
        </Text>
        <MediaPressable
          onPress={() => setViewerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={[
            styles.storyReplyMedia,
            out ? styles.mediaOutClip : styles.mediaInClip,
          ]}>
          <View
            style={[
              StyleSheet.absoluteFillObject,
              styles.videoPosterFallback,
              styles.media,
              out ? styles.mediaOut : styles.mediaIn,
            ]}
          />
          <View style={styles.videoPlayOverlay}>
            <View style={styles.videoPlayBtn}>
              <Play size={22} color="#1f2937" fill="#1f2937" />
            </View>
          </View>
        </MediaPressable>
      </View>
      <VideoPreviewModal
        visible={viewerOpen}
        uri={url}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

function VideoAttachmentPreview({
  url,
  posterUrl,
  fileName,
  out,
  width,
  height,
}: {
  url: string;
  posterUrl?: string | null;
  fileName?: string | null;
  out?: boolean;
  width?: number | null;
  height?: number | null;
}) {
  const {width: windowWidth} = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);

  const hasKnownSize =
    typeof width === 'number' &&
    width > 0 &&
    typeof height === 'number' &&
    height > 0;

  const bubbleInnerMax = Math.max(
    120,
    Math.floor(windowWidth * 0.78) - 6,
  );
  const maxSide = Math.min(CHAT_MEDIA_MAX_WIDTH, bubbleInnerMax);
  // Placeholder 16:9 em px reais (getConstrainedMediaSize não amplia — 16x9 ficava invisível).
  const displaySize = hasKnownSize
    ? getConstrainedMediaSize(width!, height!, maxSide, maxSide)
    : getConstrainedMediaSize(320, 180, maxSide, maxSide);

  const thumb = posterUrl && posterUrl !== url ? posterUrl : null;

  return (
    <>
      <MediaPressable
        onPress={() => setViewerOpen(true)}
        accessibilityRole="imagebutton"
        style={[
          out ? styles.mediaOutClip : styles.mediaInClip,
          styles.videoPreview,
          {
            width: displaySize.width,
            height: displaySize.height,
            maxWidth: '100%',
          },
        ]}>
        {thumb ? (
          <Image
            source={{uri: thumb}}
            style={[
              StyleSheet.absoluteFillObject,
              styles.media,
              out ? styles.mediaOut : styles.mediaIn,
            ]}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              styles.videoPosterFallback,
              styles.media,
              out ? styles.mediaOut : styles.mediaIn,
            ]}
          />
        )}
        <View style={styles.videoPlayOverlay}>
          <View style={styles.videoPlayBtn}>
            <Play size={28} color="#1f2937" fill="#1f2937" />
          </View>
        </View>
      </MediaPressable>
      <VideoPreviewModal
        visible={viewerOpen}
        uri={url}
        fileName={fileName}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

/** Horário + ticks — coluna, embaixo, ou sobreposto no player de áudio. */
function MessageMeta({
  item,
  out,
  theme,
  privateNote,
  placement = 'column',
}: {
  item: ChatMessage;
  out: boolean;
  theme: BubbleTheme;
  privateNote?: boolean;
  placement?: 'column' | 'below' | 'overlay';
}) {
  const timeColor = privateNote
    ? 'rgba(146, 64, 14, 0.7)'
    : out
      ? theme.bubbleOutMuted
      : theme.tertiaryLabel;

  const wrapStyle =
    placement === 'below'
      ? styles.metaBelow
      : placement === 'overlay'
        ? styles.metaOverlay
        : styles.metaColumn;

  return (
    <View style={wrapStyle}>
      <View
        style={[
          styles.metaTimeRow,
          placement === 'column' && styles.metaTimeRowColumn,
        ]}>
        <Text style={[styles.meta, {color: timeColor}]}>
          {formatMessageTime(item.created_at)}
        </Text>
        {out && !privateNote ? (
          <MessageStatusTicks
            status={item.status}
            mutedColor={theme.bubbleOutMuted}
            readColor={brand.blue}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Conteúdo + meta lado a lado; meta encosta na base direita. */
function BubbleContentRow({
  children,
  meta,
  textPad,
  imagePad,
  out,
}: {
  children: React.ReactNode;
  meta?: React.ReactNode;
  /** Texto: mais padding no lado oposto ao horário. */
  textPad?: boolean;
  /** Imagem: padding mínimo (quase colada na borda). */
  imagePad?: boolean;
  /** Cliente (incoming): mais respiro à direita junto do horário. */
  out?: boolean;
}) {
  const padStyle = imagePad
    ? styles.contentPadImage
    : textPad
      ? out
        ? styles.contentPadText
        : styles.contentPadTextIn
      : styles.contentPad;

  if (!meta) {
    return <View style={padStyle}>{children}</View>;
  }

  return (
    <View style={[padStyle, styles.contentRow]}>
      <View style={styles.contentMain}>{children}</View>
      {meta}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string | null {
  let value = hex.startsWith('#') ? hex : `#${hex}`;
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(value);
  if (short) {
    value = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (!result) return null;
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
}

function renderSystemIcon(type: string, color: string): React.ReactNode {
  const props = {size: 14 as const, color, strokeWidth: 2.2};
  switch (type) {
    case 'user_start':
      return <MessageSquare {...props} />;
    case 'user_start_auto':
    case 'auto_assigned':
      return <RotateCcw {...props} />;
    case 'user_entered':
    case 'user_join':
      return <UserPlus {...props} />;
    case 'user_left':
      return <UserMinus {...props} />;
    case 'user_transferred':
    case 'user_transferred_himself':
    case 'stage_update':
      return <UserCog {...props} />;
    case 'team_transferred':
      return <Users {...props} />;
    case 'user_closed':
      return <CheckCircle {...props} />;
    case 'user_reopened':
      return <RefreshCw {...props} />;
    case 'info':
      return <Info {...props} />;
    case 'task':
      return <SquareCheck {...props} />;
    case 'call_received':
      return <Phone {...props} />;
    case 'tag_added':
    case 'tag_removed':
      return <Tag {...props} />;
    default:
      return null;
  }
}

function SystemChip({
  label,
  time,
  icon,
  accentDot,
  theme,
  variant = 'default',
  onLongPress,
}: {
  label: string;
  time: string;
  icon?: React.ReactNode;
  accentDot?: string | null;
  theme: BubbleTheme;
  variant?: 'default' | 'alert';
  onLongPress?: (anchor: MessageAnchor) => void;
}) {
  const wrapRef = useRef<View>(null);
  const isAlert = variant === 'alert';

  const handleLongPress = () => {
    if (!onLongPress) return;
    hapticLongPress();
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({x, y, width, height});
    });
  };

  return (
    <Pressable
      ref={wrapRef}
      style={styles.systemWrap}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={320}>
      <View
        style={[
          isAlert ? styles.alertChip : styles.systemChip,
          !isAlert && {
            backgroundColor: theme.fill,
            borderColor: theme.border,
          },
        ]}>
        {icon}
        {accentDot ? (
          <View
            style={[styles.systemAccentDot, {backgroundColor: accentDot}]}
          />
        ) : null}
        <Text
          style={[
            isAlert ? styles.alertText : styles.systemText,
            !isAlert && {color: theme.secondaryLabel},
          ]}>
          {label}
        </Text>
        {time ? (
          <Text
            style={[
              isAlert ? styles.alertTime : styles.systemTime,
              !isAlert && {color: theme.tertiaryLabel},
            ]}>
            {time}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function StageBadge({
  name,
  color,
  isNew,
  theme,
  isDark,
}: {
  name: string;
  color: string | null;
  isNew: boolean;
  theme: BubbleTheme;
  isDark: boolean;
}) {
  const fallbackBg = isNew
    ? isDark
      ? 'rgba(16, 185, 129, 0.22)'
      : 'rgba(209, 250, 229, 1)'
    : isDark
      ? 'rgba(75, 85, 99, 0.35)'
      : 'rgba(243, 244, 246, 1)';
  const fallbackBorder = isNew
    ? isDark
      ? 'rgba(16, 185, 129, 0.45)'
      : 'rgba(167, 243, 208, 1)'
    : theme.border;
  const fallbackText = isNew
    ? isDark
      ? '#A7F3D0'
      : '#065F46'
    : theme.secondaryLabel;

  return (
    <View
      style={[
        styles.stageBadge,
        {
          backgroundColor: color
            ? hexToRgba(color, isNew ? 0.14 : 0.1) || fallbackBg
            : fallbackBg,
          borderColor: color
            ? isNew
              ? color
              : hexToRgba(color, 0.35) || fallbackBorder
            : fallbackBorder,
        },
      ]}>
      <Text
        style={[
          styles.stageBadgeText,
          {color: color || fallbackText},
        ]}
        numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

function StageUpdateCard({
  item,
  time,
  theme,
  stageUpdateLabel,
  noStageLabel,
  onLongPress,
}: {
  item: ChatMessage;
  time: string;
  theme: BubbleTheme;
  stageUpdateLabel: string;
  noStageLabel: string;
  onLongPress?: (anchor: MessageAnchor) => void;
}) {
  const {theme: mode} = useTheme();
  const isDark = mode === 'dark';
  const wrapRef = useRef<View>(null);
  const info = getStageUpdateInfo(item, {
    stageUpdate: stageUpdateLabel,
    noStage: noStageLabel,
  });

  const handleLongPress = () => {
    if (!onLongPress) return;
    hapticLongPress();
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({x, y, width, height});
    });
  };

  const cardBg = isDark ? 'rgba(31, 41, 55, 0.72)' : 'rgba(255, 255, 255, 0.95)';
  const cardBorder = isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(229, 231, 235, 0.9)';
  const iconBg = isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(236, 253, 245, 1)';
  const iconColor = isDark ? '#34D399' : '#059669';

  return (
    <Pressable
      ref={wrapRef}
      style={styles.stageWrap}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={320}>
      <View
        style={[
          styles.stageCard,
          {backgroundColor: cardBg, borderColor: cardBorder},
        ]}>
        <View style={styles.stageHeader}>
          <View style={[styles.stageIconBox, {backgroundColor: iconBg}]}>
            <Building size={12} color={iconColor} strokeWidth={2.2} />
          </View>
          <Text
            style={[styles.stageFunnel, {color: theme.secondaryLabel}]}
            numberOfLines={1}>
            {info.funnelName}
          </Text>
          {time ? (
            <Text style={[styles.systemTime, {color: theme.tertiaryLabel}]}>
              {time}
            </Text>
          ) : null}
        </View>

        <View style={styles.stageRow}>
          <StageBadge
            name={info.oldStageName}
            color={info.oldStageColor}
            isNew={false}
            theme={theme}
            isDark={isDark}
          />
          <ChevronRight size={14} color={iconColor} strokeWidth={2.4} />
          <StageBadge
            name={info.newStageName || noStageLabel}
            color={info.newStageColor}
            isNew
            theme={theme}
            isDark={isDark}
          />
        </View>

        {info.notes ? (
          <Text
            style={[styles.stageNotes, {color: theme.secondaryLabel}]}
            numberOfLines={4}>
            {info.notes}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Mensagem de contexto colapsável.
 * Sheet sobe com animação própria; backdrop só faz fade (não slide).
 */
function ContextMessageCard({
  content,
  time,
  title,
  onLongPress,
}: {
  content: string;
  time: string;
  title: string;
  onLongPress?: (anchor: MessageAnchor) => void;
}) {
  const {theme: mode} = useTheme();
  const insets = useSafeAreaInsets();
  const {height: winH} = useWindowDimensions();
  const [modalVisible, setModalVisible] = useState(false);
  const wrapRef = useRef<View>(null);
  const closingRef = useRef(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslate = useRef(new Animated.Value(winH)).current;
  const isDark = mode === 'dark';

  const bg = isDark ? 'rgba(30, 58, 138, 0.22)' : 'rgba(239, 246, 255, 1)';
  const border = isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(191, 219, 254, 1)';
  const titleColor = isDark ? '#93C5FD' : '#1D4ED8';
  const bodyColor = isDark ? '#BFDBFE' : '#1E40AF';
  const mutedColor = isDark ? '#60A5FA' : '#3B82F6';
  const bodyBg = isDark ? 'rgba(23, 37, 84, 0.45)' : '#FFFFFF';
  const bodyBorder = isDark
    ? 'rgba(30, 64, 175, 0.4)'
    : 'rgba(219, 234, 254, 1)';
  const sheetBg = isDark ? '#0F172A' : '#F8FAFC';

  const openSheet = () => {
    closingRef.current = false;
    hapticSelection();
    sheetTranslate.setValue(winH * 0.45);
    backdropOpacity.setValue(0);
    setModalVisible(true);
    requestAnimationFrame(() => {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslate, {
          toValue: 0,
          friction: 9,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const closeSheet = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslate, {
        toValue: winH * 0.5,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      closingRef.current = false;
      if (finished) setModalVisible(false);
    });
  };

  const handleLongPress = () => {
    if (!onLongPress) return;
    hapticLongPress();
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({x, y, width, height});
    });
  };

  return (
    <View ref={wrapRef} style={styles.contextWrap}>
      <Pressable
        style={[
          styles.contextCollapsed,
          {backgroundColor: bg, borderColor: border},
        ]}
        onPress={openSheet}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={320}>
        <Lightbulb size={16} color={mutedColor} />
        <Text
          style={[styles.contextCollapsedText, {color: titleColor}]}
          numberOfLines={2}>
          {content}
        </Text>
        <Text style={[styles.contextTime, {color: mutedColor}]}>{time}</Text>
        <ChevronRight size={16} color={mutedColor} />
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
        statusBarTranslucent>
        <View style={styles.contextSheetRoot} pointerEvents="box-none">
          <Animated.View
            style={[styles.contextSheetBackdrop, {opacity: backdropOpacity}]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          </Animated.View>
          <Animated.View
            style={[
              styles.contextSheet,
              {
                backgroundColor: sheetBg,
                borderColor: border,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
                transform: [{translateY: sheetTranslate}],
              },
            ]}>
            <View style={styles.contextSheetKnobWrap}>
              <View
                style={[styles.contextSheetKnob, {backgroundColor: border}]}
              />
            </View>
            <View style={styles.contextHeader}>
              <View style={styles.contextHeaderLeft}>
                <Lightbulb size={16} color={mutedColor} />
                <Text style={[styles.contextTitle, {color: titleColor}]}>
                  {title}
                </Text>
              </View>
              <View style={styles.contextHeaderRight}>
                <Text style={[styles.contextTimeBadge, {color: mutedColor}]}>
                  {time}
                </Text>
                <Pressable
                  onPress={closeSheet}
                  hitSlop={10}
                  accessibilityRole="button">
                  <ChevronDown size={18} color={mutedColor} />
                </Pressable>
              </View>
            </View>
            <View style={[styles.contextDivider, {backgroundColor: border}]} />
            <ScrollView
              style={styles.contextSheetScroll}
              bounces
              showsVerticalScrollIndicator={false}>
              <View
                style={[
                  styles.contextBody,
                  {backgroundColor: bodyBg, borderColor: bodyBorder},
                ]}>
                <Text style={[styles.contextBodyText, {color: bodyColor}]}>
                  {content}
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function AttachmentBlock({
  attachment,
  messageType,
  out,
  theme,
  labels,
  isFileTooLarge = false,
  fileName,
}: {
  attachment: MessageAttachment;
  messageType?: string | null;
  out: boolean;
  theme: BubbleTheme;
  labels: {
    openAudio: string;
    openVideo: string;
    openFile: string;
    mediaAbsent: string;
    mediaTooLargeTitle: string;
    mediaTooLarge: string;
  };
  isFileTooLarge?: boolean;
  fileName?: string | null;
}) {
  const longPress = useContext(BubbleLongPressContext);
  const url = attachment.url || attachment.preview_url;
  const textColor = out ? theme.bubbleOutText : theme.bubbleInText;
  const muted = out ? 'rgba(255,255,255,0.75)' : theme.tertiaryLabel;
  const type = (messageType || attachment.type || '').toLowerCase();

  if (!url) {
    if (isFileTooLarge) {
      const displayName =
        fileName ||
        attachment.name ||
        attachment.file_name ||
        null;
      return (
        <View
          style={[
            styles.mediaTooLarge,
            {backgroundColor: out ? 'rgba(255,255,255,0.12)' : theme.fill},
          ]}>
          <Ban size={18} color={muted} />
          <View style={styles.mediaTooLargeTextWrap}>
            <Text style={[styles.mediaTooLargeTitle, {color: textColor}]}>
              {labels.mediaTooLargeTitle}
            </Text>
            {displayName ? (
              <Text
                style={[styles.mediaTooLargeFileName, {color: muted}]}
                numberOfLines={1}>
                {displayName}
              </Text>
            ) : null}
            <Text
              style={[styles.mediaTooLargeBody, {color: muted}]}
              numberOfLines={2}>
              {labels.mediaTooLarge}
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.mediaAbsent, {backgroundColor: out ? 'rgba(255,255,255,0.12)' : theme.fill}]}>
        <Ban size={18} color={muted} />
        <Text style={[styles.mediaAbsentText, {color: muted}]}>
          {labels.mediaAbsent}
        </Text>
      </View>
    );
  }

  if (type === 'sticker' || isImageAttachment(attachment) || type.includes('image')) {
    const isSticker = type === 'sticker';
    return (
      <ImageAttachmentPreview
        url={url}
        isSticker={isSticker}
        out={out}
        width={attachment.width}
        height={attachment.height}
      />
    );
  }

  if (type === 'video' || isVideoAttachment(attachment)) {
    return (
      <VideoAttachmentPreview
        url={url}
        posterUrl={attachment.preview_url}
        fileName={attachmentLabel(attachment)}
        out={out}
        width={attachment.width}
        height={attachment.height}
      />
    );
  }

  if (type === 'audio' || isAudioAttachment(attachment)) {
    return (
      <ChatAudioPlayer
        url={url}
        out={out}
        accentColor={out ? '#FFFFFF' : brand.blue}
        textColor={out ? 'rgba(255,255,255,0.85)' : theme.secondaryLabel}
        trackColor={out ? 'rgba(255,255,255,0.28)' : theme.fill}
        fillColor={out ? 'rgba(255,255,255,0.2)' : brand.blueSoft}
        onLongPress={longPress ?? undefined}
      />
    );
  }

  return (
    <MediaPressable
      style={[styles.docChip, {backgroundColor: out ? 'rgba(255,255,255,0.12)' : theme.fill}]}
      onPress={() => openUrl(url)}
      accessibilityRole="button">
      <FileText size={18} color={textColor} />
      <Text
        style={[styles.docName, {color: textColor}]}
        numberOfLines={2}>
        {attachmentLabel(attachment)}
      </Text>
      <Text style={[styles.docHint, {color: muted}]}>{labels.openFile}</Text>
    </MediaPressable>
  );
}

function ReactionBadges({
  reactions,
  out,
}: {
  reactions: Record<string, {reaction?: string} | string>;
  out: boolean;
}) {
  const {theme: mode} = useTheme();
  const entries = Object.entries(reactions);
  if (entries.length === 0) return null;
  const isDark = mode === 'dark';
  return (
    <View style={[styles.reactionsWrap, out ? styles.reactionsOut : styles.reactionsIn]}>
      {entries.map(([senderId, value], index) => {
        const emoji =
          typeof value === 'string'
            ? value
            : (value as {reaction?: string})?.reaction;
        if (!emoji) return null;
        return (
          <View
            key={`${senderId}-${index}`}
            style={[
              styles.reactionBadge,
              {
                backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                borderColor: isDark
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(229, 231, 235, 0.95)',
              },
              index > 0 && styles.reactionOverlap,
            ]}>
            <Text style={styles.reactionBadgeText}>{emoji}</Text>
          </View>
        );
      })}
    </View>
  );
}

function BubbleShell({
  out,
  theme,
  privateNote,
  pinned,
  style,
  onLongPress,
  reactions,
  children,
}: {
  out: boolean;
  theme: BubbleTheme;
  privateNote?: boolean;
  pinned?: boolean;
  style?: StyleProp<ViewStyle>;
  onLongPress?: (anchor: MessageAnchor) => void;
  reactions?: Record<string, {reaction?: string} | string> | null;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<View>(null);

  const bg = privateNote
    ? 'rgba(245, 158, 11, 0.16)'
    : out
      ? theme.bubbleOut
      : theme.bubbleIn;
  const borderColor = privateNote
    ? 'rgba(245, 158, 11, 0.45)'
    : out
      ? theme.bubbleOutBorder
      : theme.bubbleInBorder;

  const hasReactions = reactions && Object.keys(reactions).length > 0;

  const playLongPressFeedback = useCallback(() => {
    if (!onLongPress) return;
    hapticLongPress();
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({x, y, width, height});
    });
  }, [onLongPress]);

  return (
    <Pressable
      ref={wrapRef}
      style={[
        styles.bubbleWrap,
        pinned && styles.bubbleWrapPinned,
        !pinned && (out || privateNote ? styles.bubbleWrapOut : styles.bubbleWrapIn),
        hasReactions && styles.bubbleWrapWithReactions,
      ]}
      onLongPress={onLongPress ? playLongPressFeedback : undefined}
      delayLongPress={LONG_PRESS_DELAY}>
      <View
        style={[
          styles.bubble,
          out || privateNote ? styles.bubbleOut : styles.bubbleIn,
          {
            backgroundColor: bg,
            borderColor,
            borderWidth: StyleSheet.hairlineWidth * 2,
          },
          style,
        ]}>
        <BubbleLongPressContext.Provider
          value={onLongPress ? playLongPressFeedback : null}>
          {children}
        </BubbleLongPressContext.Provider>
      </View>
      {reactions ? <ReactionBadges reactions={reactions} out={out || !!privateNote} /> : null}
    </Pressable>
  );
}

export const MessageBubble = memo(function MessageBubble({
  item,
  theme,
  pinned,
  hidden,
  spacingAfter = 2,
  chatType,
  currentUserId,
  onLongPress,
}: Props) {
  const {t} = useI18n();
  const out = isOutgoing(item, {chatType, currentUserId});
  const type = item.type || 'text';
  const metadata = getMetadata(item);
  const attachments = getAttachments(item);
  const textColor = out ? theme.bubbleOutText : theme.bubbleInText;
  const time = formatMessageTime(item.created_at);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);

  const handleLongPress = onLongPress
    ? (anchor: MessageAnchor) => onLongPress(item, anchor)
    : undefined;
  const reactions = (metadata.reactions || null) as
    | Record<string, {reaction?: string} | string>
    | null;

  const {theme: mode} = useTheme();
  const isDark = mode === 'dark';

  const externalAdReply = useMemo(() => getExternalAdReply(item), [item]);
  const hasWhatsAppAd = Boolean(externalAdReply?.title);
  const storyReply = useMemo(
    () => getInstagramStoryReply(metadata),
    [metadata],
  );
  const canPreviewEmail = hasEmailOriginalContent(metadata);
  const emailSubject = getEmailSubject(metadata);

  const labels = useMemo(
    () => ({
      userStart: t.messages.userStart,
      userStartAuto: t.messages.userStartAuto,
      autoAssigned: t.messages.autoAssigned,
      autoAssignedUntil: t.messages.autoAssignedUntil,
      userEntered: t.messages.userEntered,
      userLeft: t.messages.userLeft,
      userTransferred: t.messages.userTransferred,
      userTransferredHimself: t.messages.userTransferredHimself,
      teamTransferred: t.messages.teamTransferred,
      userJoin: t.messages.userJoin,
      userClosed: t.messages.userClosed,
      userReopened: t.messages.userReopened,
      callReceived: t.messages.callReceived,
      tagAdded: t.messages.tagAdded,
      tagAddedByAgent: t.messages.tagAddedByAgent,
      tagAddedByFlow: t.messages.tagAddedByFlow,
      tagRemoved: t.messages.tagRemoved,
      tagRemovedByAgent: t.messages.tagRemovedByAgent,
      tagRemovedByFlow: t.messages.tagRemovedByFlow,
      stageUpdate: t.messages.stageUpdate,
      noStage: t.messages.noStage,
      task: t.messages.task,
      info: t.messages.info,
      privateNote: t.messages.privateNote,
      mediaAbsent: t.messages.mediaAbsent,
      mediaTooLargeTitle: t.messages.mediaTooLargeTitle,
      mediaTooLarge: t.messages.mediaTooLarge,
      openAudio: t.messages.openAudio,
      openVideo: t.messages.openVideo,
      openMap: t.messages.openMap,
      openFile: t.messages.openFile,
      location: t.messages.location,
      contact: t.messages.contact,
      deleted: t.messages.deleted,
      template: t.messages.template,
      storyReply: t.messages.storyReply,
    }),
    [t],
  );

  const maybeHide = (node: React.ReactElement) => {
    // Gap na msg que fecha o grupo (vizinha mais nova do outro lado),
    // para ficar ANTES da 1ª do tipo novo — não abaixo dela.
    const spaced = (
      <View style={spacingAfter > 0 ? {marginBottom: spacingAfter} : undefined}>
        {node}
      </View>
    );
    return hidden ? (
      <View style={styles.hiddenBubble} pointerEvents="none">
        {spaced}
      </View>
    ) : (
      spaced
    );
  };

  if (type === 'deleted') {
    return maybeHide(
      <SystemChip
        label={labels.deleted}
        time={time}
        icon={<Ban size={14} color={theme.tertiaryLabel} />}
        theme={theme}
        onLongPress={handleLongPress}
      />,
    );
  }

  if (type === 'alert') {
    const alertText =
      (typeof metadata.alert_message_pt === 'string' &&
        metadata.alert_message_pt) ||
      item.content ||
      t.messages.alert;
    return maybeHide(
      <SystemChip
        label={alertText}
        time={time}
        theme={theme}
        variant="alert"
        onLongPress={handleLongPress}
      />,
    );
  }

  if (type === 'private') {
    const agentName = (
      item.sender_agent as {full_name?: string} | undefined
    )?.full_name;
    return maybeHide(
      <BubbleShell
        out
        theme={theme}
        privateNote
        pinned={pinned}
        onLongPress={handleLongPress}
        reactions={reactions}>
        <BubbleContentRow
          textPad
          out
          meta={<MessageMeta item={item} out theme={theme} privateNote />}>
          <View style={styles.privateHeader}>
            <MessageSquare size={14} color="#B45309" />
            <Text style={styles.privateLabel}>
              {agentName || labels.privateNote}
            </Text>
          </View>
          {item.content ? (
            <MarkdownText
              content={item.content}
              color="#92400E"
              linkColor="#B45309"
              style={styles.bubbleText}
            />
          ) : null}
        </BubbleContentRow>
      </BubbleShell>,
    );
  }

  if (type === 'stage_update') {
    return maybeHide(
      <StageUpdateCard
        item={item}
        time={time}
        theme={theme}
        stageUpdateLabel={labels.stageUpdate}
        noStageLabel={labels.noStage}
        onLongPress={handleLongPress}
      />,
    );
  }

  if (
    isSystemEvent(item) ||
    type === 'call_received' ||
    type === 'tag_added' ||
    type === 'tag_removed' ||
    type === 'task'
  ) {
    const label = getSystemEventLabel(item, labels);
    const iconColor = getSystemEventIconColor(type, isDark);
    const icon = renderSystemIcon(type, iconColor);
    const tagColor =
      type === 'tag_added' || type === 'tag_removed'
        ? typeof metadata.tag_color === 'string'
          ? metadata.tag_color
          : null
        : null;
    return maybeHide(
      <SystemChip
        label={label}
        time={time}
        icon={icon}
        accentDot={tagColor}
        theme={theme}
        onLongPress={handleLongPress}
      />,
    );
  }

  if (type === 'context') {
    return maybeHide(
      <ContextMessageCard
        content={item.content?.trim() || t.messages.context}
        time={time}
        title={t.messages.context}
        onLongPress={handleLongPress}
      />,
    );
  }

  // Contato
  if (
    type === 'contact' ||
    (metadata as {_data?: {Info?: {MediaType?: string}}})?._data?.Info
      ?.MediaType === 'vcard'
  ) {
    const contact = extractContactInfo(item);
    return maybeHide(
      <BubbleShell
        out={out}
        theme={theme}
        pinned={pinned}
        onLongPress={handleLongPress}
        reactions={reactions}>
        <BubbleContentRow
          textPad
          out={out}
          meta={<MessageMeta item={item} out={out} theme={theme} />}>
          {hasWhatsAppAd && externalAdReply ? (
            <WhatsAppAdMessage
              adReply={externalAdReply}
              out={out}
              sponsoredLabel={t.messages.sponsoredAd}
              viewAdLabel={t.messages.viewAd}
            />
          ) : null}
          <View style={styles.contactRow}>
            <View
              style={[
                styles.contactAvatar,
                {backgroundColor: out ? 'rgba(255,255,255,0.18)' : theme.fill},
              ]}>
              <User size={20} color={textColor} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactName, {color: textColor}]}>
                {contact?.displayName || labels.contact}
              </Text>
              {contact?.phone ? (
                <Text
                  style={[
                    styles.contactPhone,
                    {
                      color: out
                        ? 'rgba(255,255,255,0.75)'
                        : theme.secondaryLabel,
                    },
                  ]}>
                  {contact.phone}
                </Text>
              ) : null}
              {contact?.organization ? (
                <Text
                  style={[
                    styles.contactPhone,
                    {
                      color: out
                        ? 'rgba(255,255,255,0.75)'
                        : theme.tertiaryLabel,
                    },
                  ]}>
                  {contact.organization}
                </Text>
              ) : null}
            </View>
          </View>
        </BubbleContentRow>
      </BubbleShell>,
    );
  }

  // Localização
  if (type === 'location') {
    const location = extractLocation(item);
    const mapsUrl =
      location?.latitude != null && location?.longitude != null
        ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}&z=15`
        : null;
    const thumb =
      location?.jpegThumbnail != null
        ? `data:image/jpeg;base64,${location.jpegThumbnail}`
        : null;

    return maybeHide(
      <BubbleShell
        out={out}
        theme={theme}
        pinned={pinned}
        onLongPress={handleLongPress}
        reactions={reactions}>
        <BubbleContentRow
          out={out}
          meta={<MessageMeta item={item} out={out} theme={theme} />}>
          {hasWhatsAppAd && externalAdReply ? (
            <WhatsAppAdMessage
              adReply={externalAdReply}
              out={out}
              sponsoredLabel={t.messages.sponsoredAd}
              viewAdLabel={t.messages.viewAd}
            />
          ) : null}
          <MediaPressable
            onPress={() => openUrl(mapsUrl)}
            disabled={!mapsUrl}
            accessibilityRole="button">
            {thumb ? (
              <Image
                source={{uri: thumb}}
                style={[styles.media, styles.locationThumb]}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.mapPlaceholder,
                  {
                    backgroundColor: out
                      ? 'rgba(255,255,255,0.12)'
                      : theme.fill,
                  },
                ]}>
                <MapPin size={28} color={textColor} />
                <Text style={[styles.mediaActionText, {color: textColor}]}>
                  {labels.openMap}
                </Text>
              </View>
            )}
          </MediaPressable>
          {(location?.name || location?.address || item.content) && (
            <MarkdownText
              content={
                [location?.name, location?.address, item.content]
                  .filter(Boolean)
                  .join('\n') || ''
              }
              color={textColor}
              linkColor={brand.blue}
              style={[styles.bubbleText, styles.contentAfterMedia]}
            />
          )}
        </BubbleContentRow>
      </BubbleShell>,
    );
  }

  // Áudio (tipo dedicado)
  if (type === 'audio') {
    const att = attachments[0];
    const hasCaption = !!item.content?.trim();
    return maybeHide(
      <BubbleShell
        out={out}
        theme={theme}
        pinned={pinned}
        onLongPress={handleLongPress}
        reactions={reactions}>
        <BubbleContentRow>
          {hasWhatsAppAd && externalAdReply ? (
            <WhatsAppAdMessage
              adReply={externalAdReply}
              out={out}
              sponsoredLabel={t.messages.sponsoredAd}
              viewAdLabel={t.messages.viewAd}
            />
          ) : null}
          <View style={!hasCaption ? styles.audioMetaHost : undefined}>
            <AttachmentBlock
              attachment={att || {}}
              messageType="audio"
              out={out}
              theme={theme}
              labels={labels}
            />
            {!hasCaption ? (
              <View
                style={[
                  styles.audioMetaOverlay,
                  !out && styles.audioMetaOverlayIn,
                ]}
                pointerEvents="none">
                <MessageMeta
                  item={item}
                  out={out}
                  theme={theme}
                  placement="overlay"
                />
              </View>
            ) : null}
          </View>
          {hasCaption ? (
            <>
              <MarkdownText
                content={item.content || ''}
                color={textColor}
                linkColor={brand.blue}
                style={[styles.bubbleText, styles.contentAfterMedia]}
              />
              <View style={!out ? styles.customerMetaPadIn : undefined}>
                <MessageMeta
                  item={item}
                  out={out}
                  theme={theme}
                  placement="below"
                />
              </View>
            </>
          ) : null}
        </BubbleContentRow>
      </BubbleShell>,
    );
  }

  // Bolha padrão: texto / mídia / template / interativos
  const buttons = getInteractiveButtons(item);
  const isTemplate = type === 'template';
  const templateParts = isTemplate && item.content
    ? parseTemplateParts(item.content)
    : null;
  const responseTo = item.response_to as
    | {content?: string | null; type?: string | null; sender_type?: string | null}
    | undefined;

  const showTextContent =
    !!item.content &&
    !isTemplate &&
    type !== 'image' &&
    type !== 'sticker' &&
    type !== 'video';

  // Imagem/sticker/vídeo sem texto ainda mostra caption se houver
  const caption =
    (type === 'image' || type === 'sticker' || type === 'video' || type === 'document') &&
    item.content
      ? item.content
      : null;

  const hasImageMedia =
    type === 'image' ||
    type === 'sticker' ||
    attachments.some(att => isImageAttachment(att));
  const hasVideoMedia =
    type === 'video' || attachments.some(att => isVideoAttachment(att));
  // Imagem/vídeo: padding mínimo + borda colada (mesmo tratamento visual)
  const hasEdgeMedia = hasImageMedia || hasVideoMedia;
  const hasAudioMedia =
    type === 'audio' || attachments.some(att => isAudioAttachment(att));
  const hasLinkedText = !!item.content?.trim() || !!emailSubject;
  // Áudio sem texto: horário sobreposto no player (play centralizado)
  const audioMetaOverlay =
    hasAudioMedia && !hasLinkedText && !hasEdgeMedia;
  // Imagem/vídeo, ou áudio com caption: horário embaixo
  const metaBelow =
    hasEdgeMedia || (hasAudioMedia && hasLinkedText);
  const showSideMeta = !metaBelow && !audioMetaOverlay && buttons.length === 0;
  const showEmailBody =
    (showTextContent || canPreviewEmail) && !templateParts;
  const emailHeaderPad = out
    ? styles.contentPadText
    : styles.contentPadTextIn;

  return maybeHide(
    <>
    <BubbleShell
      out={out}
      theme={theme}
      pinned={pinned}
      onLongPress={handleLongPress}
      reactions={reactions}
      style={hasEdgeMedia ? styles.bubbleImage : undefined}>
      {/* Título do e-mail em largura total — ignora a coluna do horário. */}
      {emailSubject && !templateParts ? (
        <View style={[emailHeaderPad, styles.emailSubjectFull]}>
          {responseTo ? (
            <View
              style={[
                styles.quote,
                {
                  backgroundColor: out
                    ? 'rgba(255,255,255,0.14)'
                    : 'rgba(0,0,0,0.05)',
                  borderLeftColor: out ? '#BFDBFE' : brand.blue,
                },
              ]}>
              <Text
                style={[
                  styles.quoteText,
                  {
                    color: out
                      ? 'rgba(255,255,255,0.85)'
                      : theme.secondaryLabel,
                  },
                ]}
                numberOfLines={3}>
                {responseTo.content?.trim() ||
                  (responseTo.type ? String(responseTo.type) : '…')}
              </Text>
            </View>
          ) : null}
          <View style={styles.emailSubjectRow}>
            <Mail
              size={14}
              color={out ? 'rgba(255,255,255,0.75)' : theme.secondaryLabel}
              strokeWidth={2.2}
            />
            <Text
              style={[styles.emailSubject, {color: textColor}]}
              numberOfLines={1}
              ellipsizeMode="tail">
              {emailSubject}
            </Text>
          </View>
          {showEmailBody ? (
            <View
              style={[
                styles.emailDivider,
                {
                  borderTopColor: out
                    ? 'rgba(147, 197, 253, 0.45)'
                    : theme.border,
                },
              ]}
            />
          ) : showSideMeta ? (
            <View style={!out ? styles.customerMetaPadIn : undefined}>
              <MessageMeta
                item={item}
                out={out}
                theme={theme}
                placement="below"
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <BubbleContentRow
        textPad={!hasEdgeMedia && !hasAudioMedia}
        imagePad={hasEdgeMedia}
        out={out}
        meta={
          showSideMeta && !(emailSubject && !showEmailBody) ? (
            <MessageMeta item={item} out={out} theme={theme} />
          ) : null
        }>
        <View style={audioMetaOverlay ? styles.audioMetaHost : undefined}>
          {!emailSubject && responseTo ? (
            <View
              style={[
                styles.quote,
                hasEdgeMedia && styles.imageInnerPad,
                {
                  backgroundColor: out
                    ? 'rgba(255,255,255,0.14)'
                    : 'rgba(0,0,0,0.05)',
                  borderLeftColor: out ? '#BFDBFE' : brand.blue,
                },
              ]}>
              <Text
                style={[
                  styles.quoteText,
                  {
                    color: out
                      ? 'rgba(255,255,255,0.85)'
                      : theme.secondaryLabel,
                  },
                ]}
                numberOfLines={3}>
                {responseTo.content?.trim() ||
                  (responseTo.type ? String(responseTo.type) : '…')}
              </Text>
            </View>
          ) : null}

          {storyReply?.url ? (
            <InstagramStoryReplyCard
              url={storyReply.url}
              label={labels.storyReply}
              out={out}
              mutedColor={
                out ? 'rgba(255,255,255,0.85)' : theme.secondaryLabel
              }
              padded={hasEdgeMedia}
            />
          ) : null}

          {hasWhatsAppAd && externalAdReply ? (
            <WhatsAppAdMessage
              adReply={externalAdReply}
              out={out}
              sponsoredLabel={t.messages.sponsoredAd}
              viewAdLabel={t.messages.viewAd}
            />
          ) : null}

          {attachments.length > 0
            ? attachments.map((att, index) => (
                <View
                  key={`${item.id}-att-${index}`}
                  style={index > 0 ? styles.attGap : undefined}>
                  <AttachmentBlock
                    attachment={att}
                    messageType={type}
                    out={out}
                    theme={theme}
                    labels={labels}
                    isFileTooLarge={metadata.media_error === 'FILE_TOO_LARGE'}
                    fileName={
                      (typeof metadata.file_name === 'string' && metadata.file_name) ||
                      att.name ||
                      att.file_name ||
                      null
                    }
                  />
                </View>
              ))
            : ['image', 'video', 'document', 'sticker'].includes(type)
              ? (
                  <AttachmentBlock
                    attachment={{}}
                    messageType={type}
                    out={out}
                    theme={theme}
                    labels={labels}
                    isFileTooLarge={metadata.media_error === 'FILE_TOO_LARGE'}
                    fileName={
                      (typeof metadata.file_name === 'string' && metadata.file_name) ||
                      (typeof item.content === 'string' && item.content.trim()) ||
                      null
                    }
                  />
                )
              : null}

          {templateParts ? (
            <View style={styles.templateBlock}>
              {templateParts.header ? (
                <Text style={[styles.templateHeader, {color: textColor}]}>
                  {templateParts.header}
                </Text>
              ) : null}
              {templateParts.body ? (
                <MarkdownText
                  content={templateParts.body}
                  color={textColor}
                  linkColor={brand.blue}
                  style={styles.bubbleText}
                />
              ) : null}
              {templateParts.footer ? (
                <Text
                  style={[
                    styles.templateFooter,
                    {
                      color: out
                        ? 'rgba(255,255,255,0.7)'
                        : theme.tertiaryLabel,
                    },
                  ]}>
                  {templateParts.footer}
                </Text>
              ) : null}
            </View>
          ) : null}

          {showEmailBody ? (
            <View style={styles.emailBlock}>
              {showTextContent ? (
                <MarkdownText
                  content={item.content || ''}
                  color={textColor}
                  linkColor={brand.blue}
                  style={styles.bubbleText}
                />
              ) : null}
              {canPreviewEmail ? (
                <Pressable
                  onPress={() => setEmailPreviewOpen(true)}
                  style={({pressed}) => [
                    styles.emailPreviewBtn,
                    pressed && {opacity: 0.7},
                  ]}>
                  <Mail
                    size={13}
                    color={out ? 'rgba(191, 219, 254, 0.95)' : brand.blue}
                    strokeWidth={2.2}
                  />
                  <Text
                    style={[
                      styles.emailPreviewText,
                      {
                        color: out
                          ? 'rgba(191, 219, 254, 0.95)'
                          : brand.blue,
                      },
                    ]}>
                    {t.messages.viewFullEmail}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {caption && !showTextContent ? (
            <MarkdownText
              content={caption}
              color={textColor}
              linkColor={brand.blue}
              style={[
                styles.bubbleText,
                styles.contentAfterMedia,
                styles.imageInnerPad,
              ]}
            />
          ) : null}

          {!item.content &&
          !emailSubject &&
          !hasWhatsAppAd &&
          attachments.length === 0 &&
          !templateParts &&
          !['image', 'video', 'document', 'sticker', 'text'].includes(type) ? (
            <Text style={[styles.bubbleText, {color: textColor}]}>
              [{type}]
            </Text>
          ) : null}

          {audioMetaOverlay && buttons.length === 0 ? (
            <View
              style={[
                styles.audioMetaOverlay,
                !out && styles.audioMetaOverlayIn,
              ]}
              pointerEvents="none">
              <MessageMeta
                item={item}
                out={out}
                theme={theme}
                placement="overlay"
              />
            </View>
          ) : null}
        </View>

        {metaBelow && buttons.length === 0 ? (
          <View
            style={
              hasEdgeMedia
                ? out
                  ? styles.imageMetaPad
                  : styles.imageMetaPadIn
                : !out
                  ? styles.customerMetaPadIn
                  : undefined
            }>
            <MessageMeta
              item={item}
              out={out}
              theme={theme}
              placement="below"
            />
          </View>
        ) : null}
      </BubbleContentRow>

      {buttons.length > 0 ? (
        <>
          <MessageMeta
            item={item}
            out={out}
            theme={theme}
            placement="below"
          />
          <View
            style={[
              styles.buttonsFooter,
              {
                borderTopColor: out
                  ? theme.bubbleOutBorder
                  : theme.bubbleInBorder,
              },
            ]}>
            {buttons.map((btn, index) => (
              <View
                key={btn.id || `${item.id}-btn-${index}`}
                style={[
                  styles.buttonRow,
                  index < buttons.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth * 2,
                    borderBottomColor: out
                      ? theme.bubbleOutBorder
                      : theme.bubbleInBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.buttonText,
                    {color: brand.blue},
                  ]}>
                  {btn.title}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </BubbleShell>
    {canPreviewEmail ? (
      <EmailPreviewModal
        visible={emailPreviewOpen}
        onClose={() => setEmailPreviewOpen(false)}
        email={metadata as EmailMessageMetadata}
        chatId={item.chat_id}
        messageId={item.id}
      />
    ) : null}
    </>,
  );
});

const styles = StyleSheet.create({
  bubbleWrap: {marginBottom: 0, maxWidth: '78%'},
  bubbleWrapPinned: {
    maxWidth: '100%',
    width: '100%',
    marginBottom: 0,
    alignSelf: 'stretch',
  },
  bubbleWrapWithReactions: {marginBottom: 10},
  bubbleWrapOut: {alignSelf: 'flex-end'},
  bubbleWrapIn: {alignSelf: 'flex-start'},
  hiddenBubble: {opacity: 0},
  reactionsWrap: {
    position: 'absolute',
    bottom: -10,
    flexDirection: 'row',
    zIndex: 2,
  },
  reactionsOut: {right: 8},
  reactionsIn: {left: 8},
  reactionBadge: {
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  reactionOverlap: {marginLeft: -6},
  reactionBadgeText: {fontSize: 12},
  bubble: {
    // Borda mínima estilo WhatsApp
    padding: 2,
    overflow: 'hidden',
  },
  bubbleImage: {
    padding: 1,
  },
  bubbleOut: {
    borderRadius: radii.lg,
    borderBottomRightRadius: 6,
  },
  bubbleIn: {
    borderRadius: radii.lg,
    borderBottomLeftRadius: 6,
  },
  contentPad: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  // Texto agente: padding no lado oposto; horário fica colado no conteúdo
  contentPadText: {
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 5,
  },
  // Texto cliente: mais respiro à direita para o horário não colar na borda
  contentPadTextIn: {
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 5,
  },
  contentPadImage: {
    padding: 0,
  },
  imageInnerPad: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  imageMetaPad: {
    paddingHorizontal: 4,
    paddingBottom: 1,
  },
  // Cliente + imagem: horário bem afastado da borda
  imageMetaPadIn: {
    paddingLeft: 4,
    paddingRight: 14,
    paddingBottom: 2,
  },
  // Cliente (áudio/outros com meta embaixo)
  customerMetaPadIn: {
    paddingLeft: 4,
    paddingRight: 8,
    paddingBottom: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
  },
  contentMain: {
    flexShrink: 1,
    minWidth: 0,
  },
  metaColumn: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingLeft: 4,
  },
  metaBelow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
  },
  metaOverlay: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  audioMetaHost: {
    position: 'relative',
  },
  audioMetaOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 1,
  },
  audioMetaOverlayIn: {
    right: 8,
  },
  metaTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaTimeRowColumn: {
    marginBottom: -1,
  },
  bubbleText: {
    fontSize: typography.subhead,
    lineHeight: 19,
  },
  contentAfterMedia: {
    marginTop: 4,
  },
  // Radius interno acompanha a bolha (lg=16, pad imagem=1 → ~15; canto da cauda=6 → ~5)
  // width/height vêm de getConstrainedMediaSize (attachment.width/height)
  media: {
    borderRadius: radii.lg - 1,
    marginBottom: 0,
  },
  mediaOut: {
    borderBottomRightRadius: 5,
  },
  mediaIn: {
    borderBottomLeftRadius: 5,
  },
  mediaOutClip: {
    borderRadius: radii.lg - 1,
    borderBottomRightRadius: 5,
    overflow: 'hidden',
  },
  mediaInClip: {
    borderRadius: radii.lg - 1,
    borderBottomLeftRadius: 5,
    overflow: 'hidden',
  },
  videoPreview: {
    backgroundColor: '#0f172a',
  },
  videoPosterFallback: {
    backgroundColor: '#0f172a',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  videoPlayBtn: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  sticker: {
    marginBottom: 0,
  },
  locationThumb: {
    width: 220,
    height: 140,
  },
  mediaAction: {
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  mediaActionText: {
    fontSize: typography.subhead,
    fontWeight: '600',
    flexShrink: 1,
  },
  mediaAbsent: {
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: radii.md,
  },
  mediaAbsentText: {
    fontSize: typography.footnote,
  },
  mediaTooLarge: {
    minWidth: 180,
    maxWidth: 240,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  mediaTooLargeTextWrap: {
    flex: 1,
    gap: 2,
  },
  mediaTooLargeTitle: {
    fontSize: typography.footnote,
    fontWeight: '600',
  },
  mediaTooLargeFileName: {
    fontSize: typography.caption,
  },
  mediaTooLargeBody: {
    fontSize: typography.caption,
    lineHeight: 16,
  },
  mediaPressed: {
    opacity: 0.85,
  },
  docChip: {
    minWidth: 180,
    maxWidth: 240,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    gap: 4,
  },
  docName: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  docHint: {
    fontSize: typography.caption,
  },
  mapPlaceholder: {
    width: 220,
    height: 140,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  meta: {
    fontSize: 11,
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
  systemWrap: {
    alignItems: 'center',
    marginVertical: 0,
    paddingHorizontal: spacing.md,
  },
  systemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  systemAccentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  emailBlock: {
    gap: 6,
    minWidth: 0,
  },
  emailSubjectFull: {
    paddingBottom: 0,
    gap: 6,
  },
  emailSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  emailSubject: {
    flex: 1,
    minWidth: 0,
    fontSize: typography.subhead,
    fontWeight: '700',
    lineHeight: 18,
  },
  emailDivider: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    marginTop: 2,
    marginBottom: 0,
  },
  emailPreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 2,
  },
  emailPreviewText: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  stageWrap: {
    alignItems: 'center',
    marginVertical: 2,
    paddingHorizontal: spacing.md,
  },
  stageCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageFunnel: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stageBadge: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stageBadgeText: {
    fontSize: typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  stageNotes: {
    fontSize: typography.caption,
    lineHeight: 16,
  },
  contextWrap: {
    alignSelf: 'stretch',
    marginVertical: 0,
    paddingHorizontal: spacing.md,
  },
  contextCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 44,
  },
  contextCollapsedText: {
    flex: 1,
    fontSize: typography.footnote,
    fontWeight: '600',
    lineHeight: 18,
  },
  contextTime: {
    fontSize: typography.caption,
    flexShrink: 0,
  },
  contextSheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  contextSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  contextSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
  },
  contextSheetKnobWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  contextSheetKnob: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  contextSheetScroll: {
    flexGrow: 0,
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contextHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  contextHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  contextTitle: {
    fontSize: typography.footnote,
    fontWeight: '600',
  },
  contextTimeBadge: {
    fontSize: typography.caption,
  },
  contextDivider: {
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: 10,
  },
  contextBody: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    marginBottom: 4,
  },
  contextBodyText: {
    fontSize: typography.footnote,
    lineHeight: 20,
  },
  systemText: {
    fontSize: typography.caption,
    flexShrink: 1,
    textAlign: 'center',
  },
  systemTime: {
    fontSize: 10,
  },
  alertChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '92%',
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertText: {
    fontSize: typography.footnote,
    color: '#B45309',
    flexShrink: 1,
  },
  alertTime: {
    fontSize: 10,
    color: 'rgba(146, 64, 14, 0.7)',
  },
  privateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  privateLabel: {
    fontSize: typography.caption,
    fontWeight: '600',
    color: '#B45309',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 180,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  contactPhone: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 4,
  },
  quoteText: {
    fontSize: typography.caption,
    lineHeight: 16,
  },
  storyReplyCard: {
    gap: 6,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  storyReplyLabel: {
    fontSize: typography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  storyReplyMedia: {
    width: 108,
    height: 168,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  templateBlock: {
    gap: 2,
  },
  templateHeader: {
    fontSize: typography.subhead,
    fontWeight: '700',
  },
  templateFooter: {
    fontSize: typography.caption,
    fontStyle: 'italic',
  },
  buttonsFooter: {
    marginTop: 2,
    marginHorizontal: -2,
    marginBottom: -2,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  buttonRow: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  attGap: {
    marginTop: 4,
  },
});
