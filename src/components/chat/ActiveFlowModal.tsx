import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {Bot, Pause, Settings, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand, radii, spacing, typography} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import {pauseFlow} from '../../services/chatActions';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';
import {FlowSessionEditModal} from './FlowSessionEditModal';

type Props = {
  visible: boolean;
  organizationId: string;
  chatId: string;
  flowSessionId: string;
  flowName?: string | null;
  onClose: () => void;
  onPaused?: () => void;
};

export function ActiveFlowModal({
  visible,
  organizationId,
  chatId,
  flowSessionId,
  flowName: flowNameProp,
  onClose,
  onPaused,
}: Props) {
  const {colors: theme} = useTheme();
  const [pausing, setPausing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [flowName, setFlowName] = useState(flowNameProp || '');

  useEffect(() => {
    if (!visible) {
      setEditOpen(false);
      setPausing(false);
      return;
    }
    setFlowName(flowNameProp || '');
    if (flowNameProp || !flowSessionId) return;

    void supabase
      .from('flow_sessions')
      .select('flows:bot_id(name)')
      .eq('id', flowSessionId)
      .maybeSingle()
      .then(({data}) => {
        const flows = data?.flows as
          | {name?: string}
          | Array<{name?: string}>
          | null
          | undefined;
        const name = Array.isArray(flows) ? flows[0]?.name : flows?.name;
        if (name) setFlowName(name);
      });
  }, [visible, flowSessionId, flowNameProp]);

  const handlePause = async () => {
    if (pausing) return;
    setPausing(true);
    try {
      await pauseFlow(organizationId, chatId);
      onPaused?.();
      onClose();
    } catch (e) {
      Alert.alert(
        'Erro',
        e instanceof Error ? e.message : 'Não foi possível pausar o fluxo',
      );
    } finally {
      setPausing(false);
    }
  };

  return (
    <>
      <ChatSheetModal visible={visible && !editOpen} onClose={onClose}>
        <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
          <Text style={[chatModalStyles.title, {color: theme.label}]}>
            Fluxo ativo
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={22} color={theme.secondaryLabel} />
          </TouchableOpacity>
        </View>

        <View style={chatModalStyles.body}>
          <View
            style={[
              styles.banner,
              {
                backgroundColor: brand.amberSoft,
                borderColor: theme.borderPinned,
              },
            ]}>
            <Bot size={20} color={brand.amber} />
            <Text style={[styles.bannerText, {color: theme.label}]}>
              {flowName
                ? `Fluxo ativo: ${flowName}`
                : 'Há um fluxo em execução neste chat'}
            </Text>
          </View>

          <Text style={[styles.hint, {color: theme.secondaryLabel}]}>
            Você pode editar a sessão do fluxo ou pausá-lo para atender
            manualmente.
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, {backgroundColor: brand.blue}]}
              onPress={() => setEditOpen(true)}
              disabled={pausing}>
              <Settings size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Editar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.btnPause,
                {
                  borderColor: theme.borderPinned,
                  backgroundColor: brand.amberSoft,
                },
              ]}
              onPress={() => void handlePause()}
              disabled={pausing}>
              {pausing ? (
                <ActivityIndicator color={brand.amber} />
              ) : (
                <>
                  <Pause size={18} color={brand.amber} />
                  <Text style={[styles.btnText, {color: brand.amber}]}>
                    Pausar
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ChatSheetModal>

      <FlowSessionEditModal
        visible={editOpen}
        flowSessionId={flowSessionId}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
    fontSize: typography.subhead,
    fontWeight: '600',
  },
  hint: {
    fontSize: typography.footnote,
    lineHeight: 18,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnPause: {
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: typography.callout,
    fontWeight: '700',
  },
});
