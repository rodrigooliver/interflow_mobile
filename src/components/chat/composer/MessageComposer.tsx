import React, {useCallback, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  type GestureResponderEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Plus,
  Sparkles,
  Mic,
  ArrowUp,
  X,
  FileText,
  Trash2,
  Lock,
  Pause,
  Play,
} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useI18n} from '../../../contexts/I18nContext';
import {
  brand,
  glassShadow,
  radii,
  spacing,
  typography,
} from '../../../theme/tokens';
import type {ChatMessage} from '../../../services/chatsApi';
import {sendChatMessage} from '../../../services/chatsApi';
import type {ChannelFeatures} from '../../../utils/channelFeatures';
import {getFetchErrorKind} from '../../../utils/networkError';
import {ComposerAttachSheet} from './ComposerAttachSheet';
import {VoiceRecorderOverlay} from './VoiceRecorderOverlay';
import {AIImproveSheet} from './AIImproveSheet';
import {useComposerAttachments} from './useComposerAttachments';
import {useVoiceRecorder} from './useVoiceRecorder';

export const COMPOSER_LIST_PAD = 120;

type Props = {
  chatId: string;
  organizationId: string;
  channelFeatures: ChannelFeatures;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onSent?: () => void;
  /** Altura do teclado (controlada pela screen para subir lista + composer juntos). */
  keyboardHeight?: number;
};

