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

/**
 * SSE via XMLHttpRequest — no RN/Hermes, fetch+getReader não entrega chunks
 * de forma confiável (espelha o contrato da web em src/lib/api.ts).
 */
export async function improveTextWithAIStream(
  organizationId: string,
  data: {
    text?: string;
    improveOption: ImproveTextOption | string;
    chatId?: string;
    language?: string;
    customInstructions?: string;
    promptId?: string;
    messageIds?: string[];
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

  const url = `${env.API_BASE_URL}/${organizationId}/prompts/improve-text`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastIndex = 0;
    let buffer = '';
    let accumulatedText = '';
    let settled = false;

    const finishOk = (content: string) => {
      if (settled) return;
      settled = true;
      callbacks.onComplete?.(content);
      resolve();
    };

    const finishErr = (message: string, err?: Error) => {
      if (settled) return;
      settled = true;
      callbacks.onError?.(message);
      reject(err || new Error(message));
    };

    const onAbort = () => {
      xhr.abort();
      if (settled) return;
      settled = true;
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        onAbort();
        return;
      }
      abortSignal.addEventListener('abort', onAbort, {once: true});
    }

    const consumeDelta = (delta: string) => {
      if (!delta) return;
      buffer += delta;
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
            finishOk(eventData.content || accumulatedText);
          } else if (eventData.type === 'error') {
            finishErr(eventData.error || 'Erro desconhecido');
          }
        } catch {
          // linha parcial / JSON incompleto
        }
      }
    };

    const flushNewText = () => {
      const text = xhr.responseText || '';
      if (text.length <= lastIndex) return;
      const next = text.slice(lastIndex);
      lastIndex = text.length;
      consumeDelta(next);
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.responseType = 'text';

    xhr.onprogress = () => {
      flushNewText();
    };

    xhr.onreadystatechange = () => {
      // Alguns Android só atualizam responseText aqui durante LOADING
      if (xhr.readyState === XMLHttpRequest.LOADING) {
        flushNewText();
      }
    };

    xhr.onload = () => {
      flushNewText();
      if (settled) return;

      if (xhr.status < 200 || xhr.status >= 300) {
        finishErr(
          (xhr.responseText || '').trim() || `HTTP ${xhr.status}`,
        );
        return;
      }

      if (accumulatedText) {
        finishOk(accumulatedText);
        return;
      }

      // Fallback: corpo JSON não-stream (Accept ignorado pelo proxy etc.)
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as {
          data?: {text?: string};
          text?: string;
        };
        const fallback =
          parsed?.data?.text || parsed?.text || parseSseBody(xhr.responseText);
        if (fallback) {
          callbacks.onChunk?.('', fallback);
          finishOk(fallback);
          return;
        }
      } catch {
        const fromSse = parseSseBody(xhr.responseText || '');
        if (fromSse) {
          callbacks.onChunk?.('', fromSse);
          finishOk(fromSse);
          return;
        }
      }

      finishErr('Stream vazio');
    };

    xhr.onerror = () => {
      finishErr('Falha de rede');
    };

    xhr.onabort = () => {
      if (settled) return;
      settled = true;
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };

    xhr.send(JSON.stringify(data));
  });
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
