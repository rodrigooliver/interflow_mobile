import {supabase} from '../lib/supabase';
import env from '../config/env';

export type ImproveTextOption =
  | 'improve'
  | 'expand'
  | 'shorten'
  | 'formal'
  | 'casual'
  | 'generate'
  | 'custom';

export type ImproveStreamCallbacks = {
  onChunk?: (chunk: string, accumulated: string) => void;
  onComplete?: (content: string) => void;
  onError?: (error: string) => void;
};

type StreamEvent = {
  type?: string;
  content?: string;
  accumulated?: string;
  error?: string;
};

type StreamResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  body?: {
    getReader: () => {
      read: () => Promise<{done: boolean; value?: Uint8Array}>;
    };
  };
};

function decodeUtf8(bytes: Uint8Array, stream = false): string {
  // TextDecoder pode não existir tipado no RN; runtime Hermes costuma ter
  type DecoderCtor = new () => {
    decode: (input?: Uint8Array, options?: {stream?: boolean}) => string;
  };
  const Decoder = (globalThis as {TextDecoder?: DecoderCtor}).TextDecoder;
  if (Decoder) {
    return new Decoder().decode(bytes, {stream});
  }
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

/**
 * SSE client para POST /api/:org/prompts/improve-text
 * Espelha o streamRequest da web.
 */
export async function improveTextWithAIStream(
  organizationId: string,
  data: {
    text?: string;
    improveOption: ImproveTextOption | string;
    chatId?: string;
    language?: string;
    customInstructions?: string;
  },
  callbacks: ImproveStreamCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const {data: sessionData} = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    callbacks.onError?.('Sem sessão');
    throw new Error('Sem sessão');
  }

  const response = (await fetch(
    `${env.API_BASE_URL}/${organizationId}/prompts/improve-text`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
      signal: abortSignal,
    },
  )) as unknown as StreamResponse;

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const message = errText || `HTTP ${response.status}`;
    callbacks.onError?.(message);
    throw new Error(message);
  }

  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    const accumulated = parseSseBody(text);
    if (accumulated) {
      callbacks.onChunk?.('', accumulated);
      callbacks.onComplete?.(accumulated);
      return;
    }
    callbacks.onError?.('Stream indisponível');
    throw new Error('Stream indisponível');
  }

  let accumulatedText = '';
  let buffer = '';

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += decodeUtf8(value, true);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim().startsWith('data: ')) continue;
      try {
        const jsonData = line.slice(6).trim();
        if (!jsonData) continue;
        const eventData = JSON.parse(jsonData) as StreamEvent;

        if (eventData.type === 'chunk') {
          accumulatedText =
            eventData.accumulated ||
            accumulatedText + (eventData.content || '');
          callbacks.onChunk?.(eventData.content || '', accumulatedText);
        } else if (eventData.type === 'complete') {
          const finalText = eventData.content || accumulatedText;
          callbacks.onComplete?.(finalText);
          return;
        } else if (eventData.type === 'error') {
          callbacks.onError?.(eventData.error || 'Erro desconhecido');
          return;
        }
      } catch {
        // ignore parse errors for partial lines
      }
    }
  }

  if (accumulatedText) {
    callbacks.onComplete?.(accumulatedText);
  }
}

function parseSseBody(body: string): string {
  let accumulated = '';
  for (const line of body.split('\n')) {
    if (!line.trim().startsWith('data: ')) continue;
    try {
      const eventData = JSON.parse(line.slice(6).trim()) as StreamEvent;
      if (eventData.type === 'chunk') {
        accumulated =
          eventData.accumulated || accumulated + (eventData.content || '');
      } else if (eventData.type === 'complete' && eventData.content) {
        return eventData.content;
      }
    } catch {
      // ignore
    }
  }
  return accumulated;
}
