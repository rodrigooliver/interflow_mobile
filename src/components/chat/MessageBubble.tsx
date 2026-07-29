import React, {memo, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
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
  Video,
  User,
  Phone,
  Tag,
  MessageSquare,
  Ban,
  Lightbulb,
  ChevronRight,
  ChevronDown,
} from 'lucide-react-native';
import {useI18n} from '../../contexts/I18nContext';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import type {ChatMessage} from '../../services/chatsApi';
import {MarkdownText} from '../MarkdownText';
import {MessageStatusTicks} from '../MessageStatusTicks';
import {ImageViewerModal} from './ImageViewerModal';
import {ChatAudioPlayer} from './ChatAudioPlayer';
import {
  attachmentLabel,
  extractContactInfo,
  extractLocation,
  formatMessageTime,
  getAttachments,
  getInteractiveButtons,
  getMetadata,
  getSystemEventLabel,
  isAudioAttachment,
  isImageAttachment,
  isOutgoing,
  isSystemEvent,
  isVideoAttachment,
  parseTemplateParts,
  type MessageAnchor,
  type MessageAttachment,
} from './messageHelpers';

export type BubbleTheme = {
  bubbleOut: string;
  bubbleIn: string;
  bubbleOutText: string;
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
  onLongPress?: (message: ChatMessage, anchor: MessageAnchor) => void;
};

function openUrl(url?: string | null) {
  if (!url) return;
  void Linking.openURL(url).catch(() => undefined);
}

