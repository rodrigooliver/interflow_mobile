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

async function apiJson<T = Record<string, unknown>>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    json?: boolean;
  } = {},
): Promise<T> {
  const {method = 'GET', body, json = true} = options;
  const headers = await authHeaders(json && body !== undefined);
  const response = await fetch(`${env.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    success?: boolean;
    error?: string;
  };
  if (!response.ok || data?.success === false) {
    throw new Error(
      (data as {error?: string})?.error ||
        `Falha na requisição (${response.status})`,
    );
  }
  return data;
}

export async function markChatResolved(organizationId: string, chatId: string) {
  return apiJson(`/${organizationId}/chat/${chatId}/resolve`, {
    method: 'POST',
    body: {},
  });
}

/** Mark resolved via PUT (lista web) — fallback POST resolve. */
export async function markChatResolvedFromList(
  organizationId: string,
  chatId: string,
) {
  try {
    return await apiJson(`/${organizationId}/chat/${chatId}/mark-resolved`, {
      method: 'PUT',
      body: {},
    });
  } catch {
    return markChatResolved(organizationId, chatId);
  }
}

export async function markChatUnread(
  organizationId: string,
  chatId: string,
  unread: boolean,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/mark-unread`, {
    method: 'PUT',
    body: {unread},
  });
}

/** @deprecated prefer markChatUnread via API */
export async function markChatRead(chatId: string) {
  const {error} = await supabase
    .from('chats')
    .update({unread_count: 0})
    .eq('id', chatId);
  if (error) throw error;
}

export async function pinChat(
  organizationId: string,
  chatId: string,
  pin: boolean,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/pin`, {
    method: 'PUT',
    body: {pin},
  });
}

export async function archiveChat(
  organizationId: string,
  chatId: string,
  archive: boolean,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/archive`, {
    method: 'PUT',
    body: {archive},
  });
}

export async function markChatSpam(
  organizationId: string,
  chatId: string,
  spam: boolean,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/mark-spam`, {
    method: 'PUT',
    body: {spam},
  });
}

export async function attendChat(organizationId: string, chatId: string) {
  return apiJson(`/${organizationId}/chat/${chatId}/attend`, {
    method: 'POST',
    body: {},
  });
}

export async function reopenChat(organizationId: string, chatId: string) {
  return apiJson(`/${organizationId}/chat/${chatId}/reopen`, {
    method: 'POST',
    body: {},
  });
}

export async function leaveAttendance(
  organizationId: string,
  chatId: string,
  body: Record<string, unknown> = {},
) {
  return apiJson(`/${organizationId}/chat/${chatId}/leave-attendance`, {
    method: 'POST',
    body,
  });
}

export async function transferToAgent(
  organizationId: string,
  chatId: string,
  agentId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/transfer-to-agent`, {
    method: 'POST',
    body: {agentId},
  });
}

export async function transferToTeam(
  organizationId: string,
  chatId: string,
  teamId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/transfer-to-team`, {
    method: 'POST',
    body: {teamId},
  });
}

export async function transferToCustomer(
  organizationId: string,
  chatId: string,
  customerId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/transfer-to-customer`, {
    method: 'POST',
    body: {customerId, newCustomerId: customerId},
  });
}

export async function mergeChat(
  organizationId: string,
  chatId: string,
  targetChatId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/merge`, {
    method: 'POST',
    body: {targetChatId},
  });
}

export async function deleteChat(organizationId: string, chatId: string) {
  return apiJson(`/${organizationId}/chat/${chatId}`, {method: 'DELETE'});
}

export async function startFlow(
  organizationId: string,
  chatId: string,
  flowId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/start-flow`, {
    method: 'POST',
    body: {flowId},
  });
}

export async function pauseFlow(organizationId: string, chatId: string) {
  return apiJson(`/${organizationId}/chat/${chatId}/pause-flow`, {
    method: 'POST',
    body: {},
  });
}

export async function addCollaborator(
  organizationId: string,
  chatId: string,
  userId: string,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/collaborators`, {
    method: 'POST',
    body: {userId},
  });
}

export async function listCollaborators(
  organizationId: string,
  chatId: string,
) {
  return apiJson<{
    success?: boolean;
    collaborators?: Array<{
      id: string;
      user_id: string;
      left_at?: string | null;
      role?: string;
    }>;
  }>(`/${organizationId}/chat/${chatId}/collaborators`);
}

export async function removeCollaborator(
  organizationId: string,
  chatId: string,
  collaboratorId: string,
) {
  return apiJson(
    `/${organizationId}/chat/${chatId}/collaborators/${collaboratorId}`,
    {method: 'DELETE'},
  );
}

export async function sendWhatsAppTemplate(
  organizationId: string,
  chatId: string,
  payload: Record<string, unknown>,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/send-template`, {
    method: 'POST',
    body: payload,
  });
}

export async function sendMessageSequence(
  organizationId: string,
  chatId: string,
  payload: Record<string, unknown>,
) {
  return apiJson(`/${organizationId}/chat/${chatId}/message-sequence`, {
    method: 'POST',
    body: payload,
  });
}

/** Assumir atendimento (legado — preferir attendChat). */
export async function assignChatToMe(chatId: string, userId: string) {
  const {error} = await supabase
    .from('chats')
    .update({assigned_to: userId, status: 'in_progress'})
    .eq('id', chatId);
  if (error) throw error;
}
