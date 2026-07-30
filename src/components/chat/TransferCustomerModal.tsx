import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {Search, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {transferToCustomer} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type CustomerRow = {
  id: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
};

type Props = {
  visible: boolean;
  chatId: string;
  organizationId: string;
  currentCustomerId?: string | null;
  onClose: () => void;
  onTransferred?: (customerId: string) => void;
};

export function TransferCustomerModal({
  visible,
  chatId,
  organizationId,
  currentCustomerId,
  onClose,
  onTransferred,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSearch('');
      setDebounced('');
      setCustomers([]);
      return;
    }
    const timer = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search, visible]);

  useEffect(() => {
    if (!visible || debounced.trim().length < 2) {
      setCustomers([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('customers')
          .select('id, name, email, whatsapp')
          .eq('organization_id', organizationId)
          .ilike('name', `%${debounced.trim()}%`)
          .limit(20);

        if (currentCustomerId) {
          query = query.neq('id', currentCustomerId);
        }

        const {data, error} = await query;
        if (error) throw error;
        if (!cancelled) setCustomers((data || []) as CustomerRow[]);
      } catch (e) {
        if (!cancelled) {
          Alert.alert(
            t.thread.errorTitle,
            e instanceof Error ? e.message : t.chats.loadError,
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    debounced,
    visible,
    organizationId,
    currentCustomerId,
    t.chats.loadError,
    t.thread.errorTitle,
  ]);

  const transfer = async (customerId: string) => {
    setTransferring(true);
    try {
      await transferToCustomer(organizationId, chatId, customerId);
      onTransferred?.(customerId);
      onClose();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setTransferring(false);
    }
  };

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="94%"
      minHeight="70%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Transferir para cliente
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      <View style={{paddingHorizontal: spacing.lg, paddingTop: spacing.md}}>
        <View
          style={[
            styles.searchWrap,
            {backgroundColor: theme.searchBg, borderColor: theme.border},
          ]}>
          <Search size={18} color={theme.tertiaryLabel} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar cliente"
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
          />
        </View>
      </View>

      {loading || transferring ? (
        <ActivityIndicator color={brand.blue} style={{marginTop: spacing.lg}} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={item => item.id}
          style={chatModalStyles.scroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          bounces
          ListEmptyComponent={
            <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
              {debounced.trim().length < 2
                ? 'Digite ao menos 2 caracteres'
                : 'Nenhum cliente encontrado'}
            </Text>
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
              onPress={() => void transfer(item.id)}>
              <View style={{flex: 1}}>
                <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                  {item.name || 'Sem nome'}
                </Text>
                {(item.whatsapp || item.email) && (
                  <Text style={{color: theme.secondaryLabel, fontSize: 13}}>
                    {[item.whatsapp, item.email].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </ChatSheetModal>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 4,
  },
});
