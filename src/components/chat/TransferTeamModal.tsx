import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {transferToTeam} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type TeamRow = {
  id: string;
  name?: string | null;
};

type Props = {
  visible: boolean;
  chatId: string;
  organizationId: string;
  currentTeamId?: string | null;
  onClose: () => void;
  onTransferred?: () => void;
};

export function TransferTeamModal({
  visible,
  chatId,
  organizationId,
  currentTeamId,
  onClose,
  onTransferred,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const {data, error} = await supabase
        .from('service_teams')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      if (error) throw error;
      setTeams((data || []) as TeamRow[]);
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
    if (visible) void loadTeams();
  }, [visible, loadTeams]);

  const transfer = async (teamId: string) => {
    if (teamId === currentTeamId) {
      Alert.alert(t.thread.errorTitle, 'Selecione uma equipe diferente.');
      return;
    }
    setTransferring(true);
    try {
      await transferToTeam(organizationId, chatId, teamId);
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
      maxHeight="94%"
      minHeight="55%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Transferir equipe
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      {loading || transferring ? (
        <ActivityIndicator color={brand.blue} style={{marginTop: spacing.xl}} />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={item => item.id}
          style={chatModalStyles.scroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          bounces
          ListEmptyComponent={
            <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
              Nenhuma equipe encontrada
            </Text>
          }
          renderItem={({item}) => (
            <TouchableOpacity
              style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
              onPress={() => void transfer(item.id)}>
              <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                {item.name || item.id}
                {item.id === currentTeamId ? ' (atual)' : ''}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </ChatSheetModal>
  );
}