export function MessageComposer({
  chatId,
  organizationId,
  channelFeatures,
  replyTo,
  onClearReply,
  onSent,
  keyboardHeight = 0,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const {
    attachments,
    removeAttachment,
    clearAttachments,
    restoreAttachments,
    pickFromGallery,
    pickFromCamera,
    pickFromFiles,
  } = useComposerAttachments();

  const voice = useVoiceRecorder();

  const canSend =
    (text.trim().length > 0 || attachments.length > 0) && !sending;
  const showMic =
    channelFeatures.canSendAudio &&
    !text.trim() &&
    attachments.length === 0 &&
    !sending;

  const keyboardOpen = keyboardHeight > 0;
  // Screen usa edges top-only; composer cuida do safe area quando teclado fechado
  const bottomPad = keyboardOpen
    ? spacing.sm
    : Math.max(insets.bottom, spacing.sm);
  const shellBottom = keyboardHeight;

  const sendErrorAlert = useCallback(
    (e: unknown) => {
      const kind = getFetchErrorKind(e);
      Alert.alert(
        kind === 'network' ? t.errors.networkTitle : t.thread.errorTitle,
        kind === 'network' ? t.errors.networkMessage : t.composer.sendError,
      );
    },
    [t],
  );

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if ((!content && !attachments.length) || !organizationId || sending) {
      return;
    }
    setSending(true);
    const replyId = replyTo?.id;
    const snapshotText = content;
    const snapshotAttachments = [...attachments];
    setText('');
    clearAttachments();
    onClearReply();
    try {
      await sendChatMessage(chatId, content, organizationId, {
        replyToMessageId: replyId,
        type: content ? 'text' : 'file',
        attachments: snapshotAttachments.map(a => ({
          uri: a.uri,
          type: a.type,
          name: a.name,
        })),
      });
      onSent?.();
    } catch (e) {
      console.error('[MessageComposer] send failed', e);
      setText(snapshotText);
      restoreAttachments(snapshotAttachments);
      sendErrorAlert(e);
    } finally {
      setSending(false);
    }
  }, [
    text,
    attachments,
    organizationId,
    sending,
    replyTo?.id,
    clearAttachments,
    restoreAttachments,
    onClearReply,
    chatId,
    onSent,
    sendErrorAlert,
  ]);

  const finishVoice = useCallback(
    async (cancelled: boolean) => {
      if (cancelled) {
        await voice.cancel();
        return;
      }
      const result = await voice.stop();
      if (!result || !organizationId) return;
      setSending(true);
      const replyId = replyTo?.id;
      onClearReply();
      try {
        const name = `audio_${Date.now()}.m4a`;
        await sendChatMessage(chatId, '', organizationId, {
          replyToMessageId: replyId,
          type: 'audio',
          attachments: [
            {
              uri: result.uri,
              type: 'audio/mp4',
              name,
            },
          ],
        });
        onSent?.();
      } catch (e) {
        console.error('[MessageComposer] audio send failed', e);
        sendErrorAlert(e);
      } finally {
        setSending(false);
      }
    },
    [
      voice,
      organizationId,
      replyTo?.id,
      onClearReply,
      chatId,
      onSent,
      sendErrorAlert,
    ],
  );

  // Refs estáveis — re-renders do waveform não recriam o responder do mic
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const finishVoiceRef = useRef(finishVoice);
  finishVoiceRef.current = finishVoice;

  const onMicGrant = useCallback(async (e: GestureResponderEvent) => {
    if (voiceRef.current.locked) return;
    voiceRef.current.onTouchStart(e.nativeEvent.pageX, e.nativeEvent.pageY);
    try {
      await voiceRef.current.start();
    } catch {
      Alert.alert(t.thread.errorTitle, t.composer.micPermission);
    }
  }, [t.thread.errorTitle, t.composer.micPermission]);

  const onMicMove = useCallback((e: GestureResponderEvent) => {
    if (voiceRef.current.locked) return;
    voiceRef.current.onTouchMove(e.nativeEvent.pageX, e.nativeEvent.pageY);
  }, []);

  const onMicRelease = useCallback(async () => {
    const v = voiceRef.current;
    if (!v.recording || v.locked) return;
    const action = v.resolveReleaseAction();
    if (action === 'ignore') return;
    if (action === 'lock') {
      v.lock();
      return;
    }
    await finishVoiceRef.current(action === 'cancel');
  }, []);

  const shellStyle = useMemo(
    () => [
      styles.shell,
      {
        bottom: shellBottom,
        paddingBottom: bottomPad,
      },
    ],
    [shellBottom, bottomPad],
  );

  return (
    <View style={shellStyle} pointerEvents="box-none">
      {replyTo ? (
        <View
          style={[
            styles.replyBar,
            glassShadow(mode),
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          <View style={[styles.replyAccent, {backgroundColor: brand.blue}]} />
          <View style={styles.replyBody}>
            <Text style={[styles.replyLabel, {color: brand.blue}]}>
              {t.messageActions.replyingTo}
            </Text>
            <Text
              style={[styles.replyPreview, {color: theme.secondaryLabel}]}
              numberOfLines={1}>
              {replyTo.content?.trim() || `[${replyTo.type || 'message'}]`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClearReply}
            hitSlop={10}
            style={styles.replyClose}>
            <X size={18} color={theme.tertiaryLabel} />
          </TouchableOpacity>
        </View>
      ) : null}

      {attachments.length > 0 ? (
        <View
          style={[
            styles.attachRow,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          {attachments.map(att => (
            <View
              key={att.id}
              style={[styles.attachChip, {borderColor: theme.border}]}>
              {att.kind === 'image' ? (
                <Image source={{uri: att.uri}} style={styles.attachThumb} />
              ) : (
                <View
                  style={[
                    styles.attachFile,
                    {backgroundColor: theme.fill},
                  ]}>
                  <FileText size={16} color={brand.blue} />
                </View>
              )}
              <TouchableOpacity
                style={styles.attachRemove}
                onPress={() => removeAttachment(att.id)}
                hitSlop={8}>
                <X size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={[
          styles.card,
          glassShadow(mode),
          {backgroundColor: theme.card, borderColor: theme.border},
        ]}>
        {voice.recording ? (
          <VoiceRecorderOverlay
            subscribeMetering={voice.subscribeMetering}
            formatDuration={voice.formatDuration}
            slideOffset={voice.slideOffset}
            cancelArmed={voice.cancelArmed}
            lockArmed={voice.lockArmed}
            locked={voice.locked}
            paused={voice.paused}
          />
        ) : (
          <TextInput
            style={[
              styles.input,
              {backgroundColor: theme.inputBg, color: theme.label},
            ]}
            placeholder={t.thread.placeholder}
            placeholderTextColor={theme.tertiaryLabel}
            value={text}
            onChangeText={setText}
            multiline
            editable={!sending}
          />
        )}
        <View style={styles.toolbar}>
          {!voice.recording ? (
            <View style={styles.toolbarLeft}>
              <TouchableOpacity
                onPress={() => setAttachOpen(true)}
                style={[
                  styles.iconBtn,
                  {backgroundColor: theme.fill, borderColor: theme.border},
                ]}
                disabled={sending}>
                <Plus size={18} color={theme.secondaryLabel} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAiOpen(true)}
                style={[
                  styles.iconBtn,
                  {backgroundColor: theme.fill, borderColor: theme.border},
                ]}
                disabled={sending}>
                <Sparkles size={16} color={brand.blue} />
              </TouchableOpacity>
            </View>
          ) : voice.locked ? (
            <View style={styles.lockedBar}>
              <TouchableOpacity
                onPress={() => void finishVoice(true)}
                style={[
                  styles.iconBtn,
                  {
                    backgroundColor: 'rgba(239,68,68,0.12)',
                    borderColor: '#EF4444',
                  },
                ]}
                disabled={sending}>
                <Trash2 size={16} color="#EF4444" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void voice.togglePause()}
                style={[
                  styles.pauseBtn,
                  {
                    borderColor: '#EF4444',
                    backgroundColor: voice.paused
                      ? 'rgba(239,68,68,0.12)'
                      : 'transparent',
                  },
                ]}
                disabled={sending}>
                {voice.paused ? (
                  <Play size={18} color="#EF4444" fill="#EF4444" />
                ) : (
                  <Pause size={18} color="#EF4444" fill="#EF4444" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.send, {backgroundColor: brand.blue}]}
                onPress={() => void finishVoice(false)}
                disabled={sending}>
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <ArrowUp size={18} color="#fff" strokeWidth={2.5} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.toolbarLeft} />
          )}

          {voice.locked ? null : showMic || voice.recording ? (
            <View style={styles.micWrap}>
              {voice.recording && !voice.cancelArmed ? (
                <View
                  style={[
                    styles.lockHint,
                    {
                      backgroundColor: voice.lockArmed
                        ? brand.blue
                        : theme.card,
                      borderColor: voice.lockArmed
                        ? brand.blue
                        : theme.border,
                      transform: [
                        {
                          translateY: Math.max(
                            -voice.lockThreshold,
                            voice.slideUp,
                          ),
                        },
                      ],
                    },
                  ]}
                  pointerEvents="none">
                  <Lock
                    size={14}
                    color={voice.lockArmed ? '#fff' : theme.secondaryLabel}
                  />
                </View>
              ) : null}
              <View
                style={[
                  styles.send,
                  {
                    backgroundColor: voice.cancelArmed
                      ? '#EF4444'
                      : voice.lockArmed
                        ? brand.bluePressed
                        : brand.blue,
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={onMicGrant}
                onResponderMove={onMicMove}
                onResponderRelease={onMicRelease}
                onResponderTerminate={onMicRelease}>
                {voice.lockArmed ? (
                  <Lock size={18} color="#fff" />
                ) : (
                  <Mic size={18} color="#fff" />
                )}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.send,
                {
                  backgroundColor: canSend ? brand.blue : theme.fill,
                },
              ]}
              onPress={handleSend}
              disabled={!canSend}>
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ArrowUp
                  size={18}
                  color={canSend ? '#fff' : theme.tertiaryLabel}
                  strokeWidth={2.5}
                />
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ComposerAttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPickGallery={pickFromGallery}
        onPickCamera={pickFromCamera}
        onPickFiles={pickFromFiles}
      />

      <AIImproveSheet
        visible={aiOpen}
        text={text}
        chatId={chatId}
        organizationId={organizationId}
        onClose={() => setAiOpen(false)}
        onApply={improved => setText(improved)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 8,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    paddingRight: 8,
  },
  replyAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  replyBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 0,
  },
  replyLabel: {
    fontSize: typography.caption,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyPreview: {
    fontSize: typography.footnote,
  },
  replyClose: {
    padding: 6,
  },
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  attachChip: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  attachThumb: {
    width: '100%',
    height: '100%',
  },
  attachFile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 8,
    overflow: 'visible',
    zIndex: 2,
  },
  input: {
    minHeight: 36,
    maxHeight: 120,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: typography.subhead,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'visible',
    zIndex: 3,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockedBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pauseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  lockHint: {
    position: 'absolute',
    bottom: 44,
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
