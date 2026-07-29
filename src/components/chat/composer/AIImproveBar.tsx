import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BlurView} from '@react-native-community/blur';
import {Sparkles, ChevronDown, Undo2, Check, X} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useI18n} from '../../../contexts/I18nContext';
import {useAuth} from '../../../contexts/AuthContext';
import {
  brand,
  glassShadow,
  radii,
  spacing,
  typography,
} from '../../../theme/tokens';
import {
  improveTextWithAIStream,
  type ImproveTextOption,
} from '../../../services/improveTextApi';
import {
  fetchOrganizationPrompts,
  type PromptListItem,
} from '../../../services/promptsApi';
import type {
  AIImproveOptionItem,
  AIImproveSettings,
} from '../../../types/aiImprove';

type Props = {
  visible: boolean;
  text: string;
  chatId: string;
  organizationId: string;
  /** Snapshot para desfazer */
  snapshot: string;
  onTextChange: (next: string) => void;
  onAccept: () => void;
  onUndo: () => void;
  onDismiss: () => void;
  /** true enquanto o SSE está ativo — composer trava layout e suaviza scroll */
  onStreamingChange?: (streaming: boolean) => void;
  /** Mantém o TextInput focado (evita teclado subir/descer ao tocar nas ações) */
  onKeepFocus?: () => void;
};

const DEFAULT_OPTION_IDS: ImproveTextOption[] = [
  'improve',
  'generate',
  'expand',
  'shorten',
  'formal',
  'casual',
  'custom',
];

function promptStorageKey(orgId: string) {
  return `ai-selected-prompt-${orgId}`;
}

function lastOptionStorageKey(orgId: string) {
  return `ai-improve-last-option-${orgId}`;
}

/**
 * Barra minimalista acima do composer.
 * Usa o mesmo TextInput (via onTextChange) — sem sheet de texto.
 */
