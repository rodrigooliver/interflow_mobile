import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {ArrowLeft, Search, X} from 'lucide-react-native';
import {useTheme} from '../../contexts/ThemeContext';
import {useI18n} from '../../contexts/I18nContext';
import {brand, spacing} from '../../theme/tokens';
import {supabase} from '../../lib/supabase';
import env from '../../config/env';
import {ChannelIcon} from '../ChannelIcon';
import {chatModalStyles} from './chatModalStyles';
import {ChatSheetModal} from './ChatSheetModal';

type CustomerContact = {
  type: string;
  value: string;
  label?: string | null;
};

type SearchCustomer = {
  id: string;
  name: string;
  contacts: CustomerContact[];
  whatsapp?: string | null;
  email?: string | null;
};

type ChannelRow = {
  id: string;
  name?: string | null;
  type?: string | null;
  is_connected?: boolean | null;
  status?: string | null;
};

type Props = {
  visible: boolean;
  organizationId: string;
  onClose: () => void;
  onChatReady: (chatId: string, title?: string) => void;
};

async function searchCustomersRpc(
  organizationId: string,
  query: string,
): Promise<SearchCustomer[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rpcArgsList: Record<string, unknown>[] = [
    {
      p_organization_id: organizationId,
      p_search_query: trimmed,
      p_limit: 20,
      p_offset: 0,
    },
    {
      p_organization_id: organizationId,
      p_search: trimmed,
      p_limit: 20,
    },
  ];

  for (const args of rpcArgsList) {
    const {data, error} = await supabase.rpc('search_customers', args);
    if (!error && Array.isArray(data)) {
      return (data as Array<Record<string, unknown>>).map(row => ({
        id: String(row.id),
        name: String(row.name || ''),
        contacts: Array.isArray(row.contacts)
          ? (row.contacts as CustomerContact[])
          : [],
        whatsapp: (row.whatsapp as string | null) ?? null,
        email: (row.email as string | null) ?? null,
      }));
    }
  }

  const {data, error} = await supabase
    .from('customers')
    .select('id, name, whatsapp, email')
    .eq('organization_id', organizationId)
    .or(`name.ilike.%${trimmed}%,whatsapp.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
    .limit(20);

  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    name: row.name || '',
    contacts: [],
    whatsapp: row.whatsapp,
    email: row.email,
  }));
}

async function loadCustomerContacts(
  customerId: string,
): Promise<CustomerContact[]> {
  const {data, error} = await supabase
    .from('customer_contacts')
    .select('type, value, label')
    .eq('customer_id', customerId);
  if (error) return [];
  return (data || []) as CustomerContact[];
}

async function loadOrgChannels(organizationId: string): Promise<ChannelRow[]> {
  const {data, error} = await supabase
    .from('chat_channels')
    .select('id, name, type, is_connected, status')
    .eq('organization_id', organizationId)
    .eq('status', 'active');

  if (!error && data?.length) {
    return (data as ChannelRow[]).filter(c => c.is_connected !== false);
  }

  const fallback = await supabase
    .from('channels')
    .select('id, name, type, is_connected')
    .eq('organization_id', organizationId)
    .eq('is_connected', true);

  if (fallback.error) throw fallback.error;
  return (fallback.data || []) as ChannelRow[];
}

function detectContactType(value: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'email';
  return 'whatsapp';
}

function customerContacts(customer: SearchCustomer): CustomerContact[] {
  const fromRpc = customer.contacts || [];
  const extras: CustomerContact[] = [];
  if (customer.whatsapp?.trim()) {
    extras.push({type: 'whatsapp', value: customer.whatsapp.trim()});
  }
  if (customer.email?.trim()) {
    extras.push({type: 'email', value: customer.email.trim()});
  }
  const merged = [...fromRpc, ...extras];
  const seen = new Set<string>();
  return merged.filter(c => {
    const key = `${c.type}:${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !!c.value?.trim();
  });
}

async function createChat(
  organizationId: string,
  payload: {
    customerId: string;
    customerName: string;
    channelId: string;
    contactType: string;
    contactValue: string;
  },
): Promise<string> {
  const {data: sessionData} = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sem sessão');

  const body = {
    customerId: payload.customerId,
    customerName: payload.customerName,
    channelId: payload.channelId,
    contactType: payload.contactType,
    contactValue: payload.contactValue,
  };

  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    chatId?: string;
    error?: string;
  };

  if (!response.ok || json.success === false || !json.chatId) {
    throw new Error(json.error || `Falha ao criar chat (${response.status})`);
  }

  return json.chatId;
}

