import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {Save, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type FlowVariable = {
  id: string;
  name: string;
  type: string;
  value: string;
};

type FlowNode = {
  id: string;
  type?: string;
  data?: {label?: string};
};

type FlowSession = {
  id: string;
  current_node_id: string | null;
  timeout_at: string | null;
  variables: FlowVariable[];
  flows?: {
    id: string;
    name: string;
    nodes: FlowNode[];
  } | null;
};

type Props = {
  visible: boolean;
  flowSessionId: string;
  onClose: () => void;
  onSessionUpdated?: () => void;
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const utcDate = new Date(iso);
  const local = new Date(
    utcDate.getTime() - utcDate.getTimezoneOffset() * 60000,
  );
  return local.toISOString().slice(0, 16);
}

export function FlowSessionEditModal({
  visible,
  flowSessionId,
  onClose,
  onSessionUpdated,
}: Props) {
  const {colors: theme} = useTheme();
  const [session, setSession] = useState<FlowSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timeoutAt, setTimeoutAt] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [editingVarId, setEditingVarId] = useState<string | null>(null);
  const [editingVarValue, setEditingVarValue] = useState('');

  const loadSession = useCallback(async () => {
    if (!flowSessionId) return;
    setLoading(true);
    try {
      const {data, error} = await supabase
        .from('flow_sessions')
        .select(
          `
          id,
          current_node_id,
          timeout_at,
          variables,
          flows:bot_id (
            id,
            name,
            nodes
          )
        `,
        )
        .eq('id', flowSessionId)
        .single();

      if (error) throw error;

      const flowsRaw = data.flows;
      const flows = Array.isArray(flowsRaw) ? flowsRaw[0] : flowsRaw;
      const next: FlowSession = {
        id: data.id,
        current_node_id: data.current_node_id,
        timeout_at: data.timeout_at,
        variables: Array.isArray(data.variables)
          ? (data.variables as FlowVariable[])
          : [],
        flows: flows as FlowSession['flows'],
      };
      setSession(next);
      setTimeoutAt(toLocalInputValue(data.timeout_at));
      setSelectedNodeId(data.current_node_id || '');
    } catch (e) {
      console.error('[FlowSessionEditModal] load failed', e);
      Alert.alert('Erro', 'Não foi possível carregar a sessão do fluxo.');
    } finally {
      setLoading(false);
    }
  }, [flowSessionId]);

  useEffect(() => {
    if (visible && flowSessionId) {
      void loadSession();
      setEditingVarId(null);
    }
  }, [visible, flowSessionId, loadSession]);

  const nodes = useMemo(() => {
    const list = session?.flows?.nodes || [];
    return list
      .filter(n => n.type !== 'group')
      .sort((a, b) =>
        String(a.data?.label || a.id).localeCompare(
          String(b.data?.label || b.id),
        ),
      );
  }, [session?.flows?.nodes]);

  const saveTimeout = async () => {
    if (!session) return;
    setSaving(true);
    try {
      let timeoutValue: string | null = null;
      if (timeoutAt.trim()) {
        const normalized = timeoutAt.includes('T')
          ? timeoutAt
          : timeoutAt.replace(' ', 'T');
        const d = new Date(normalized);
        if (Number.isNaN(d.getTime())) {
          Alert.alert('Erro', 'Data inválida. Use AAAA-MM-DDTHH:mm');
          return;
        }
        timeoutValue = d.toISOString();
      }
      const {error} = await supabase
        .from('flow_sessions')
        .update({timeout_at: timeoutValue})
        .eq('id', flowSessionId);
      if (error) throw error;
      setSession(prev => (prev ? {...prev, timeout_at: timeoutValue} : prev));
      onSessionUpdated?.();
      Alert.alert('Ok', 'Timeout atualizado');
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o timeout');
    } finally {
      setSaving(false);
    }
  };

  const saveNode = async () => {
    if (!session || !selectedNodeId) return;
    setSaving(true);
    try {
      const {error} = await supabase
        .from('flow_sessions')
        .update({current_node_id: selectedNodeId})
        .eq('id', flowSessionId);
      if (error) throw error;
      setSession(prev =>
        prev ? {...prev, current_node_id: selectedNodeId} : prev,
      );
      onSessionUpdated?.();
      Alert.alert('Ok', 'Nó atual atualizado');
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o nó');
    } finally {
      setSaving(false);
    }
  };

  const saveVariable = async () => {
    if (!session || !editingVarId) return;
    setSaving(true);
    try {
      const updated = session.variables.map(v =>
        v.id === editingVarId ? {...v, value: editingVarValue} : v,
      );
      const {error} = await supabase
        .from('flow_sessions')
        .update({variables: updated})
        .eq('id', flowSessionId);
      if (error) throw error;
      setSession(prev => (prev ? {...prev, variables: updated} : prev));
      setEditingVarId(null);
      onSessionUpdated?.();
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar a variável');
    } finally {
      setSaving(false);
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
          Editar sessão
          {session?.flows?.name ? ` — ${session.flows.name}` : ''}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <X size={22} color={theme.secondaryLabel} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={chatModalStyles.scroll}
        contentContainerStyle={chatModalStyles.body}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        bounces>
              {loading ? (
                <ActivityIndicator
                  color={brand.blue}
                  style={{marginVertical: spacing.xl}}
                />
              ) : !session ? (
                <Text
                  style={[
                    chatModalStyles.empty,
                    {color: theme.secondaryLabel},
                  ]}>
                  Sessão não encontrada.
                </Text>
              ) : (
                <>
                  <Text style={[styles.sectionLabel, {color: theme.secondaryLabel}]}>
                    Nó atual
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.nodeRow}>
                    {nodes.map(node => {
                      const selected = selectedNodeId === node.id;
                      return (
                        <TouchableOpacity
                          key={node.id}
                          onPress={() => setSelectedNodeId(node.id)}
                          style={[
                            styles.nodeChip,
                            {
                              backgroundColor: selected
                                ? brand.blueSoft
                                : theme.fill,
                              borderColor: selected ? brand.blue : theme.border,
                            },
                          ]}>
                          <Text
                            style={{
                              color: selected ? brand.blue : theme.label,
                              fontSize: 13,
                              fontWeight: '600',
                            }}
                            numberOfLines={1}>
                            {node.data?.label || node.id.slice(0, 8)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor: brand.blue}]}
                    onPress={() => void saveNode()}
                    disabled={saving}>
                    <Save size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Salvar nó</Text>
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.sectionLabel,
                      {color: theme.secondaryLabel, marginTop: spacing.lg},
                    ]}>
                    Timeout (AAAA-MM-DDTHH:mm)
                  </Text>
                  <TextInput
                    value={timeoutAt}
                    onChangeText={setTimeoutAt}
                    placeholder="2026-07-29T15:30"
                    placeholderTextColor={theme.tertiaryLabel}
                    style={[
                      chatModalStyles.input,
                      {
                        color: theme.label,
                        backgroundColor: theme.inputBg,
                        borderColor: theme.border,
                      },
                    ]}
                  />
                  <TouchableOpacity
                    style={[styles.saveBtn, {backgroundColor: brand.blue}]}
                    onPress={() => void saveTimeout()}
                    disabled={saving}>
                    <Save size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Salvar timeout</Text>
                  </TouchableOpacity>

                  <Text
                    style={[
                      styles.sectionLabel,
                      {color: theme.secondaryLabel, marginTop: spacing.lg},
                    ]}>
                    Variáveis
                  </Text>
                  {session.variables.length === 0 ? (
                    <Text style={{color: theme.tertiaryLabel, fontSize: 13}}>
                      Nenhuma variável nesta sessão.
                    </Text>
                  ) : (
                    session.variables.map(variable => (
                      <View
                        key={variable.id}
                        style={[
                          styles.varCard,
                          {
                            backgroundColor: theme.fill,
                            borderColor: theme.border,
                          },
                        ]}>
                        <Text style={[styles.varName, {color: theme.label}]}>
                          {variable.name}
                          <Text style={{color: theme.tertiaryLabel}}>
                            {' '}
                            ({variable.type})
                          </Text>
                        </Text>
                        {editingVarId === variable.id ? (
                          <>
                            <TextInput
                              value={editingVarValue}
                              onChangeText={setEditingVarValue}
                              style={[
                                chatModalStyles.input,
                                {
                                  color: theme.label,
                                  backgroundColor: theme.card,
                                  borderColor: theme.border,
                                  marginBottom: spacing.sm,
                                },
                              ]}
                              multiline
                            />
                            <View style={styles.varActions}>
                              <TouchableOpacity
                                onPress={() => setEditingVarId(null)}>
                                <Text style={{color: theme.secondaryLabel}}>
                                  Cancelar
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => void saveVariable()}
                                disabled={saving}>
                                <Text
                                  style={{color: brand.blue, fontWeight: '700'}}>
                                  Salvar
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        ) : (
                          <TouchableOpacity
                            onPress={() => {
                              setEditingVarId(variable.id);
                              setEditingVarValue(variable.value || '');
                            }}>
                            <Text
                              style={{color: theme.secondaryLabel}}
                              numberOfLines={2}>
                              {variable.value || '—'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </>
              )}
      </ScrollView>
    </ChatSheetModal>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: typography.footnote,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  nodeRow: {
    gap: 8,
    paddingBottom: spacing.sm,
  },
  nodeChip: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 180,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radii.md,
    paddingVertical: 12,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: typography.callout,
  },
  varCard: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  varName: {
    fontSize: typography.subhead,
    fontWeight: '600',
    marginBottom: 4,
  },
  varActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
});
