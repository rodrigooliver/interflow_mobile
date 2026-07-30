import type {ChatMessage} from '../../services/chatsApi';
import {isOutgoing, isSystemEvent} from './messageHelpers';

export type MessageListRow =
  | {kind: 'date'; id: string; label: string; dayKey: string}
  | {kind: 'message'; id: string; message: ChatMessage};

function dayKeyFromDate(iso?: string | null): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatMessageDayLabel(
  iso: string | null | undefined,
  labels: {today: string; yesterday: string},
): string {
  if (!iso) return '';
  const messageDate = new Date(iso);
  if (Number.isNaN(messageDate.getTime())) return '';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (messageDate.toDateString() === today.toDateString()) {
    return labels.today;
  }
  if (messageDate.toDateString() === yesterday.toDateString()) {
    return labels.yesterday;
  }
  return messageDate.toLocaleDateString();
}

function isCenteredMessage(msg: ChatMessage): boolean {
  const type = msg.type || '';
  return isSystemEvent(msg) || type === 'context' || type === 'alert';
}

/**
 * Espaço DEPOIS da mensagem atual até a vizinha mais nova (index-1 no inverted).
 * Equivale ao mt-* da web na msg seguinte: o gap fica entre os grupos,
 * abaixo da última do lado antigo / antes da 1ª do lado novo.
 */
export function getSpacingAfterMessage(
  message: ChatMessage,
  newerNeighbor: ChatMessage | null,
): number {
  if (isCenteredMessage(message)) return 18;
  if (!newerNeighbor) return 2;
  if (isCenteredMessage(newerNeighbor)) return 18;

  const curOut = isOutgoing(message);
  const newerOut = isOutgoing(newerNeighbor);
  if (curOut !== newerOut) return 22;
  return 2;
}

/** Vizinha no eixo do array (pula chips de data). direction -1 = mais nova. */
export function findNeighborMessage(
  rows: MessageListRow[],
  index: number,
  direction: 1 | -1,
): ChatMessage | null {
  for (let i = index + direction; i >= 0 && i < rows.length; i += direction) {
    const row = rows[i];
    if (row.kind === 'message') return row.message;
  }
  return null;
}

/**
 * messages: newest-first (FlatList inverted).
 * Chip de data depois da msg mais antiga do dia (= acima do bloco no inverted).
 */
export function buildMessageListRows(
  messages: ChatMessage[],
  labels: {today: string; yesterday: string},
): MessageListRow[] {
  const rows: MessageListRow[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    rows.push({kind: 'message', id: message.id, message});

    const older = messages[i + 1] ?? null;
    const day = dayKeyFromDate(message.created_at);
    const olderDay = older ? dayKeyFromDate(older.created_at) : null;
    if (!older || day !== olderDay) {
      rows.push({
        kind: 'date',
        id: `date-${day}-${message.id}`,
        dayKey: day,
        label: formatMessageDayLabel(message.created_at, labels),
      });
    }
  }

  return rows;
}

export function dayKeyOfMessage(msg: ChatMessage): string {
  return dayKeyFromDate(msg.created_at);
}

/** Altura aproximada do sticker sticky (chip + padding). */
export const STICKY_DATE_SLOT = 36;

/** Fallback quando a célula ainda não mediu layout. */
const ESTIMATED_DATE_ROW_HEIGHT = 48;
const ESTIMATED_MESSAGE_ROW_HEIGHT = 72;

/**
 * Resolve o label do sticker a partir do item sob a linha sticky.
 * FlatList inverted: offset 0 = fundo (msgs novas); paddingTop = composer.
 */
export function resolveStickyDateLabel(
  rows: MessageListRow[],
  heights: ReadonlyMap<string, number>,
  scrollY: number,
  viewportH: number,
  stickyTop: number,
  bottomPad: number,
  labels: {today: string; yesterday: string},
): string | null {
  if (!rows.length || viewportH <= 0) return null;

  const target = scrollY + Math.max(0, viewportH - stickyTop);
  let acc = bottomPad;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const h =
      heights.get(row.id) ??
      (row.kind === 'date'
        ? ESTIMATED_DATE_ROW_HEIGHT
        : ESTIMATED_MESSAGE_ROW_HEIGHT);
    acc += h;
    if (acc >= target) {
      if (row.kind === 'date') return row.label || null;
      return (
        formatMessageDayLabel(row.message.created_at, labels) || null
      );
    }
  }

  const last = rows[rows.length - 1];
  if (last.kind === 'date') return last.label || null;
  return formatMessageDayLabel(last.message.created_at, labels) || null;
}
