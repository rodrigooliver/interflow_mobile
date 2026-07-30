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
import {transferToAgent} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type AgentRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
};

type Props = {
  visible: boolean;
  chatId: string;
  organizationId: string;
  onClose: () => void;
  onTransferred?: () => void;
};

export function TransferAgentModal({
  visible,
  chatId,
  organizationId,
  onClose,
  onTransferred,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const {data, error} = await supabase
        .from('organization_members')
        .select('user_id, profiles:profiles(id, full_name, email)')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const rows: AgentRow[] = [];
      for (const row of data || []) {
        const profile = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;
        const id = (profile as AgentRow | null)?.id || row.user_id;
        if (!id) continue;
        rows.push({
          id,
          full_name: (profile as AgentRow | null)?.full_name,
          email: (profile as AgentRow | null)?.email,
        });
      }
      rows.sort((a, b) =>
        (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''),
      );
      setAgents(rows);
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, t.chats.loadError, t.thread.errorTitle]);

  useEffect(() => {
    if (visible) {
      void loadAgents();
    } else {
      setSearch('');
    }
  }, [visible, loadAgents]);

  const filtered = agents.filter(agent => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      agent.full_name?.toLowerCase().includes(q) ||
      agent.email?.toLowerCase().includes(q)
    );
  });

  const transfer = async (agentId: string) => {
    setTransferring(true);
    try {
      await transferToAgent(organizationId, chatId, agentId);
      onTransferred?.();
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
      sheetStyle={{minHeight: '50%'}}>
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Transferir para atendente
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
            placeholder="Buscar atendente"
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
          />
        </View>
      </View>

      {loading || transferring ? (
        <ActivityIndicator color={brand.blue} style={{marginTop: spacing.lg}} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
              Nenhum atendente encontrado
            </Text>
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
              onPress={() => void transfer(item.id)}>
              <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                {item.full_name || item.email || item.id}
              </Text>
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
