import {supabase} from '../lib/supabase';
import {
  INTERNAL_CHATS_COLLAB_SELECT,
  parseCollabRowsToInternalChats,
  resolveInternalAvatar,
  resolveInternalDisplayName,
  type InternalChatSummary,
} from '../utils/internalChats';
import type {ChatListItem} from './chatsApi';

/**
 * Mesmo request da web (FloatingChatsContext.fetchInternalChatsFromCollab):
 * chat_collaborators → chats internal_group | internal_direct (não closed).
 */
export async function fetchInternalChatsFromCollab(
  profileId: string,
  orgId: string,
): Promise<InternalChatSummary[]> {
  const {data, error} = await supabase
    .from('chat_collaborators')
    .select(INTERNAL_CHATS_COLLAB_SELECT)
    .eq('user_id', profileId)
    .eq('organization_id', orgId);

  if (error) throw error;
  return parseCollabRowsToInternalChats(data ?? [], profileId);
}

/** Adapta summary interno para o ChatItem nativo. */
export function internalChatToListItem(
  chat: InternalChatSummary,
  profileId: string,
): ChatListItem {
  const name = resolveInternalDisplayName(chat, profileId);
  const avatar = resolveInternalAvatar(chat, profileId);
  const last = chat.metadata?.last_message ?? null;

  return {
    id: chat.id,
    type: chat.type,
    chat_type: chat.type,
    group_name: name,
    group_avatar_url: avatar,
    profile_picture: avatar,
    unread_count: chat.unread_count,
    last_message_at: chat.last_message_at,
    status: chat.status,
    metadata: {
      last_message: last,
    },
    last_message: last
      ? {
          content: last.content,
          status: last.status,
          type: last.type,
          sender_type: last.sender_type,
          sender_agent_name: last.sender_agent_name,
        }
      : null,
  };
}
