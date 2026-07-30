import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {Send, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {sendWhatsAppTemplate} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type WhatsAppTemplateRow = {
  id: string;
  name: string;
  language?: string | null;
  status?: string | null;
  components?: Array<{type?: string; text?: string}> | null;
};

type Props = {
  visible: boolean;
  organizationId: string;
  chatId: string;
  channelId?: string | null;
  onClose: () => void;
  onSent?: () => void;
};

export function WhatsAppTemplateSheet({
  visible,
  organizationId,
  chatId,
  channelId,
  onClose,
  onSent,
}: Props) {
  const {colors: theme} = useTheme();
  const [templates, setTemplates] = useState<WhatsAppTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selected, setSelected] = useState<WhatsAppTemplateRow | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualLanguage, setManualLanguage] = useState('pt_BR');
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!channelId) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const {data, error: fetchError} = await supabase
        .from('whatsapp_templates')
        .select('id, name, language, status, components')
        .eq('channel_id', channelId)
        .eq('status', 'APPROVED')
        .order('name');

      if (fetchError) throw fetchError;
      setTemplates((data || []) as WhatsAppTemplateRow[]);
    } catch (e) {
      console.error('[WhatsAppTemplateSheet] load failed', e);
      setError('Não foi possível carregar templates.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      setManualName('');
      setManualLanguage('pt_BR');
      void loadTemplates();
    }
  }, [visible, loadTemplates]);

  const preview = useMemo(() => {
    if (!selected?.components?.length) return '';
    const body = selected.components.find(c => c.type === 'BODY');
    return body?.text || selected.name;
  }, [selected]);

  const handleSend = async () => {
    if (sending) return;

    const templateId = selected?.id;
    const templateName = selected?.name || manualName.trim();
    const language = selected?.language || manualLanguage.trim() || 'pt_BR';

    if (!templateId && !templateName) {
      Alert.alert('Template', 'Informe o nome do template.');
      return;
    }

    setSending(true);
    try {
      await sendWhatsAppTemplate(organizationId, chatId, {
        ...(templateId ? {templateId} : {templateName, language}),
        variables: {},
      });
      onSent?.();
      onClose();
    } catch (e) {
      console.error('[WhatsAppTemplateSheet] send failed', e);
      Alert.alert('Erro', 'Não foi possível enviar o template.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ChatSheetModal visible={visible} onClose={onClose}>
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Template WhatsApp
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <X size={22} color={theme.secondaryLabel} />
        </TouchableOpacity>
      </View>

      <View style={chatModalStyles.body}>
              {loading ? (
                <ActivityIndicator
                  color={brand.blue}
                  style={{marginVertical: spacing.lg}}
                />
              ) : templates.length > 0 ? (
                <>
                  <FlatList
                    data={templates}
                    keyExtractor={item => item.id}
                    style={{maxHeight: 220, marginBottom: spacing.md}}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({item}) => {
                      const active = selected?.id === item.id;
                      return (
                        <TouchableOpacity
                          style={[
                            chatModalStyles.chip,
                            {
                              borderColor: active ? brand.blue : theme.border,
                              backgroundColor: active
                                ? brand.blueSoft
                                : theme.searchBg,
                              marginBottom: spacing.sm,
                            },
                          ]}
                          onPress={() => setSelected(item)}>
                          <Text
                            style={[
                              chatModalStyles.chipText,
                              {color: active ? brand.blue : theme.label},
                            ]}>
                            {item.name}
                            {item.language ? ` · ${item.language}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                  {preview ? (
                    <Text
                      style={{
                        color: theme.secondaryLabel,
                        fontSize: 13,
                        marginBottom: spacing.md,
                      }}>
                      {preview}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  {error ? (
                    <Text style={[chatModalStyles.error, {color: '#EF4444'}]}>
                      {error}
                    </Text>
                  ) : null}
                  <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                    Nome do template
                  </Text>
                  <TextInput
                    value={manualName}
                    onChangeText={setManualName}
                    placeholder="ex: boas_vindas"
                    placeholderTextColor={theme.tertiaryLabel}
                    autoCapitalize="none"
                    style={[
                      chatModalStyles.input,
                      {
                        color: theme.label,
                        borderColor: theme.border,
                        backgroundColor: theme.inputBg,
                      },
                    ]}
                  />
                  <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                    Idioma
                  </Text>
                  <TextInput
                    value={manualLanguage}
                    onChangeText={setManualLanguage}
                    placeholder="pt_BR"
                    placeholderTextColor={theme.tertiaryLabel}
                    autoCapitalize="none"
                    style={[
                      chatModalStyles.input,
                      {
                        color: theme.label,
                        borderColor: theme.border,
                        backgroundColor: theme.inputBg,
                      },
                    ]}
                  />
                </>
              )}

              <View style={chatModalStyles.footer}>
                <TouchableOpacity
                  style={[
                    chatModalStyles.footerBtn,
                    {backgroundColor: theme.fill},
                  ]}
                  onPress={onClose}>
                  <Text
                    style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    chatModalStyles.footerBtn,
                    {backgroundColor: brand.blue},
                    sending && {opacity: 0.6},
                  ]}
                  onPress={() => void handleSend()}
                  disabled={sending}>
                  {sending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                      <Send size={16} color="#FFFFFF" />
                      <Text style={[chatModalStyles.footerBtnText, {color: '#FFFFFF'}]}>
                        Enviar
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
      </View>
    </ChatSheetModal>
  );
}