export function StartChatModal({
  visible,
  organizationId,
  onClose,
  onChatReady,
}: Props) {
  const {colors: theme} = useTheme();
  const {t} = useI18n();
  const [step, setStep] = useState<'customer' | 'channel'>('customer');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<SearchCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SearchCustomer | null>(
    null,
  );
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setStep('customer');
    setSearch('');
    setCustomers([]);
    setSelectedCustomer(null);
    setContacts([]);
    setChannels([]);
    setError('');
    setSearching(false);
    setLoadingChannels(false);
    setCreating(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
  }, [visible, reset]);

  useEffect(() => {
    if (!visible || step !== 'customer') return;
    const timer = setTimeout(async () => {
      if (search.trim().length < 2) {
        setCustomers([]);
        return;
      }
      setSearching(true);
      setError('');
      try {
        const rows = await searchCustomersRpc(organizationId, search);
        setCustomers(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.chats.loadError);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, visible, step, organizationId, t.chats.loadError]);

  const pickCustomer = async (customer: SearchCustomer) => {
    setSelectedCustomer(customer);
    setStep('channel');
    setError('');
    setLoadingChannels(true);
    try {
      const [loadedContacts, loadedChannels] = await Promise.all([
        loadCustomerContacts(customer.id),
        loadOrgChannels(organizationId),
      ]);
      const mergedContacts = customerContacts({
        ...customer,
        contacts: loadedContacts.length ? loadedContacts : customer.contacts,
      });
      setContacts(mergedContacts);
      setChannels(loadedChannels);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.chats.loadError);
    } finally {
      setLoadingChannels(false);
    }
  };

  const pickChannel = async (channel: ChannelRow, contact?: CustomerContact) => {
    if (!selectedCustomer) return;
    const contactType = contact?.type || detectContactType(contact?.value || '');
    const contactValue =
      contact?.value?.trim() ||
      selectedCustomer.whatsapp?.trim() ||
      selectedCustomer.email?.trim() ||
      '';

    if (!contactValue) {
      Alert.alert(t.thread.errorTitle, 'Cliente sem contato válido.');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const chatId = await createChat(organizationId, {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        channelId: channel.id,
        contactType,
        contactValue,
      });
      onChatReady(chatId, selectedCustomer.name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.chats.loadError);
    } finally {
      setCreating(false);
    }
  };

  const title = useMemo(
    () => (step === 'customer' ? t.chats.newChat : 'Selecionar canal'),
    [step, t.chats.newChat],
  );

  return (
    <ChatSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="94%"
      minHeight="75%">
      <View style={[chatModalStyles.header, {borderBottomColor: theme.border}]}>
        {step === 'channel' ? (
          <TouchableOpacity
            onPress={() => {
              setStep('customer');
              setSelectedCustomer(null);
            }}
            hitSlop={10}
            style={{marginRight: spacing.sm}}>
            <ArrowLeft size={22} color={theme.label} />
          </TouchableOpacity>
        ) : null}
        <Text style={[chatModalStyles.title, {color: theme.label}]}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <X size={22} color={theme.tertiaryLabel} />
        </TouchableOpacity>
      </View>

      {error ? (
        <Text
          style={[
            chatModalStyles.error,
            {color: '#EF4444', paddingHorizontal: spacing.lg},
          ]}>
          {error}
        </Text>
      ) : null}

      {step === 'customer' ? (
        <>
          <View style={{paddingHorizontal: spacing.lg, paddingTop: spacing.md}}>
            <View
              style={[
                styles.searchWrap,
                {
                  backgroundColor: theme.searchBg,
                  borderColor: theme.border,
                },
              ]}>
              <Search size={18} color={theme.tertiaryLabel} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t.chats.search}
                placeholderTextColor={theme.tertiaryLabel}
                style={[styles.searchInput, {color: theme.label}]}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
          {searching ? (
            <ActivityIndicator
              color={brand.blue}
              style={{marginTop: spacing.lg}}
            />
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
                search.trim().length >= 2 ? (
                  <Text
                    style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
                    Nenhum cliente encontrado
                  </Text>
                ) : (
                  <Text
                    style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
                    Digite ao menos 2 caracteres
                  </Text>
                )
              }
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
                  onPress={() => void pickCustomer(item)}>
                  <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : (
        <>
          {selectedCustomer ? (
            <Text
              style={{
                paddingHorizontal: spacing.lg,
                paddingTop: spacing.sm,
                color: theme.secondaryLabel,
              }}>
              {selectedCustomer.name}
            </Text>
          ) : null}
          {loadingChannels || creating ? (
            <ActivityIndicator
              color={brand.blue}
              style={{marginTop: spacing.xl}}
            />
          ) : (
            <FlatList
              data={channels}
              keyExtractor={item => item.id}
              style={chatModalStyles.scroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              bounces
              ListHeaderComponent={
                contacts.length ? (
                  <View
                    style={{paddingHorizontal: spacing.lg, paddingTop: spacing.md}}>
                    <Text
                      style={[
                        chatModalStyles.label,
                        {color: theme.secondaryLabel},
                      ]}>
                      Contatos do cliente
                    </Text>
                    {contacts.map(contact => (
                      <Text
                        key={`${contact.type}:${contact.value}`}
                        style={{
                          color: theme.secondaryLabel,
                          marginBottom: spacing.xs,
                        }}>
                        {contact.type}: {contact.value}
                      </Text>
                    ))}
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <Text style={[chatModalStyles.empty, {color: theme.secondaryLabel}]}>
                  Nenhum canal conectado
                </Text>
              }
              renderItem={({item}) => (
                <TouchableOpacity
                  style={[chatModalStyles.row, {borderBottomColor: theme.border}]}
                  disabled={creating}
                  onPress={() =>
                    void pickChannel(
                      item,
                      contacts[0] ||
                        (selectedCustomer?.whatsapp
                          ? {
                              type: 'whatsapp',
                              value: selectedCustomer.whatsapp,
                            }
                          : undefined),
                    )
                  }>
                  <ChannelIcon type={item.type || 'default'} size={22} />
                  <Text style={[chatModalStyles.rowLabel, {color: theme.label}]}>
                    {item.name || item.type || 'Canal'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </>
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
