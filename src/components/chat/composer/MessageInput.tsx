import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
  type GestureResponderEvent,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BlurView} from '@react-native-community/blur';
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
  CalendarClock,
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
import {sendMessageSequence} from '../../../services/chatActions';
import type {ChannelFeatures} from '../../../utils/channelFeatures';
import {getFetchErrorKind} from '../../../utils/networkError';
import {
  fetchMessageShortcuts,
  isSequenceShortcut,
  normalizeShortcutSteps,
  replaceVariables,
  type MessageShortcut,
  type ReplaceVariablesContext,
} from '../../../utils/messageShortcuts';
import {ComposerAttachSheet} from './ComposerAttachSheet';
import {VoiceRecorderOverlay} from './VoiceRecorderOverlay';
import {AIImproveBar} from './AIImproveBar';
import {useComposerAttachments} from './useComposerAttachments';
import {useVoiceRecorder} from './useVoiceRecorder';

/** Altura típica da pill (~52) + padding do shell — sem safe-area (somada na screen). */
export const COMPOSER_LIST_PAD = 80;

/** ~2 linhas (lineHeight 20 + paddings) — evita minHeight travar expandido. */
const TWO_LINES_MIN = 48;

/** Texto longo sem \\n (ex.: stream da IA) — expandir mesmo se contentSize não disparar. */
const LONG_TEXT_EXPAND = 40;

function shouldExpandInput(value: string, contentHeight?: number) {
  if (!value) return false;
  if (value.includes('\n')) return true;
  if (value.length >= LONG_TEXT_EXPAND) return true;
  // Soft-wrap real (2+ linhas). Não usar limiar baixo: padding/minHeight enganam.
  if (contentHeight != null && contentHeight >= TWO_LINES_MIN) return true;
  return false;
}

type Props = {
  chatId: string;
  organizationId: string;
  channelFeatures: ChannelFeatures;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  onSent?: () => void;
  /** Altura do teclado (controlada pela screen para subir lista + composer juntos). */
  keyboardHeight?: number;
  /** Altura real do composer (pill + IA + reply…) para padding da lista. */
  onHeightChange?: (height: number) => void;
  /** Contexto para variáveis de atalho `/`. */
  variableContext?: ReplaceVariablesContext;
};

