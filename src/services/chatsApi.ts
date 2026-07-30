import {supabase} from '../lib/supabase';
import env from '../config/env';
import {
  applyQuickFilterCriteria,
  buildChatRpcParams,
  emptyFilterInput,
  type ChatFilterRpcInput,
} from '../utils/chatFilterRpc';

export interface ChatLastMessage {
  content?: string | null;
  status?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  sender_type?: string | null;
  type?: string | null;
  reaction?: string | null;
  message_type?: string | null;
  message_content?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChatListTag {
  tag_id?: string;
  tags?: {
    id?: string;
    name?: string;
    color?: string;
  } | null;
}

export interface ChatListCustomer {
  id?: string;
  name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  profile_picture?: string | null;
  is_spam?: boolean | null;
  stage_id?: string | null;
  tags?: ChatListTag[] | null;
  stage?: {
    id?: string;
    name?: string | null;
    color?: string | null;
    funnel_id?: string | null;
  } | null;
}

export interface ChatListItem {
  id: string;
  status?: 'pending' | 'in_progress' | 'closed' | 'await_closing' | string | null;
  /** RPC v6: `type` (individual | internal_group | ...) */
  type?: string | null;
  chat_type?: string | null;
  unread_count?: number | null;
  last_message_at?: string | null;
  last_customer_message_at?: string | null;
  created_at?: string | null;
  last_message?: ChatLastMessage | null;
  metadata?: {
    last_message?: ChatLastMessage | null;
    channel_name?: string | null;
    archived?: boolean;
    [key: string]: unknown;
  } | null;
  customer?: ChatListCustomer | null;
  group_name?: string | null;
  group_avatar_url?: string | null;
  profile_picture?: string | null;
  assigned_to?: string | null;
  is_fixed?: boolean | null;
  is_archived?: boolean | null;
  external_id?: string | null;
  external_id_send?: string | null;
  flow_session_id?: string | null;
  ticket_number?: string | number | null;
  channel_id?: string | null;
  channel?: {
    id?: string | null;
    name?: string | null;
    type?: string | null;
    is_connected?: boolean | null;
  } | null;
  channel_details?: {
    id?: string | null;
    name?: string | null;
    type?: string | null;
  } | null;
  team?: {id?: string; name?: string | null} | null;
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  content?: string | null;
  type?: string | null;
  created_at?: string | null;
  status?: string | null;
  sender_type?: 'customer' | 'agent' | 'system' | string | null;
  sent_from_system?: boolean | null;
  sender_agent_id?: string | null;
  sender_agent?: {id?: string; full_name?: string | null} | null;
  metadata?: Record<string, unknown> | null;
  response_to?: {
    id?: string;
    content?: string | null;
    type?: string | null;
    sender_type?: string | null;
  } | null;
  attachments?: Array<{
    url?: string;
    type?: string;
    name?: string;
    file_name?: string;
    mime_type?: string | null;
    preview_url?: string;
    width?: number | null;
    height?: number | null;
  }> | null;
  [key: string]: unknown;
}

const PAGE_SIZE = 20;

export async function fetchChatsPage(input: ChatFilterRpcInput) {
  const rpcParams = buildChatRpcParams(input);
  const {data, error} = await supabase.rpc('get_chats_optimized_full_v6', rpcParams);
  if (error) throw error;
  return (data || []) as ChatListItem[];
}

export async function fetchChatCount(input: ChatFilterRpcInput) {
  const params = buildChatRpcParams({...input, pageSize: undefined, offset: undefined});
  delete params.p_page_size;
  delete params.p_offset;
  delete params.p_order_by;
  delete params.p_order_direction;
  const {data, error} = await supabase.rpc('get_chat_count_by_filter_v4', params);
  if (error) throw error;
  return typeof data === 'number' ? data : Number(data) || 0;
}

export async function fetchBatchFilterCounts(
  organizationId: string,
  userId: string,
  filters: Array<{
    id: string;
    showCount?: boolean;
    filters?: Record<string, unknown>;
    isDefault?: boolean;
    isCustom?: boolean;
  }>,
) {
  // Só filtros com showCount na config de filtros rápidos (geralmente ~4)
  const payload = filters
    .filter(f => f.showCount)
    .map(f => {
      const input = applyQuickFilterCriteria(
        emptyFilterInput(organizationId, userId, f.id),
        f.id,
        f.filters,
        {isDefault: f.isDefault, isCustom: f.isCustom},
      );
      const params = buildChatRpcParams(input);
      return {
        id: f.id,
        status: params.p_status,
        assigned_to: params.p_assigned_to,
        team_ids: params.p_team_ids,
        channel_id: params.p_channel_id,
        show_unread_only: params.p_show_unread_only,
        is_spam: params.p_is_spam,
        is_collaborating: params.p_is_collaborating,
        include_collaborating: params.p_include_collaborating,
        exclude_fixed: params.p_exclude_fixed,
        exclude_self: params.p_exclude_self,
        chat_types: params.p_chat_types,
        tag_ids: params.p_tag_ids,
        stage_ids: params.p_stage_ids,
        funnel_id: params.p_funnel_id,
        automation_filter: params.p_automation_filter,
      };
    });

  if (payload.length === 0) return {} as Record<string, number>;

  const {data, error} = await supabase.rpc('get_chat_counts_by_filters_v1', {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_filters: payload,
  });
  if (error) throw error;

  const result: Record<string, number> = {};
  if (Array.isArray(data)) {
    for (const row of data as Array<{
      id?: string;
      filter_id?: string;
      count?: number | string;
      total?: number | string;
    }>) {
      // RPC web usa filter_id; aceitar id também
      const key = row?.filter_id ?? row?.id;
      if (key == null) continue;
      result[String(key)] = Number(row.count ?? row.total ?? 0);
    }
  } else if (data && typeof data === 'object') {
    Object.assign(result, data as Record<string, number>);
  }
  return result;
}

export type FetchMessagesResult = {
  data: ChatMessage[];
  pagination: {
    has_more: boolean;
    next_before: string | null;
    limit: number;
  };
};

/**
 * Lista mensagens via backend (Postgres). Newest-first (desc).
 * Ideal para FlatList inverted: index 0 = mais nova.
 */
export async function fetchMessages(
  chatId: string,
  organizationId: string,
  limit = 40,
  before?: string,
): Promise<FetchMessagesResult> {
  const {data: sessionData} = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sem sessão');
  if (!organizationId) throw new Error('organizationId é obrigatório');

  const params = new URLSearchParams({limit: String(limit)});
  if (before) params.set('before', before);

  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/messages?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );

  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: ChatMessage[];
    pagination?: {
      has_more?: boolean;
      next_before?: string | null;
      limit?: number;
    };
    error?: string;
  };

  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao listar mensagens (${response.status})`);
  }

  const data = (json.data || []) as ChatMessage[];
  return {
    data,
    pagination: {
      has_more:
        typeof json.pagination?.has_more === 'boolean'
          ? json.pagination.has_more
          : data.length >= limit,
      next_before: json.pagination?.next_before ?? null,
      limit: json.pagination?.limit ?? limit,
    },
  };
}

export type ChatAttachmentInput = {
  uri: string;
  type: string;
  name: string;
};

export type SendChatMessageOptions = {
  replyToMessageId?: string;
  type?: string;
  signMessage?: boolean;
  attachments?: ChatAttachmentInput[];
  /** ISO datetime — agenda envio (igual web). */
  scheduledFor?: string;
};

export async function sendChatMessage(
  chatId: string,
  content: string,
  organizationId: string,
  options?: SendChatMessageOptions,
) {
  const {data: sessionData} = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sem sessão');

  const formData = new FormData();
  formData.append('content', content);
  formData.append('type', options?.type || 'text');
  formData.append(
    'signMessage',
    options?.signMessage === false ? 'false' : 'true',
  );
  if (options?.replyToMessageId) {
    formData.append('replyToMessageId', options.replyToMessageId);
  }
  if (options?.scheduledFor) {
    formData.append('scheduledFor', options.scheduledFor);
  }

  if (options?.attachments?.length) {
    for (const file of options.attachments) {
      formData.append('attachments', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      } as unknown as Blob);
    }
  }

  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
  );

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao enviar (${response.status})`);
  }
  return json as {success?: boolean; messageId?: string};
}

