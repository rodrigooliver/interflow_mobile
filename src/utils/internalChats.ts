/** Espelha src/utils/internalChats.ts da web (lista de chats internos). */

export type InternalCollabProfile = {
  user_id: string;
  profile: {
    full_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
  } | Array<{
    full_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
  }> | null;
};

export type InternalLastMessage = {
  type?: string;
  content?: string;
  sender_type?: string;
  sender_agent_name?: string;
  status?: string;
};

export type InternalChatRow = {
  id: string;
  type: string;
  group_name: string | null;
  group_avatar_url?: string | null;
  group_settings: Record<string, unknown> | null;
  ticket_number: number | null;
  unread_count?: number | null;
  last_message_at?: string | null;
  status?: string;
  metadata?: {
    user_unread_counts?: Record<string, number>;
    last_message?: InternalLastMessage;
  } | null;
  collaborators?: InternalCollabProfile[];
};

export interface InternalChatSummary {
  id: string;
  type: 'internal_group' | 'internal_direct';
  group_name: string | null;
  group_avatar_url: string | null;
  group_settings: Record<string, unknown> | null;
  ticket_number: number | null;
  last_message_at: string | null;
  status: string;
  metadata: {
    user_unread_counts?: Record<string, number>;
    last_message?: InternalLastMessage;
  } | null;
  collaborators?: InternalCollabProfile[];
  unread_count: number;
}

export const INTERNAL_CHATS_COLLAB_SELECT = `
  chat:chat_id(
    id, type, group_name, group_avatar_url, group_settings,
    ticket_number, unread_count, last_message_at, status, metadata,
    collaborators:chat_collaborators(
      user_id,
      profile:user_id(full_name, nickname, avatar_url)
    )
  )
`;

export function resolveInternalDisplayName(
  chat: InternalChatSummary,
  profileId: string,
): string {
  if (chat.type === 'internal_direct') {
    const other = chat.collaborators?.find(c => c.user_id !== profileId);
    const profile = other?.profile;
    const p = Array.isArray(profile) ? profile[0] : profile;
    return p?.nickname?.trim() || p?.full_name?.trim() || 'Chat Direto';
  }
  return chat.group_name || 'Grupo Interno';
}

export function resolveInternalAvatar(
  chat: InternalChatSummary,
  profileId: string,
): string | null {
  if (chat.type === 'internal_direct') {
    const other = chat.collaborators?.find(c => c.user_id !== profileId);
    const profile = other?.profile;
    const p = Array.isArray(profile) ? profile[0] : profile;
    return p?.avatar_url ?? null;
  }
  return chat.group_avatar_url ?? null;
}

export function sortInternalChats(
  chats: InternalChatSummary[],
): InternalChatSummary[] {
  return [...chats].sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}

export function chatRowToInternalSummary(
  chat: InternalChatRow,
  profileId: string,
): InternalChatSummary {
  const unread = chat.metadata?.user_unread_counts?.[profileId] ?? 0;
  return {
    id: chat.id,
    type: chat.type as 'internal_group' | 'internal_direct',
    group_name: chat.group_name,
    group_avatar_url: chat.group_avatar_url ?? null,
    group_settings: chat.group_settings,
    ticket_number: chat.ticket_number,
    last_message_at: chat.last_message_at ?? null,
    status: chat.status ?? 'open',
    metadata: chat.metadata ?? null,
    collaborators: chat.collaborators,
    unread_count: unread,
  };
}

export function parseCollabRowsToInternalChats(
  rows: Array<{chat: InternalChatRow | InternalChatRow[] | null}>,
  profileId: string,
): InternalChatSummary[] {
  const parsed = rows
    .map(row => (Array.isArray(row.chat) ? row.chat[0] : row.chat))
    .filter(
      (chat): chat is InternalChatRow =>
        !!chat &&
        (chat.type === 'internal_group' || chat.type === 'internal_direct') &&
        chat.status !== 'closed',
    )
    .map(chat => chatRowToInternalSummary(chat, profileId))
    .filter((chat, i, arr) => arr.findIndex(x => x.id === chat.id) === i);

  return sortInternalChats(parsed);
}