export function MessageInput({
  chatId,
  organizationId,
  channelFeatures,
  replyTo,
  onClearReply,
  onSent,
  keyboardHeight = 0,
  onHeightChange,
  variableContext,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t} = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiSnapshot, setAiSnapshot] = useState('');
  const [multiline, setMultiline] = useState(false);
  const [shortcuts, setShortcuts] = useState<MessageShortcut[]>([]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  const inputScrollRef = useRef<ScrollView>(null);
  const scrollRafRef = useRef<number | null>(null);
  const heightReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  useEffect(() => {
    if (!organizationId) return;
    void fetchMessageShortcuts(organizationId)
      .then(setShortcuts)
      .catch(() => setShortcuts([]));
  }, [organizationId]);

  const filteredShortcuts = useMemo(() => {
    if (!showShortcuts) return [];
    const q = text.startsWith('/') ? text.slice(1).trim().toLowerCase() : '';
    return shortcuts
      .filter(s => {
        const title = (s.title || '').toLowerCase();
        return !q || title.includes(q);
      })
      .slice(0, 8);
  }, [showShortcuts, text, shortcuts]);

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

  const parseScheduledFor = useCallback((): string | false | undefined => {
    if (!scheduleMode) return undefined;
    const raw = scheduleDraft.trim();
    if (!raw) return false;
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) {
      Alert.alert(
        t.thread.errorTitle,
        'Data inválida. Use AAAA-MM-DD HH:mm',
      );
      return false;
    }
    if (d.getTime() <= Date.now()) {
      Alert.alert(t.thread.errorTitle, 'Agende uma data futura');
      return false;
    }
    return d.toISOString();
  }, [scheduleMode, scheduleDraft, t.thread.errorTitle]);

  const applyShortcut = useCallback(
    async (shortcut: MessageShortcut) => {
      const steps = normalizeShortcutSteps(shortcut);
      setShowShortcuts(false);
      if (isSequenceShortcut(steps)) {
        if (!organizationId || sending) return;
        setSending(true);
        setText('');
        try {
          await sendMessageSequence(organizationId, chatId, {
            steps: steps.map(step => ({
              content: replaceVariables(step.content, variableContext),
              delay_after_ms: step.delay_after_ms,
              sign_message: step.sign_message,
              attachments: step.attachments || [],
            })),
          });
          onSent?.();
        } catch (e) {
          sendErrorAlert(e);
        } finally {
          setSending(false);
        }
        return;
      }
      const content = replaceVariables(steps[0]?.content || '', variableContext);
      setText(content);
      setMultiline(shouldExpandInput(content));
    },
    [
      organizationId,
      sending,
      chatId,
      variableContext,
      onSent,
      sendErrorAlert,
    ],
  );

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if ((!content && !attachments.length) || !organizationId || sending) {
      return;
    }
    let scheduledFor: string | undefined;
    if (scheduleMode) {
      const parsed = parseScheduledFor();
      if (parsed === false || parsed === undefined) return;
      scheduledFor = parsed;
    }

    setSending(true);
    const replyId = replyTo?.id;
    const snapshotText = content;
    const snapshotAttachments = [...attachments];
    setText('');
    setMultiline(false);
    setShowShortcuts(false);
    clearAttachments();
    onClearReply();
    try {
      await sendChatMessage(chatId, content, organizationId, {
        replyToMessageId: replyId,
        type: content ? 'text' : 'file',
        scheduledFor,
        attachments: snapshotAttachments.map(a => ({
          uri: a.uri,
          type: a.type,
          name: a.name,
        })),
      });
      if (scheduleMode) {
        setScheduleMode(false);
        setScheduleDraft('');
        Alert.alert('Agendado', 'Mensagem agendada com sucesso');
      }
      onSent?.();
    } catch (e) {
      console.error('[MessageInput] send failed', e);
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
    scheduleMode,
    parseScheduledFor,
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
        console.error('[MessageInput] audio send failed', e);
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

  const textRef = useRef(text);
  textRef.current = text;
  const aiModeRef = useRef(aiMode);
  aiModeRef.current = aiMode;
  const aiStreamingRef = useRef(aiStreaming);
  aiStreamingRef.current = aiStreaming;

  // Um scroll por frame — evita “pulo” a cada chunk
  const scheduleScrollToEnd = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      inputScrollRef.current?.scrollToEnd({animated: false});
    });
  }, []);

  const onInputContentSizeChange = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const h = e.nativeEvent.contentSize.height;
      // Dinâmico: expande e recolhe conforme a altura real do texto
      setMultiline(shouldExpandInput(textRef.current, h));
      if (aiStreamingRef.current || aiModeRef.current) {
        scheduleScrollToEnd();
      }
    },
    [scheduleScrollToEnd],
  );

  const handleChangeText = useCallback(
    (next: string) => {
      setText(next);
      setShowShortcuts(next.startsWith('/'));
      // Dinâmico: ao apagar e voltar a 1 linha, recentraliza
      setMultiline(shouldExpandInput(next));
      if (
        (aiStreamingRef.current || aiModeRef.current) &&
        shouldExpandInput(next)
      ) {
        scheduleScrollToEnd();
      }
    },
    [scheduleScrollToEnd],
  );

  const openAiMode = useCallback(() => {
    setAiSnapshot(text);
    setAiMode(true);
    // Só expande se o texto atual já precisar — não antecipar altura vazia
    setMultiline(shouldExpandInput(text));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [text]);

  const closeAiMode = useCallback(() => {
    setAiMode(false);
    setAiStreaming(false);
    setAiSnapshot('');
  }, []);

  const undoAi = useCallback(() => {
    setText(aiSnapshot);
    setMultiline(shouldExpandInput(aiSnapshot));
  }, [aiSnapshot]);

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

  const lastHeightRef = useRef(0);
  const handleShellLayout = useCallback(
    (e: {nativeEvent: {layout: {height: number}}}) => {
      const h = Math.ceil(e.nativeEvent.layout.height);
      if (h <= 0 || h === lastHeightRef.current) return;
      lastHeightRef.current = h;
      // Durante o stream a altura do input fica fixa — não martela a lista
      if (aiStreamingRef.current) {
        if (heightReportTimerRef.current) {
          clearTimeout(heightReportTimerRef.current);
        }
        heightReportTimerRef.current = setTimeout(() => {
          onHeightChange?.(h);
        }, 120);
        return;
      }
      onHeightChange?.(h);
    },
    [onHeightChange],
  );

  // Expandir só pelo conteúdo real — não por aiMode/streaming (evita saltar ao clicar na ação)
  const pillExpanded = multiline || text.includes('\n');
  const inputExpanded = pillExpanded;
  const pillRadius = inputExpanded ? 22 : 26;
  const pillBlurType =
    Platform.OS === 'ios'
      ? mode === 'dark'
        ? 'chromeMaterialDark'
        : 'chromeMaterialLight'
      : mode === 'dark'
        ? 'dark'
        : 'xlight';
  const pillGlassTint = voice.cancelArmed
    ? 'rgba(239,68,68,0.14)'
    : mode === 'dark'
      ? 'rgba(15,23,42,0.28)'
      : 'rgba(255,255,255,0.48)';

  return (
    <View
      style={shellStyle}
      pointerEvents="box-none"
      onLayout={handleShellLayout}>
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

      {showShortcuts && filteredShortcuts.length > 0 ? (
        <View
          style={[
            styles.shortcutsBox,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          {filteredShortcuts.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.shortcutRow, {borderBottomColor: theme.separator}]}
              onPress={() => void applyShortcut(item)}>
              <Text style={[styles.shortcutTitle, {color: theme.label}]} numberOfLines={1}>
                /{item.title}
              </Text>
              <Text
                style={[styles.shortcutPreview, {color: theme.tertiaryLabel}]}
                numberOfLines={1}>
                {replaceVariables(
                  normalizeShortcutSteps(item)[0]?.content || '',
                  variableContext,
                )}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {scheduleMode ? (
        <View
          style={[
            styles.scheduleBar,
            {backgroundColor: theme.card, borderColor: theme.border},
          ]}>
          <CalendarClock size={16} color={brand.blue} />
          <TextInput
            style={[styles.scheduleInput, {color: theme.label}]}
            placeholder="AAAA-MM-DD HH:mm"
            placeholderTextColor={theme.tertiaryLabel}
            value={scheduleDraft}
            onChangeText={setScheduleDraft}
          />
          <TouchableOpacity
            onPress={() => {
              setScheduleMode(false);
              setScheduleDraft('');
            }}
            hitSlop={8}>
            <X size={16} color={theme.tertiaryLabel} />
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

      <AIImproveBar
        visible={aiMode}
        text={text}
        chatId={chatId}
        organizationId={organizationId}
        snapshot={aiSnapshot}
        onTextChange={handleChangeText}
        onAccept={closeAiMode}
        onUndo={undoAi}
        onDismiss={() => {
          undoAi();
          closeAiMode();
        }}
        onStreamingChange={streaming => {
          setAiStreaming(streaming);
          if (streaming) {
            requestAnimationFrame(() => inputRef.current?.focus());
          }
        }}
        onKeepFocus={() => inputRef.current?.focus()}
      />

      {/* Flutuante acima do input — só com teclado aberto */}
      {keyboardOpen && !voice.recording && !voice.locked && !aiMode ? (
        <View style={styles.aiFloatRow} pointerEvents="box-none">
          <TouchableOpacity
            style={[
              styles.aiFloatBtn,
              glassShadow(mode),
              {
                backgroundColor: scheduleMode
                  ? brand.blueSoft
                  : mode === 'dark'
                    ? 'rgba(15,23,42,0.72)'
                    : 'rgba(255,255,255,0.92)',
                borderColor: theme.border,
              },
            ]}
            onPress={() => setScheduleMode(v => !v)}
            disabled={sending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Agendar mensagem">
            <CalendarClock
              size={18}
              color={scheduleMode ? brand.blue : theme.secondaryLabel}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.aiFloatBtn,
              glassShadow(mode),
              {
                backgroundColor:
                  mode === 'dark'
                    ? 'rgba(15,23,42,0.72)'
                    : 'rgba(255,255,255,0.92)',
                borderColor: theme.border,
              },
            ]}
            onPress={openAiMode}
            disabled={sending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t.composer.aiImprove}>
            <Sparkles size={18} color={brand.blue} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View
        style={[
          styles.pillShadow,
          glassShadow(mode),
          {borderRadius: pillRadius},
        ]}>
        <View
          style={[
            styles.pill,
            pillExpanded && styles.pillMultiline,
            {
              borderColor: voice.cancelArmed ? '#EF4444' : theme.border,
              borderRadius: pillRadius,
            },
          ]}
          collapsable={false}>
          <BlurView
            style={[StyleSheet.absoluteFill, {borderRadius: pillRadius}]}
            blurType={pillBlurType}
            blurAmount={Platform.OS === 'ios' ? 10 : 8}
            {...(Platform.OS === 'android'
              ? {
                  overlayColor: pillGlassTint,
                  downsampleFactor: 5,
                }
              : {})}
            reducedTransparencyFallbackColor={
              voice.cancelArmed
                ? mode === 'dark'
                  ? 'rgba(127,29,29,0.85)'
                  : 'rgba(254,242,242,0.92)'
                : mode === 'dark'
                  ? 'rgba(15,23,42,0.88)'
                  : 'rgba(255,255,255,0.88)'
            }
          />
          {Platform.OS === 'ios' ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: pillRadius,
                  backgroundColor: pillGlassTint,
                },
              ]}
            />
          ) : null}
          {voice.locked ? (
            <View style={styles.lockedRow}>
            <TouchableOpacity
              onPress={() => void finishVoice(true)}
              style={styles.sideIcon}
              disabled={sending}
              hitSlop={8}>
              <Trash2 size={20} color="#EF4444" />
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

            <View style={styles.lockedWave}>
              <VoiceRecorderOverlay
                subscribeMetering={voice.subscribeMetering}
                formatDuration={voice.formatDuration}
                slideOffset={0}
                cancelArmed={false}
                lockArmed={false}
                locked
                paused={voice.paused}
                embedded
              />
            </View>

            <TouchableOpacity
              style={[styles.actionBtn, {backgroundColor: brand.blue}]}
              onPress={() => void finishVoice(false)}
              disabled={sending}>
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ArrowUp size={20} color="#fff" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.pillRow,
              inputExpanded ? styles.pillRowMultiline : styles.pillRowSingle,
            ]}>
            {!voice.recording ? (
              <TouchableOpacity
                onPress={() => setAttachOpen(true)}
                style={styles.sideIcon}
                disabled={sending}
                hitSlop={8}
                accessibilityRole="button">
                <Plus size={22} color={theme.label} strokeWidth={2.25} />
              </TouchableOpacity>
            ) : null}

            {voice.recording ? (
              <VoiceRecorderOverlay
                subscribeMetering={voice.subscribeMetering}
                formatDuration={voice.formatDuration}
                slideOffset={voice.slideOffset}
                cancelArmed={voice.cancelArmed}
                lockArmed={voice.lockArmed}
                locked={false}
                paused={voice.paused}
                embedded
              />
            ) : (
              <ScrollView
                ref={inputScrollRef}
                style={[
                  styles.inputScroll,
                  !inputExpanded && styles.inputScrollSingle,
                ]}
                contentContainerStyle={[
                  styles.inputScrollContent,
                  !inputExpanded && styles.inputScrollContentSingle,
                ]}
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled
                scrollEnabled={inputExpanded}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => {
                  if (aiStreamingRef.current || aiModeRef.current) {
                    scheduleScrollToEnd();
                  }
                }}>
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    inputExpanded ? styles.inputMultiline : styles.inputSingle,
                    {color: theme.label},
                  ]}
                  placeholder={t.thread.placeholder}
                  placeholderTextColor={theme.tertiaryLabel}
                  value={text}
                  onChangeText={handleChangeText}
                  onContentSizeChange={onInputContentSizeChange}
                  multiline
                  scrollEnabled={false}
                  blurOnSubmit={false}
                  // Manter editable no stream — editable={false} fecha o teclado no iOS
                  editable={!sending}
                  textAlignVertical={inputExpanded ? 'top' : 'center'}
                />
              </ScrollView>
            )}

            {showMic || voice.recording ? (
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
                    styles.actionBtn,
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
                    <Lock size={20} color="#fff" />
                  ) : (
                    <Mic size={20} color="#fff" />
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.actionBtn,
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
                    size={20}
                    color={canSend ? '#fff' : theme.tertiaryLabel}
                    strokeWidth={2.5}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
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
  shortcutsBox: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    maxHeight: 220,
  },
  shortcutRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  shortcutTitle: {
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  shortcutPreview: {
    fontSize: typography.footnote,
  },
  scheduleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scheduleInput: {
    flex: 1,
    fontSize: typography.subhead,
    paddingVertical: Platform.OS === 'ios' ? 4 : 2,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.xl,
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
    borderRadius: radii.xl,
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
  aiFloatRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
    marginBottom: -4,
  },
  aiFloatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillShadow: {
    zIndex: 2,
  },
  pill: {
    // Radius fixo (~metade da altura single-line). Evita 999 que, com
    // várias linhas, vira cápsula enorme e “empurra” o botão de enviar.
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 4,
    // visible: hint do lock do mic sobe acima da pill
    overflow: 'visible',
    minHeight: 52,
    justifyContent: 'center',
  },
  pillMultiline: {
    borderRadius: 22,
    // Menos espaço acima quando o texto cresce; base fica nos botões
    paddingTop: 4,
    paddingBottom: 6,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 4,
    overflow: 'visible',
  },
  // Uma linha: centraliza texto + botões como antes
  pillRowSingle: {
    alignItems: 'center',
  },
  // Várias linhas: botões na base, menos espaço acima do texto
  pillRowMultiline: {
    alignItems: 'flex-end',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lockedWave: {
    flex: 1,
    minWidth: 0,
  },
  sideIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // ScrollView limita a altura; TextInput cresce (scrollEnabled=false) e o SV rola
  inputScroll: {
    flex: 1,
    minWidth: 0,
    maxHeight: 120,
  },
  inputScrollSingle: {
    height: 40,
    maxHeight: 40,
  },
  inputScrollContent: {
    flexGrow: 1,
  },
  inputScrollContentSingle: {
    justifyContent: 'center',
  },
  input: {
    paddingHorizontal: 6,
    fontSize: typography.subhead,
    lineHeight: 20,
    margin: 0,
  },
  inputSingle: {
    paddingTop: 0,
    paddingBottom: 0,
    ...(Platform.OS === 'android'
      ? {textAlignVertical: 'center' as const}
      : {}),
  },
  inputMultiline: {
    minHeight: 40,
    paddingTop: Platform.OS === 'ios' ? 4 : 2,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
  },
  pauseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  micWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  lockHint: {
    position: 'absolute',
    bottom: 48,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