/** @deprecated use sendChatMessage */
export async function sendTextMessage(
  chatId: string,
  content: string,
  organizationId: string,
  options?: {replyToMessageId?: string},
) {
  return sendChatMessage(chatId, content, organizationId, options);
}

export async function fetchChatById(chatId: string) {
  const {data, error} = await supabase
    .from('chats')
    .select('id, status, chat_type, customer_id, assigned_to, organization_id, name, group_name')
    .eq('id', chatId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ChatThreadBootstrap = {
  chat: ChatListItem & {
    customer?: ChatListCustomer | null;
    channel_details?: ChatListItem['channel'];
    group_name?: string | null;
    [key: string]: unknown;
  };
  messages: ChatMessage[];
  pinned: Array<Record<string, unknown>>;
  scheduled: ChatMessage[];
  pagination: {
    has_more: boolean;
    next_before: string | null;
    limit: number;
  };
};

/**
 * Bootstrap da thread: chat + messages (pág. 1) + pinned + scheduled.
 * GET /api/:orgId/chat/:chatId
 */
export async function fetchChatThreadBootstrap(
  chatId: string,
  organizationId: string,
  limit = 40,
): Promise<ChatThreadBootstrap> {
  const {data: sessionData} = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sem sessão');
  if (!organizationId) throw new Error('organizationId é obrigatório');

  const params = new URLSearchParams({limit: String(limit)});

  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
  );

  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    chat?: ChatThreadBootstrap['chat'];
    messages?: ChatMessage[];
    pinned?: Array<Record<string, unknown>>;
    scheduled?: ChatMessage[];
    pagination?: {
      has_more?: boolean;
      next_before?: string | null;
      limit?: number;
    };
    error?: string;
  };

  if (!response.ok || json?.success === false || !json.chat) {
    throw new Error(json?.error || `Falha ao carregar conversa (${response.status})`);
  }

  const messages = (json.messages || []) as ChatMessage[];
  return {
    chat: json.chat,
    messages,
    pinned: json.pinned || [],
    scheduled: (json.scheduled || []) as ChatMessage[],
    pagination: {
      has_more:
        typeof json.pagination?.has_more === 'boolean'
          ? json.pagination.has_more
          : messages.length >= limit,
      next_before: json.pagination?.next_before ?? null,
      limit: json.pagination?.limit ?? limit,
    },
  };
}

export {PAGE_SIZE};
