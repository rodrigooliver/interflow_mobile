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
import {Play, Search, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {startFlow} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type FlowRow = {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  is_silent?: boolean | null;
  hide_from_quick_start?: boolean | null;
};

type Props = {
  visible: boolean;
  organizationId: string;
  chatId: string;
  onClose: () => void;
  onStarted?: (sessionId?: string) => void;
};

export function FlowPickerModal({
  visible,
  organizationId,
  chatId,
  onClose,
  onStarted,
}: Props) {
  const {colors: theme} = useTheme();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadFlows = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      // Paridade com a web (useFlows + FlowModal): is_active controla os
      // gatilhos automáticos, não a partida manual — não filtrar por ele aqui.
      const {data, error: fetchError} = await supabase
        .from('flows')
        .select('id, name, description, type, is_silent, hide_from_quick_start')
        .eq('organization_id', organizationId)
        .order('name');

      if (fetchError) throw fetchError;

      const visible = (data || []).filter(
        flow =>
          !flow.is_silent &&
          !flow.hide_from_quick_start &&
          (flow.type == null || flow.type === 'general'),
      ) as FlowRow[];

      setFlows(visible);
    } catch (e) {
      console.error('[FlowPickerModal] load failed', e);
      setError('Não foi possível carregar os fluxos.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (visible) {
      void loadFlows();
      setSearch('');
    }
  }, [visible, loadFlows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flows;
    return flows.filter(
      flow =>
        flow.name.toLowerCase().includes(q) ||
        (flow.description || '').toLowerCase().includes(q),
    );
  }, [flows, search]);

  const handleStart = async (flow: FlowRow) => {
    if (startingId) return;
    setStartingId(flow.id);
    try {
      const result = (await startFlow(organizationId, chatId, flow.id)) as {
        session?: {id?: string};
      };
      onStarted?.(result.session?.id);
      onClose();
    } catch (e) {
      console.error('[FlowPickerModal] start failed', e);
      Alert.alert('Erro', 'Não foi possível iniciar o fluxo.');
    } finally {
      setStartingId(null);
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
          Iniciar fluxo
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <X size={22} color={theme.secondaryLabel} />
        </TouchableOpacity>
      </View>

      <View style={{paddingHorizontal: spacing.lg, paddingTop: spacing.md}}>
        <View
          style={[
            styles.searchRow,
            {backgroundColor: theme.searchBg, borderColor: theme.border},
          ]}>
          <Search size={18} color={theme.tertiaryLabel} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar fluxo..."
            placeholderTextColor={theme.tertiaryLabel}
            style={[styles.searchInput, {color: theme.label}]}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator
          color={brand.blue}
          style={{marginVertical: spacing.xl}}
        />
      ) : error ? (
        <Text
          style={[
            chatModalStyles.error,
            {color: '#EF4444', paddingHorizontal: spacing.lg},
          ]}>
          {error}
        </Text>
      ) : filtered.length === 0 ? (
        <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
          {flows.length === 0
            ? 'Nenhum fluxo disponível.'
            : 'Nenhum fluxo encontrado.'}
        </Text>
      ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            style={chatModalStyles.scroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            bounces
            renderItem={({item}) => (
              <TouchableOpacity
                style={[
                  chatModalStyles.actionRow,
                  {borderBottomColor: theme.separator},
                ]}
                onPress={() => void handleStart(item)}
                disabled={startingId != null}>
                <View style={{flex: 1}}>
                  <Text style={[chatModalStyles.actionLabel, {color: theme.label}]}>
                    {item.name}
                  </Text>
                  {item.description ? (
                    <Text
                      style={{color: theme.secondaryLabel, fontSize: 13}}
                      numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {startingId === item.id ? (
                  <ActivityIndicator color={brand.blue} size="small" />
                ) : (
                  <Play size={18} color={brand.blue} />
                )}
              </TouchableOpacity>
            )}
          />
      )}
    </ChatSheetModal>
  );
}

const styles = {
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
};
