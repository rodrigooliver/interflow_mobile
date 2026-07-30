import React, {useCallback, useEffect, useState} from 'react';
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
import {mergeChat} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type MergeTarget = {
  id: string;
  ticket_number?: number | string | null;
  status?: string | null;
  customer?: {name?: string | null} | null;
  last_message_at?: string | null;
};

type Props = {
  visible: boolean;
  chatId: string;
  organizationId: string;
  customerId?: string | null;
  onClose: () => void;
  onMerged?: (targetChatId: string) => void;
};

export function MergeChatModal({
  visible,
  chatId,
  organizationId,
  customerId,
  onClose,
  onMerged,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [search, setSearch] = useState('');
  const [targets, setTargets] = useState<MergeTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  const loadTargets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('chats')
        .select(
          'id, ticket_number, status, last_message_at, customer:customers(name)',
        )
        .eq('organization_id', organizationId)
        .neq('id', chatId)
        .order('last_message_at', {ascending: false})
        .limit(30);

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      const {data, error} = await query;
      if (error) throw error;
      setTargets((data || []) as MergeTarget[]);
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setLoading(false);
    }
  }, [chatId, customerId, organizationId, t.chats.loadError, t.thread.errorTitle]);

  useEffect(() => {
    if (visible) {
      void loadTargets();
    } else {
      setSearch('');
    }
  }, [visible, loadTargets]);

  const filtered = targets.filter(item => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const ticket = String(item.ticket_number ?? '');
    const customer = item.customer?.name?.toLowerCase() || '';
    return ticket.includes(q) || customer.includes(q) || item.id.includes(q);
  });

  const merge = async (targetChatId: string) => {
    setMerging(true);
    try {
      await mergeChat(organizationId, chatId, targetChatId);
      onMerged?.(targetChatId);
      onClose();
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setMerging(false);
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
          Mesclar atendimento
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
            placeholder="Buscar ticket ou cliente"
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
          />
        </View>
      </View>

      {loading || merging ? (
        <ActivityIndicator color={brand.blue} style={{marginTop: spacing.lg}} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          style={chatModalStyles.scroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          bounces
          ListEmptyComponent={
            <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
              Nenhum chat encontrado
            </Text>
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
              onPress={() => void merge(item.id)}>
              <View style={{flex: 1}}>
                <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                  #{item.ticket_number ?? '—'} ·{' '}
                  {item.customer?.name || 'Sem cliente'}
                </Text>
                <Text style={{color: theme.secondaryLabel, fontSize: 13}}>
                  {item.status || '—'}
                </Text>
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