export function AIImproveBar({
  visible,
  text,
  chatId,
  organizationId,
  snapshot,
  onTextChange,
  onAccept,
  onUndo,
  onDismiss,
  onStreamingChange,
  onKeepFocus,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t, locale} = useI18n();
  const {currentOrganizationMember} = useAuth();

  const aiImproveSettings = useMemo(() => {
    const settings = currentOrganizationMember?.organization?.settings;
    return (settings?.ai_improve as AIImproveSettings | undefined) || null;
  }, [currentOrganizationMember?.organization?.settings]);

  const [selectedOption, setSelectedOption] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [prompts, setPrompts] = useState<PromptListItem[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const optionsScrollRef = useRef<ScrollView>(null);
  const chipXRef = useRef<Record<string, number>>({});
  const didScrollToLastRef = useRef(false);
  const [lastOptionId, setLastOptionId] = useState<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const streamRafRef = useRef<number | null>(null);
  const pendingStreamTextRef = useRef<string | null>(null);
  const onStreamingChangeRef = useRef(onStreamingChange);
  onStreamingChangeRef.current = onStreamingChange;

  const flushStreamText = useCallback(() => {
    streamRafRef.current = null;
    const next = pendingStreamTextRef.current;
    pendingStreamTextRef.current = null;
    if (next != null) onTextChange(next);
  }, [onTextChange]);

  /** Agrupa chunks no mesmo frame — evita setState/reflow a cada token */
  const pushStreamText = useCallback(
    (next: string) => {
      pendingStreamTextRef.current = next;
      if (streamRafRef.current != null) return;
      streamRafRef.current = requestAnimationFrame(flushStreamText);
    },
    [flushStreamText],
  );

  useEffect(() => {
    onStreamingChangeRef.current?.(processing);
  }, [processing]);

  useEffect(() => {
    if (visible) return;
    onStreamingChangeRef.current?.(false);
    if (streamRafRef.current != null) {
      cancelAnimationFrame(streamRafRef.current);
      streamRafRef.current = null;
    }
    pendingStreamTextRef.current = null;
  }, [visible]);

  const defaultLabels = useCallback(
    (id: string) => {
      switch (id) {
        case 'generate':
          return t.composer.aiGenerate;
        case 'expand':
          return t.composer.aiExpand;
        case 'shorten':
          return t.composer.aiShorten;
        case 'formal':
          return t.composer.aiFormal;
        case 'casual':
          return t.composer.aiCasual;
        case 'custom':
          return t.composer.aiCustom;
        case 'improve':
        default:
          return t.composer.aiImprove;
      }
    },
    [t.composer],
  );

  const improvementOptions = useMemo<AIImproveOptionItem[]>(() => {
    const options: AIImproveOptionItem[] = [];

    if (aiImproveSettings?.defaultOptions?.length) {
      aiImproveSettings.defaultOptions
        .filter(c => c.visible)
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach(config => {
          if (!DEFAULT_OPTION_IDS.includes(config.id as ImproveTextOption)) {
            return;
          }
          options.push({id: config.id, label: defaultLabels(config.id)});
        });
    } else {
      DEFAULT_OPTION_IDS.forEach(id => {
        options.push({id, label: defaultLabels(id)});
      });
    }

    if (aiImproveSettings?.customInstructions?.length) {
      aiImproveSettings.customInstructions
        .filter(i => i.active)
        .slice()
        .sort((a, b) => a.order - b.order)
        .forEach(instruction => {
          options.push({
            id: `custom-${instruction.id}`,
            label: instruction.title,
            isCustom: true,
            customInstruction: instruction.instruction,
            promptId: instruction.promptId,
          });
        });
    }

    return options;
  }, [aiImproveSettings, defaultLabels]);

  useEffect(() => {
    if (!visible || !organizationId) return;
    let cancelled = false;
    setLoadingPrompts(true);
    void (async () => {
      try {
        const list = await fetchOrganizationPrompts(organizationId);
        if (cancelled) return;
        setPrompts(list);
        const saved = await AsyncStorage.getItem(
          promptStorageKey(organizationId),
        );
        if (saved === null) return;
        if (saved === '') setSelectedPrompt('');
        else if (list.some(p => p.id === saved)) setSelectedPrompt(saved);
      } catch {
        if (!cancelled) setPrompts([]);
      } finally {
        if (!cancelled) setLoadingPrompts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, organizationId]);

  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      abortRef.current = null;
      setProcessing(false);
      setError('');
      setCustomInstructions('');
      setAgentPickerOpen(false);
      setSelectedOption('');
      setLastOptionId(null);
      didScrollToLastRef.current = false;
      chipXRef.current = {};
      return;
    }
    if (!organizationId) return;
    let cancelled = false;
    void AsyncStorage.getItem(lastOptionStorageKey(organizationId)).then(
      saved => {
        if (!cancelled && saved) setLastOptionId(saved);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visible, organizationId]);

  const scrollToLastOption = useCallback(() => {
    if (!lastOptionId || didScrollToLastRef.current) return;
    if (!improvementOptions.some(o => o.id === lastOptionId)) return;
    const x = chipXRef.current[lastOptionId];
    if (x == null) return;
    didScrollToLastRef.current = true;
    requestAnimationFrame(() => {
      optionsScrollRef.current?.scrollTo({
        x: Math.max(0, x - 8),
        animated: false,
      });
    });
  }, [lastOptionId, improvementOptions]);

  useEffect(() => {
    if (!visible || !lastOptionId) return;
    scrollToLastOption();
  }, [visible, lastOptionId, scrollToLastOption]);

  useEffect(() => {
    if (!visible) return;
    const selected = improvementOptions.find(o => o.id === selectedOption);
    if (selected?.isCustom && selected.promptId) {
      if (prompts.some(p => p.id === selected.promptId)) {
        setSelectedPrompt(selected.promptId);
      }
    }
  }, [selectedOption, improvementOptions, prompts, visible]);

  const canUndo = text !== snapshot;
  const showCustomField = selectedOption === 'custom';

  const selectedAgentLabel = useMemo(() => {
    if (!selectedPrompt) return t.composer.aiDefaultAgent;
    const found = prompts.find(p => p.id === selectedPrompt);
    if (!found) return t.composer.aiDefaultAgent;
    return found.is_default
      ? `${found.title} (${t.composer.aiDefaultBadge})`
      : found.title;
  }, [selectedPrompt, prompts, t.composer]);

  const runImprove = useCallback(
    async (optionId: string) => {
      if (!organizationId || processing) return;

      const optionData = improvementOptions.find(o => o.id === optionId);
      const isCustomInstruction = !!optionData?.isCustom;
      const isCustom = isCustomInstruction || optionId === 'custom';
      const sourceText = textRef.current.trim();

      if (optionId === 'generate' && !chatId) {
        setError(t.composer.aiNeedText);
        return;
      }
      if (optionId !== 'generate' && !sourceText) {
        if (
          !(
            isCustom &&
            chatId &&
            (customInstructions.trim() || optionData?.customInstruction)
          )
        ) {
          setError(t.composer.aiNeedText);
          return;
        }
      }
      if (
        optionId === 'custom' &&
        !customInstructions.trim() &&
        !optionData?.customInstruction
      ) {
        setError(t.composer.aiNeedCustomInstructions);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setProcessing(true);
      setError('');

      try {
        const requestData: {
          improveOption: string;
          chatId?: string;
          text?: string;
          language?: string;
          customInstructions?: string;
          promptId?: string;
        } = {
          improveOption: isCustomInstruction ? 'custom' : optionId,
          language: locale,
          chatId,
        };

        if (sourceText) {
          requestData.text = sourceText;
        }

        if (isCustomInstruction && optionData?.customInstruction) {
          requestData.customInstructions = optionData.customInstruction;
          requestData.promptId =
            optionData.promptId || selectedPrompt || undefined;
        } else if (optionId === 'custom') {
          requestData.customInstructions = customInstructions.trim();
          if (selectedPrompt) requestData.promptId = selectedPrompt;
        } else if (selectedPrompt) {
          requestData.promptId = selectedPrompt;
        }

        await improveTextWithAIStream(
          organizationId,
          requestData,
          {
            onChunk: (_chunk, accumulated) => {
              pushStreamText(accumulated);
            },
            onComplete: content => {
              if (streamRafRef.current != null) {
                cancelAnimationFrame(streamRafRef.current);
                streamRafRef.current = null;
              }
              pendingStreamTextRef.current = null;
              onTextChange(content);
              void AsyncStorage.setItem(
                promptStorageKey(organizationId),
                selectedPrompt,
              );
            },
            onError: err => {
              setError(err);
            },
          },
          controller.signal,
        );
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') {
          return;
        }
        setError(e instanceof Error ? e.message : t.composer.aiError);
      } finally {
        if (streamRafRef.current != null) {
          cancelAnimationFrame(streamRafRef.current);
          streamRafRef.current = null;
        }
        if (pendingStreamTextRef.current != null) {
          onTextChange(pendingStreamTextRef.current);
          pendingStreamTextRef.current = null;
        }
        setProcessing(false);
      }
    },
    [
      organizationId,
      processing,
      improvementOptions,
      chatId,
      customInstructions,
      locale,
      selectedPrompt,
      onTextChange,
      pushStreamText,
      t.composer,
    ],
  );

  const keepKeyboard = useCallback(() => {
    onKeepFocus?.();
    // iOS às vezes solta o foco depois do onPress — reforça no próximo frame
    requestAnimationFrame(() => onKeepFocus?.());
  }, [onKeepFocus]);

  const onOptionPress = (id: string) => {
    keepKeyboard();
    setSelectedOption(id);
    setError('');
    if (organizationId) {
      void AsyncStorage.setItem(lastOptionStorageKey(organizationId), id);
      setLastOptionId(id);
    }
    if (id === 'custom') {
      keepKeyboard();
      return;
    }
    void runImprove(id);
    keepKeyboard();
    setTimeout(() => onKeepFocus?.(), 80);
  };

  if (!visible) return null;

  // xlight / chrome evitam o cinza “sujo” do ultraThinMaterial
  const blurType =
    Platform.OS === 'ios'
      ? mode === 'dark'
        ? 'chromeMaterialDark'
        : 'chromeMaterialLight'
      : mode === 'dark'
        ? 'dark'
        : 'xlight';
  const blurAmount = Platform.OS === 'ios' ? 10 : 8;
  // Véu branco / navy-azul — não o cinza neutro do material do sistema
  const glassTint =
    mode === 'dark' ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.48)';
  const chipBg =
    mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)';
  const chipBorder =
    mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';

  return (
    // Sombra fora; BlurView atrás (absolute) — como filho do BlurView o conteúdo some no iOS
    <View style={[styles.shadowWrap, glassShadow(mode)]}>
      <View
        style={[styles.wrap, {borderColor: theme.border}]}
        collapsable={false}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType={blurType}
          blurAmount={blurAmount}
          {...(Platform.OS === 'android'
            ? {
                overlayColor: glassTint,
                downsampleFactor: 5,
              }
            : {})}
          reducedTransparencyFallbackColor={
            mode === 'dark' ? 'rgba(15,23,42,0.88)' : 'rgba(255,255,255,0.88)'
          }
        />
        {Platform.OS === 'ios' ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {backgroundColor: glassTint}]}
          />
        ) : null}

        <View style={styles.content}>
          <View style={styles.topRow}>
            <TouchableOpacity
              style={[
                styles.agentChip,
                {backgroundColor: chipBg, borderColor: chipBorder},
              ]}
              onPress={() => setAgentPickerOpen(true)}
              disabled={loadingPrompts || processing}
              hitSlop={6}>
              <Text
                style={[styles.agentText, {color: theme.label}]}
                numberOfLines={1}>
                {loadingPrompts
                  ? t.composer.aiLoadingAgents
                  : selectedAgentLabel}
              </Text>
              <ChevronDown size={14} color={theme.tertiaryLabel} />
            </TouchableOpacity>

            {canUndo && !processing ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.topAction,
                    {backgroundColor: chipBg, borderColor: chipBorder},
                  ]}
                  onPressIn={keepKeyboard}
                  onPress={() => {
                    onUndo();
                    keepKeyboard();
                  }}
                  accessibilityLabel={t.composer.aiUndo}>
                  <Undo2 size={14} color={theme.secondaryLabel} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.topAction, styles.topActionKeep]}
                  onPress={onAccept}
                  accessibilityLabel={t.composer.aiKeep}>
                  <Check size={14} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={onDismiss}
                hitSlop={8}
                accessibilityLabel={t.composer.aiDismiss}>
                <X size={18} color={theme.tertiaryLabel} />
              </TouchableOpacity>
            )}
          </View>

          {/* Full-bleed: padding só no content — scroll vai até a borda */}
          <ScrollView
            ref={optionsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            style={styles.optionsScroll}
            contentContainerStyle={styles.optionsRow}>
            {improvementOptions.map(opt => {
              const active = selectedOption === opt.id;
              const running = processing && active && opt.id !== 'custom';
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPressIn={keepKeyboard}
                  onPress={() => onOptionPress(opt.id)}
                  disabled={processing}
                  onLayout={e => {
                    chipXRef.current[opt.id] = e.nativeEvent.layout.x;
                    scrollToLastOption();
                  }}
                  style={[
                    styles.optionChip,
                    {
                      backgroundColor: active ? brand.blueSoft : chipBg,
                      borderColor: active ? brand.blue : chipBorder,
                      opacity: processing && !active ? 0.45 : 1,
                    },
                  ]}>
                  <Text
                    style={{
                      color: active ? brand.blue : theme.label,
                      fontSize: typography.caption,
                      fontWeight: active ? '700' : '600',
                      opacity: running ? 0 : 1,
                    }}
                    numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {running ? (
                    <View style={styles.chipSpinner}>
                      <ActivityIndicator size="small" color={brand.blue} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {showCustomField ? (
            <View style={[styles.paddedRow, styles.customRow]}>
              <TextInput
                style={[
                  styles.customInput,
                  {
                    backgroundColor: chipBg,
                    color: theme.label,
                    borderColor: chipBorder,
                  },
                ]}
                value={customInstructions}
                onChangeText={setCustomInstructions}
                placeholder={t.composer.aiCustomPlaceholder}
                placeholderTextColor={theme.tertiaryLabel}
                editable={!processing}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.runBtn,
                  {
                    backgroundColor: customInstructions.trim()
                      ? brand.blue
                      : chipBg,
                  },
                ]}
                onPress={() => void runImprove('custom')}
                disabled={processing || !customInstructions.trim()}>
                {processing && selectedOption === 'custom' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Sparkles
                    size={16}
                    color={
                      customInstructions.trim() ? '#fff' : theme.tertiaryLabel
                    }
                  />
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {error ? (
            <Text style={[styles.error, styles.paddedRow]}>{error}</Text>
          ) : null}
        </View>
      </View>

      <Modal
        visible={agentPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAgentPickerOpen(false)}>
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setAgentPickerOpen(false)}>
          <Pressable
            style={[
              styles.pickerSheet,
              glassShadow(mode),
              {backgroundColor: theme.card, borderColor: theme.border},
            ]}
            onPress={e => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, {color: theme.label}]}>
              {t.composer.aiAgent}
            </Text>
            <ScrollView style={styles.pickerList}>
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setSelectedPrompt('');
                  setAgentPickerOpen(false);
                }}>
                <Text
                  style={{
                    color: !selectedPrompt ? brand.blue : theme.label,
                    fontWeight: !selectedPrompt ? '700' : '500',
                  }}>
                  {t.composer.aiDefaultAgent}
                </Text>
              </TouchableOpacity>
              {prompts.map(prompt => {
                const active = selectedPrompt === prompt.id;
                return (
                  <TouchableOpacity
                    key={prompt.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      setSelectedPrompt(prompt.id);
                      setAgentPickerOpen(false);
                    }}>
                    <Text
                      style={{
                        color: active ? brand.blue : theme.label,
                        fontWeight: active ? '700' : '500',
                      }}>
                      {prompt.title}
                      {prompt.is_default
                        ? ` (${t.composer.aiDefaultBadge})`
                        : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radii.xl,
  },
  wrap: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  content: {
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  paddedRow: {
    paddingHorizontal: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  agentChip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  agentText: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  topActionKeep: {
    backgroundColor: brand.blue,
    borderColor: brand.blue,
  },
  optionsScroll: {
    marginHorizontal: 0,
  },
  optionsRow: {
    gap: 6,
    // Inset inicial alinhado ao restante; no scroll as opções vão até a borda
    paddingHorizontal: 10,
  },
  optionChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  chipSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  customInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 80,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: typography.footnote,
    textAlignVertical: 'top',
  },
  runBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#EF4444',
    fontSize: typography.caption,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  pickerSheet: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    maxHeight: '60%',
    padding: spacing.md,
  },
  pickerTitle: {
    fontSize: typography.headline,
    fontWeight: '600',
    marginBottom: 8,
  },
  pickerList: {
    maxHeight: 320,
  },
  pickerRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: 'rgba(156,163,175,0.35)',
  },
});
