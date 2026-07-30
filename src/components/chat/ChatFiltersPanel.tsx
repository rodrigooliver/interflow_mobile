import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import {X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {brand} from '../../theme/tokens';
import {
  emptyFilterInput,
  type ChatFilterRpcInput,
} from '../../utils/chatFilterRpc';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type Props = {
  visible: boolean;
  value: ChatFilterRpcInput;
  onChange: (next: ChatFilterRpcInput) => void;
  onClose: () => void;
  onApply: () => void;
};

const STATUS_OPTIONS = [
  {id: 'pending', label: 'Pendente'},
  {id: 'in_progress', label: 'Em atendimento'},
  {id: 'await_closing', label: 'Aguardando encerramento'},
  {id: 'closed', label: 'Encerrado'},
] as const;

const SPAM_OPTIONS = [
  {id: '', label: 'Todos'},
  {id: 'not_spam', label: 'Sem spam'},
  {id: 'spam', label: 'Spam'},
] as const;

const COLLAB_OPTIONS = [
  {id: '', label: 'Qualquer'},
  {id: 'yes', label: 'Colaborando'},
  {id: 'no', label: 'Não colaborando'},
  {id: 'include', label: 'Incluir colaborando'},
] as const;

export function ChatFiltersPanel({
  visible,
  value,
  onChange,
  onClose,
  onApply,
}: Props) {
  const {colors: theme} = useTheme();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const toggleStatus = (status: string) => {
    setDraft(prev => {
      const set = new Set(prev.selectedStatuses);
      if (set.has(status)) set.delete(status);
      else set.add(status);
      return {...prev, selectedStatuses: Array.from(set)};
    });
  };

  const resetDraft = () => {
    setDraft(
      emptyFilterInput(value.organizationId, value.userId, value.selectedFilter),
    );
  };

  const chipSelected = useMemo(
    () => ({
      bg: brand.blueSoft,
      border: brand.blue,
      text: brand.blue,
    }),
    [],
  );

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="94%"
      minHeight="88%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        <Text style={[chatModalStyles.title, {color: theme.label}]}>
          Filtros avançados
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
        bounces
        alwaysBounceVertical>
              <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                Status
              </Text>
              <View style={chatModalStyles.chipRow}>
                {STATUS_OPTIONS.map(opt => {
                  const selected = draft.selectedStatuses.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        chatModalStyles.chip,
                        {
                          backgroundColor: selected ? chipSelected.bg : theme.fill,
                          borderColor: selected ? chipSelected.border : theme.border,
                        },
                      ]}
                      onPress={() => toggleStatus(opt.id)}>
                      <Text
                        style={[
                          chatModalStyles.chipText,
                          {color: selected ? chipSelected.text : theme.label},
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                Spam
              </Text>
              <View style={chatModalStyles.chipRow}>
                {SPAM_OPTIONS.map(opt => {
                  const selected = draft.selectedSpamFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id || 'all'}
                      style={[
                        chatModalStyles.chip,
                        {
                          backgroundColor: selected ? chipSelected.bg : theme.fill,
                          borderColor: selected ? chipSelected.border : theme.border,
                        },
                      ]}
                      onPress={() =>
                        setDraft(prev => ({...prev, selectedSpamFilter: opt.id}))
                      }>
                      <Text
                        style={[
                          chatModalStyles.chipText,
                          {color: selected ? chipSelected.text : theme.label},
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[chatModalStyles.label, {color: theme.secondaryLabel}]}>
                Colaboração
              </Text>
              <View style={chatModalStyles.chipRow}>
                {COLLAB_OPTIONS.map(opt => {
                  const selected = draft.isCollaboratingFilter === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id || 'any'}
                      style={[
                        chatModalStyles.chip,
                        {
                          backgroundColor: selected ? chipSelected.bg : theme.fill,
                          borderColor: selected ? chipSelected.border : theme.border,
                        },
                      ]}
                      onPress={() =>
                        setDraft(prev => ({
                          ...prev,
                          isCollaboratingFilter: opt.id,
                        }))
                      }>
                      <Text
                        style={[
                          chatModalStyles.chipText,
                          {color: selected ? chipSelected.text : theme.label},
                        ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <FilterToggle
                label="Somente não lidos"
                value={draft.showUnreadOnly}
                onChange={next =>
                  setDraft(prev => ({...prev, showUnreadOnly: next}))
                }
                theme={theme}
              />
              <FilterToggle
                label="Mostrar arquivados"
                value={draft.showArchived}
                onChange={next =>
                  setDraft(prev => ({...prev, showArchived: next}))
                }
                theme={theme}
              />
      </ScrollView>

      <View style={chatModalStyles.footer}>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: theme.fill}]}
          onPress={resetDraft}>
          <Text style={[chatModalStyles.footerBtnText, {color: theme.label}]}>
            Resetar
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[chatModalStyles.footerBtn, {backgroundColor: brand.blue}]}
          onPress={() => {
            onChange(draft);
            onApply();
            onClose();
          }}>
          <Text style={[chatModalStyles.footerBtnText, {color: '#fff'}]}>
            Aplicar
          </Text>
        </TouchableOpacity>
      </View>
    </ChatSheetModal>
  );
}

function FilterToggle({
  label,
  value,
  onChange,
  theme,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  theme: {label: string; secondaryLabel: string};
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
      <Text style={{color: theme.label, fontSize: 16}}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{false: '#D1D5DB', true: brand.blueSoft}}
        thumbColor={value ? brand.blue : '#F9FAFB'}
      />
    </View>
  );
}
