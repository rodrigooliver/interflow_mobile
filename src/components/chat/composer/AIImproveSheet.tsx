import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {X, Sparkles, Check} from 'lucide-react-native';
import {useTheme} from '../../../contexts/ThemeContext';
import {useI18n} from '../../../contexts/I18nContext';
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

type Props = {
  visible: boolean;
  text: string;
  chatId: string;
  organizationId: string;
  onClose: () => void;
  onApply: (improved: string) => void;
};

const OPTIONS: ImproveTextOption[] = [
  'improve',
  'expand',
  'shorten',
  'formal',
  'casual',
];

export function AIImproveSheet({
  visible,
  text,
  chatId,
  organizationId,
  onClose,
  onApply,
}: Props) {
  const {theme: mode, colors: theme} = useTheme();
  const {t, locale} = useI18n();
  const [selected, setSelected] = useState<ImproveTextOption>('improve');
  const [preview, setPreview] = useState(text);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (visible) {
      setPreview(text);
      setSelected(text.trim() ? 'improve' : 'improve');
      setError('');
      setProcessing(false);
    } else {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [visible, text]);

  const runImprove = useCallback(async () => {
    if (!organizationId || processing) return;
    if (!text.trim() && selected !== 'generate') {
      setError(t.composer.aiNeedText);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setError('');
    setPreview('');

    try {
      await improveTextWithAIStream(
        organizationId,
        {
          text: text.trim(),
          improveOption: selected,
          chatId,
          language: locale,
        },
        {
          onChunk: (_chunk, accumulated) => setPreview(accumulated),
          onComplete: content => {
            setPreview(content);
            setProcessing(false);
          },
          onError: err => {
            setError(err);
            setProcessing(false);
            setPreview(text);
          },
        },
        controller.signal,
      );
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : t.composer.aiError);
      setProcessing(false);
      setPreview(text);
    }
  }, [
    organizationId,
    processing,
    text,
    selected,
    chatId,
    locale,
    t.composer.aiNeedText,
    t.composer.aiError,
  ]);

  const handleApply = () => {
    if (!preview.trim()) return;
    onApply(preview.trim());
    onClose();
  };

  const optionLabel = (id: ImproveTextOption) => {
    switch (id) {
      case 'expand':
        return t.composer.aiExpand;
      case 'shorten':
        return t.composer.aiShorten;
      case 'formal':
        return t.composer.aiFormal;
      case 'casual':
        return t.composer.aiCasual;
      case 'improve':
      default:
        return t.composer.aiImprove;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[
              styles.sheet,
              glassShadow(mode),
              {backgroundColor: theme.card, borderColor: theme.border},
            ]}
            onPress={e => e.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Sparkles size={18} color={brand.blue} />
                <Text style={[styles.title, {color: theme.label}]}>
                  {t.composer.aiTitle}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <X size={20} color={theme.tertiaryLabel} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.optionsRow}>
              {OPTIONS.map(opt => {
                const active = selected === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setSelected(opt)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? brand.blue : theme.fill,
                        borderColor: active ? brand.blue : theme.border,
                      },
                    ]}>
                    <Text
                      style={{
                        color: active ? '#fff' : theme.label,
                        fontSize: typography.footnote,
                        fontWeight: '600',
                      }}>
                      {optionLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              style={[
                styles.preview,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.label,
                  borderColor: theme.border,
                },
              ]}
              value={preview}
              onChangeText={setPreview}
              multiline
              editable={!processing}
              placeholder={t.composer.aiPreviewPlaceholder}
              placeholderTextColor={theme.tertiaryLabel}
            />

            {error ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.btnSecondary,
                  {backgroundColor: theme.fill, borderColor: theme.border},
                ]}
                onPress={runImprove}
                disabled={processing}>
                {processing ? (
                  <ActivityIndicator color={brand.blue} size="small" />
                ) : (
                  <Text style={[styles.btnSecondaryText, {color: brand.blue}]}>
                    {t.composer.aiRun}
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  {
                    backgroundColor: preview.trim()
                      ? brand.blue
                      : theme.fill,
                  },
                ]}
                onPress={handleApply}
                disabled={!preview.trim() || processing}>
                <Check
                  size={18}
                  color={preview.trim() ? '#fff' : theme.tertiaryLabel}
                />
                <Text
                  style={{
                    color: preview.trim() ? '#fff' : theme.tertiaryLabel,
                    fontWeight: '700',
                  }}>
                  {t.composer.aiApply}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: 12,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: typography.headline,
    fontWeight: '600',
  },
  optionsRow: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  preview: {
    minHeight: 120,
    maxHeight: 220,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: 12,
    fontSize: typography.subhead,
    textAlignVertical: 'top',
  },
  error: {
    color: '#EF4444',
    fontSize: typography.footnote,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    fontWeight: '700',
    fontSize: typography.subhead,
  },
  btnPrimary: {
    flex: 1,
    height: 44,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
