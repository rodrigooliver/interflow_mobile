import {Share} from 'react-native';
import {supabase} from '../lib/supabase';
import env from '../config/env';

async function authHeaders(json = true) {
  const {data} = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sem sessão');
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? {'Content-Type': 'application/json'} : {}),
    Accept: 'application/json',
  };
}

/** POST /:orgId/chat/:chatId/message/:messageId/react */
export async function reactToMessage(
  organizationId: string,
  chatId: string,
  messageId: string,
  emoji: string,
) {
  const headers = await authHeaders();
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message/${messageId}/react`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({emoji}),
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    reactions?: Record<string, {reaction: string; created_at?: string}>;
  };
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao reagir (${response.status})`);
  }
  return json;
}

/** DELETE /:orgId/chat/:chatId/message/:messageId */
export async function deleteMessage(
  organizationId: string,
  chatId: string,
  messageId: string,
) {
  const headers = await authHeaders();
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message/${messageId}`,
    {method: 'DELETE', headers},
  );
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao excluir (${response.status})`);
  }
  return json;
}

/** PUT /:orgId/chat/:chatId/message/:messageId */
export async function editMessage(
  organizationId: string,
  chatId: string,
  messageId: string,
  content: string,
) {
  const headers = await authHeaders(false);
  const formData = new FormData();
  formData.append('content', content);
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message/${messageId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: headers.Authorization,
        Accept: 'application/json',
      },
      body: formData,
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao editar (${response.status})`);
  }
  return json;
}

/** Pin mensagem via tabela pinned_messages (igual web). */
export async function pinMessage(
  chatId: string,
  messageId: string,
  comment?: string,
) {
  const {data: sessionData} = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  const {error} = await supabase.from('pinned_messages').insert({
    chat_id: chatId,
    message_id: messageId,
    comment: comment || null,
    pinned_by: userId || null,
  });
  if (error) throw error;
}

export async function unpinMessage(chatId: string, messageId: string) {
  const {error} = await supabase
    .from('pinned_messages')
    .delete()
    .eq('chat_id', chatId)
    .eq('message_id', messageId);
  if (error) throw error;
}

export async function fetchPinnedMessages(chatId: string) {
  const {data, error} = await supabase
    .from('pinned_messages')
    .select('*, message:messages(*)')
    .eq('chat_id', chatId)
    .order('created_at', {ascending: false});
  if (error) throw error;
  return data || [];
}

/** GET /:orgId/chat/:chatId/message/:messageId/webhook-logs */
export async function fetchMessageWebhookLogs(
  organizationId: string,
  chatId: string,
  messageId: string,
) {
  const headers = await authHeaders();
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message/${messageId}/webhook-logs`,
    {method: 'GET', headers},
  );
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    available?: boolean;
    logs?: Array<Record<string, unknown>>;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(json?.error || `Falha ao carregar logs (${response.status})`);
  }
  return {
    available: json.available !== false,
    logs: Array.isArray(json.logs) ? json.logs : [],
  };
}

export async function copyText(
  text: string,
): Promise<'copied' | 'shared' | 'failed'> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as {
      Clipboard?: {setString?: (value: string) => void};
    };
    if (rn.Clipboard?.setString) {
      rn.Clipboard.setString(text);
      return 'copied';
    }
  } catch {
    // ignore
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ClipModule = require('@react-native-clipboard/clipboard') as {
      default?: {setString: (value: string) => void};
      setString?: (value: string) => void;
    };
    const api = ClipModule.default || ClipModule;
    if (api?.setString) {
      api.setString(text);
      return 'copied';
    }
  } catch {
    // ignore
  }

  try {
    await Share.share({message: text});
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Janelas de tempo para edit/delete — espelha MessageBubble web. */
export function canEditMessageByAge(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const mins = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);
  return mins <= 15;
}

export function canDeleteMessageByAge(
  createdAt?: string | null,
  chatStatus?: string | null,
): boolean {
  if (chatStatus === 'pending') return true;
  if (!createdAt) return false;
  const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return hours <= 48;
}

/** GET /:orgId/chat/:chatId/message/:messageId/email */
export async function fetchMessageEmail(
  organizationId: string,
  chatId: string,
  messageId: string,
) {
  const headers = await authHeaders();
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/message/${messageId}/email`,
    {method: 'GET', headers},
  );
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: {
      html?: string | null;
      text?: string | null;
      subject?: string | null;
      from?: string | null;
      to?: string | null;
      date?: string | null;
    };
  };
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || `Falha ao carregar e-mail (${response.status})`);
  }
  return json.data || null;
}
