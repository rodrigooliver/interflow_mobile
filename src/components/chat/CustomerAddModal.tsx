import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type Props = {
  visible: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated?: (customerId: string) => void;
};

export function CustomerAddModal({
  visible,
  organizationId,
  onClose,
  onCreated,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setName('');
      setWhatsapp('');
      setEmail('');
      setError('');
      setSaving(false);
    }
  }, [visible]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Nome é obrigatório');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        organization_id: organizationId,
        name: trimmedName,
      };
      if (whatsapp.trim()) payload.whatsapp = whatsapp.trim();
      if (email.trim()) payload.email = email.trim();

      const {data, error: insertError} = await supabase
        .from('customers')
        .insert(payload)
        .select('id')
        .single();

      if (insertError) throw insertError;

      const customerId = data?.id as string;
      const contacts: Array<{customer_id: string; type: string; value: string}> =
        [];
      if (whatsapp.trim()) {
        contacts.push({
          customer_id: customerId,
          type: 'whatsapp',
          value: whatsapp.trim(),
        });
      }
      if (email.trim()) {
        contacts.push({
          customer_id: customerId,
          type: 'email',
          value: email.trim(),
        });
      }
      if (contacts.length) {
        await supabase.from('customer_contacts').insert(contacts);
      }

      onCreated?.(customerId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      maxHeight="94%"
      minHeight="65%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Novo cliente
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={chatModalStyles.scroll}
        contentContainerStyle={chatModalStyles.body}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        bounces>
                {error ? (
                  <Text style={[chatModalStyles.error, {color: '#EF4444'}]}>
                    {error}
                  </Text>
                ) : null}

                <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                  Nome *
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Nome do cliente"
                  placeholderTextColor={theme.tertiaryLabel}
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
                  WhatsApp / telefone
                </Text>
                <TextInput
                  value={whatsapp}
                  onChangeText={setWhatsapp}
                  placeholder="+55..."
                  placeholderTextColor={theme.tertiaryLabel}
                  keyboardType="phone-pad"
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
                  E-mail
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@exemplo.com"
                  placeholderTextColor={theme.tertiaryLabel}
                  keyboardType="email-address"
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
      </ScrollView>

      <View style={chatModalStyles.footer}>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: theme.fill}]}
          onPress={onClose}
          disabled={saving}>
          <Text style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
            {t.common.cancel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: brand.blue}]}
          onPress={() => void handleSave()}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[chatModalStyles.footerBtnText, {color: '#fff'}]}>
              {t.common.confirm}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ChatSheetModal>
  );
}
