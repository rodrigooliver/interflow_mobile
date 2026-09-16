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
import {usePermissions} from '../../hooks/usePermissions';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {transferToTeam, transferToTeamRotation} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

const TEAM_ROTATION_SENTINEL = '__team_rotation__';

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

function isChannelTeamRotationActive(settings?: Record<string, unknown> | null): boolean {
  if (!settings || settings.teamRotationEnabled !== true) return false;
  const ids = settings.teamRotationTeamIds;
  return Array.isArray(ids) && ids.filter(Boolean).length >= 2;
}

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
  const {isOwnerOrAdmin} = usePermissions();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [rotationActive, setRotationActive] = useState(false);
  const [agentsCanPick, setAgentsCanPick] = useState(true);

  const canPickTeam = isOwnerOrAdmin || !rotationActive || agentsCanPick;

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const [teamsRes, chatRes, orgRes] = await Promise.all([
        supabase
          .from('service_teams')
          .select('id, name')
          .eq('organization_id', organizationId)
          .order('name'),
        supabase
          .from('chats')
          .select('channel:chat_channels(settings)')
          .eq('id', chatId)
          .eq('organization_id', organizationId)
          .single(),
        supabase
          .from('organizations')
          .select('settings')
          .eq('id', organizationId)
          .single(),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      setTeams((teamsRes.data || []) as TeamRow[]);

      const channel = Array.isArray(chatRes.data?.channel)
        ? chatRes.data.channel[0]
        : chatRes.data?.channel;
      setRotationActive(
        isChannelTeamRotationActive(
          (channel as {settings?: Record<string, unknown>} | null)?.settings,
        ),
      );

      const orgSettings = (orgRes.data?.settings || {}) as Record<string, unknown>;
      setAgentsCanPick(orgSettings.agents_can_pick_team_when_rotation_enabled !== false);
    } catch (e) {
      Alert.alert(
        t.thread.errorTitle,
        e instanceof Error ? e.message : t.chats.loadError,
      );
    } finally {
      setLoading(false);
    }
  }, [organizationId, chatId, t.chats.loadError, t.thread.errorTitle]);

  useEffect(() => {
    if (visible) void loadTeams();
  }, [visible, loadTeams]);

  const transfer = async (teamId: string) => {
    if (teamId !== TEAM_ROTATION_SENTINEL && teamId === currentTeamId) {
      Alert.alert(t.thread.errorTitle, 'Selecione uma equipe diferente.');
      return;
    }
    setTransferring(true);
    try {
      if (teamId === TEAM_ROTATION_SENTINEL) {
        await transferToTeamRotation(organizationId, chatId);
      } else {
        await transferToTeam(organizationId, chatId, teamId);
      }
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

  const listData: TeamRow[] =
    rotationActive
      ? [{id: TEAM_ROTATION_SENTINEL, name: 'Enviar ao rodízio de equipes'}, ...teams]
      : teams;

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
      ) : !canPickTeam && rotationActive ? (
        <View style={{padding: spacing.lg}}>
          <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
            Este canal usa rodízio de equipes. O atendimento será sorteado automaticamente.
          </Text>
          <TouchableOpacity
            style={[chatModalStyles.row, {borderBottomColor: theme.border, marginTop: spacing.md}]}
            onPress={() => void transfer(TEAM_ROTATION_SENTINEL)}>
            <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
              Enviar ao rodízio de equipes
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={listData}
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
