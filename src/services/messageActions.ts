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

export async function copyText(text: string): Promise<'copied' | 'shared' | 'failed'> {
  try {
    // RN antigo ainda exporta Clipboard; pacote dedicado é opcional.
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