function ImageAttachmentPreview({
  url,
  isSticker,
  out,
}: {
  url: string;
  isSticker: boolean;
  out?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setViewerOpen(true)}
        accessibilityRole="imagebutton"
        style={!isSticker && (out ? styles.mediaOutClip : styles.mediaInClip)}>
        <Image
          source={{uri: url}}
          style={
            isSticker
              ? styles.sticker
              : [styles.media, out ? styles.mediaOut : styles.mediaIn]
          }
          resizeMode={isSticker ? 'contain' : 'cover'}
        />
      </Pressable>
      <ImageViewerModal
        visible={viewerOpen}
        uri={url}
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
      ? 'rgba(255,255,255,0.75)'
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
            mutedColor="rgba(255,255,255,0.75)"
            readColor="#FFFFFF"
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

function SystemChip({
  label,
  time,
  icon,
  theme,
  variant = 'default',
  onLongPress,
}: {
  label: string;
  time: string;
  icon?: React.ReactNode;
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
}: {
  attachment: MessageAttachment;
  messageType?: string | null;
  out: boolean;
  theme: BubbleTheme;
  labels: {openAudio: string; openVideo: string; openFile: string; mediaAbsent: string};
}) {
  const url = attachment.url || attachment.preview_url;
  const textColor = out ? theme.bubbleOutText : theme.bubbleInText;
  const muted = out ? 'rgba(255,255,255,0.75)' : theme.tertiaryLabel;
  const type = (messageType || attachment.type || '').toLowerCase();

  if (!url) {
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
      />
    );
  }

  if (type === 'video' || isVideoAttachment(attachment)) {
    return (
      <TouchableOpacity
        style={[styles.mediaAction, {backgroundColor: out ? 'rgba(255,255,255,0.12)' : theme.fill}]}
        onPress={() => openUrl(url)}
        activeOpacity={0.8}>
        <Video size={22} color={textColor} />
        <Text style={[styles.mediaActionText, {color: textColor}]}>
          {labels.openVideo}
        </Text>
      </TouchableOpacity>
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
      />
    );
  }

  return (
    <TouchableOpacity
      style={[styles.docChip, {backgroundColor: out ? 'rgba(255,255,255,0.12)' : theme.fill}]}
      onPress={() => openUrl(url)}
      activeOpacity={0.8}>
      <FileText size={18} color={textColor} />
      <Text
        style={[styles.docName, {color: textColor}]}
        numberOfLines={2}>
        {attachmentLabel(attachment)}
      </Text>
      <Text style={[styles.docHint, {color: muted}]}>{labels.openFile}</Text>
    </TouchableOpacity>
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
      ? 'transparent'
      : theme.bubbleInBorder;

  const hasReactions = reactions && Object.keys(reactions).length > 0;

  const playLongPressFeedback = () => {
    hapticLongPress();
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress?.({x, y, width, height});
    });
  };

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
      delayLongPress={320}>
      <View
        style={[
          styles.bubble,
          out || privateNote ? styles.bubbleOut : styles.bubbleIn,
          {
            backgroundColor: bg,
            borderColor,
            borderWidth:
              out && !privateNote ? 0 : StyleSheet.hairlineWidth * 2,
          },
          style,
        ]}>
        {children}
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
  onLongPress,
}: Props) {
  const {t} = useI18n();
  const out = isOutgoing(item);
  const type = item.type || 'text';
  const metadata = getMetadata(item);
  const attachments = getAttachments(item);
  const textColor = out ? theme.bubbleOutText : theme.bubbleInText;
  const time = formatMessageTime(item.created_at);

  const handleLongPress = onLongPress
    ? (anchor: MessageAnchor) => onLongPress(item, anchor)
    : undefined;
  const reactions = (metadata.reactions || null) as
    | Record<string, {reaction?: string} | string>
    | null;

  const labels = useMemo(
    () => ({
      userStart: t.messages.userStart,
      userStartAuto: t.messages.userStartAuto,
      autoAssigned: t.messages.autoAssigned,
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
      tagRemoved: t.messages.tagRemoved,
      stageUpdate: t.messages.stageUpdate,
      task: t.messages.task,
      info: t.messages.info,
      privateNote: t.messages.privateNote,
      mediaAbsent: t.messages.mediaAbsent,
      openAudio: t.messages.openAudio,
      openVideo: t.messages.openVideo,
      openMap: t.messages.openMap,
      openFile: t.messages.openFile,
      location: t.messages.location,
      contact: t.messages.contact,
      deleted: t.messages.deleted,
      template: t.messages.template,
    }),
    [t],
  );

  const maybeHide = (node: React.ReactElement) =>
    hidden ? (
      <View style={styles.hiddenBubble} pointerEvents="none">
        {node}
      </View>
    ) : (
      node
    );

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

  if (
    isSystemEvent(item) ||
    type === 'call_received' ||
    type === 'tag_added' ||
    type === 'tag_removed' ||
    type === 'task' ||
    type === 'stage_update'
  ) {
    const label = getSystemEventLabel(item, labels);
    const iconColor = theme.secondaryLabel;
    let icon: React.ReactNode = null;
    if (type === 'call_received') {
      icon = <Phone size={14} color={iconColor} />;
    } else if (type === 'tag_added' || type === 'tag_removed') {
      icon = <Tag size={14} color={iconColor} />;
    }
    return maybeHide(
      <SystemChip
        label={label}
        time={time}
        icon={icon}
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
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openUrl(mapsUrl)}
            disabled={!mapsUrl}>
            {thumb ? (
              <Image
                source={{uri: thumb}}
                style={styles.media}
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
          </TouchableOpacity>
          {(location?.name || location?.address || item.content) && (
            <MarkdownText
              content={
                [location?.name, location?.address, item.content]
                  .filter(Boolean)
                  .join('\n') || ''
              }
              color={textColor}
              linkColor={out ? '#BFDBFE' : brand.blue}
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
                linkColor={out ? '#BFDBFE' : brand.blue}
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
    type !== 'sticker';

  // Imagem/sticker sem texto ainda mostra caption se houver
  const caption =
    (type === 'image' || type === 'sticker' || type === 'video' || type === 'document') &&
    item.content
      ? item.content
      : null;

  const hasImageMedia =
    type === 'image' ||
    type === 'sticker' ||
    attachments.some(att => isImageAttachment(att));
  const hasAudioMedia =
    type === 'audio' || attachments.some(att => isAudioAttachment(att));
  const hasLinkedText = !!item.content?.trim();
  // Áudio sem texto: horário sobreposto no player (play centralizado)
  const audioMetaOverlay = hasAudioMedia && !hasLinkedText && !hasImageMedia;
  // Imagem, ou áudio com caption: horário embaixo
  const metaBelow =
    hasImageMedia || (hasAudioMedia && hasLinkedText);
  const showSideMeta = !metaBelow && !audioMetaOverlay && buttons.length === 0;

  return maybeHide(
    <BubbleShell
      out={out}
      theme={theme}
      pinned={pinned}
      onLongPress={handleLongPress}
      reactions={reactions}
      style={hasImageMedia ? styles.bubbleImage : undefined}>
      <BubbleContentRow
        textPad={!hasImageMedia && !hasAudioMedia}
        imagePad={hasImageMedia}
        out={out}
        meta={
          showSideMeta ? (
            <MessageMeta item={item} out={out} theme={theme} />
          ) : null
        }>
        <View style={audioMetaOverlay ? styles.audioMetaHost : undefined}>
          {responseTo ? (
            <View
              style={[
                styles.quote,
                hasImageMedia && styles.imageInnerPad,
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
                  linkColor={out ? '#BFDBFE' : brand.blue}
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

          {showTextContent ? (
            <MarkdownText
              content={item.content || ''}
              color={textColor}
              linkColor={out ? '#BFDBFE' : brand.blue}
              style={styles.bubbleText}
            />
          ) : null}

          {caption && !showTextContent ? (
            <MarkdownText
              content={caption}
              color={textColor}
              linkColor={out ? '#BFDBFE' : brand.blue}
              style={[
                styles.bubbleText,
                styles.contentAfterMedia,
                styles.imageInnerPad,
              ]}
            />
          ) : null}

          {!item.content &&
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
              hasImageMedia
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
                  ? 'rgba(255,255,255,0.25)'
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
                      ? 'rgba(255,255,255,0.2)'
                      : theme.bubbleInBorder,
                  },
                ]}>
                <Text
                  style={[
                    styles.buttonText,
                    {color: out ? '#BFDBFE' : brand.blue},
                  ]}>
                  {btn.title}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </BubbleShell>,
  );
});

const styles = StyleSheet.create({
  bubbleWrap: {marginBottom: 4, maxWidth: '78%'},
  bubbleWrapPinned: {
    maxWidth: '100%',
    width: '100%',
    marginBottom: 0,
    alignSelf: 'stretch',
  },
  bubbleWrapWithReactions: {marginBottom: 12},
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
  media: {
    width: 220,
    height: 160,
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
  sticker: {
    width: 140,
    height: 140,
    marginBottom: 0,
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
    marginVertical: 6,
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
  contextWrap: {
    alignSelf: 'stretch',
    marginVertical: 6,
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
