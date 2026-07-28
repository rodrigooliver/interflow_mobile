import {supabase} from '../lib/supabase';
import env from '../config/env';

async function authHeaders() {
  const {data} = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sem sessão');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function markChatResolved(organizationId: string, chatId: string) {
  const headers = await authHeaders();
  const response = await fetch(
    `${env.API_BASE_URL}/${organizationId}/chat/${chatId}/resolve`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) {
    // fallback direto no banco se endpoint variar
    const {error} = await supabase
      .from('chats')
      .update({status: 'closed'})
      .eq('id', chatId);
    if (error) throw error;
  }
}

export async function markChatRead(chatId: string) {
  const {error} = await supabase
    .from('chats')
    .update({unread_count: 0})
    .eq('id', chatId);
  if (error) throw error;
}

export async function assignChatToMe(chatId: string, userId: string) {
  const {error} = await supabase
    .from('chats')
    .update({assigned_to: userId, status: 'in_progress'})
    .eq('id', chatId);
  if (error) throw error;
}
