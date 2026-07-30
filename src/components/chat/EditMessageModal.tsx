import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand} from '../../theme/tokens';
import {editMessage} from '../../services/messageActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type Props = {
  visible: boolean;
  organizationId: string;
  chatId: string;
  messageId: string;
  initialContent?: string | null;
  onClose: () => void;
  onSaved?: (content: string) => void;
};

export function EditMessageModal({
  visible,
  organizationId,
  chatId,
  messageId,
  initialContent,
  onClose,
  onSaved,
}: Props) {
  const {colors: theme} = useTheme();
  const [content, setContent] = useState(initialContent || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setContent(initialContent || '');
    }
  }, [visible, initialContent]);

  const handleSave = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert('Editar', 'Digite o novo texto da mensagem.');
      return;
    }
    setSaving(true);
    try {
      await editMessage(organizationId, chatId, messageId, trimmed);
      onSaved?.(trimmed);
      onClose();
    } catch (e) {
      console.error('[EditMessageModal] save failed', e);
      Alert.alert('Erro', 'Não foi possível editar a mensagem.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      maxHeight="70%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Editar mensagem
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <X size={22} color={theme.secondaryLabel} />
        </TouchableOpacity>
      </View>

      <View style={chatModalStyles.body}>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus
          placeholder="Texto da mensagem"
          placeholderTextColor={theme.tertiaryLabel}
          style={[
            chatModalStyles.input,
            {
              minHeight: 120,
              textAlignVertical: 'top',
              color: theme.label,
              borderColor: theme.border,
              backgroundColor: theme.inputBg,
            },
          ]}
        />

        <View style={chatModalStyles.footer}>
          <TouchableOpacity
            style={[chatModalStyles.footerBtn, {backgroundColor: theme.fill}]}
            onPress={onClose}>
            <Text style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
              Cancelar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              chatModalStyles.footerBtn,
              {backgroundColor: brand.blue},
              saving && {opacity: 0.6},
            ]}
            onPress={() => void handleSave()}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[chatModalStyles.footerBtnText, {color: '#FFFFFF'}]}>
                Salvar
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ChatSheetModal>
  );
}
