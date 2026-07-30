import {supabase} from '../lib/supabase';

export type MessageShortcutAttachment = {
  id?: string;
  name?: string;
  url?: string;
  type?: string;
};

export type MessageShortcutStep = {
  content: string;
  attachments?: MessageShortcutAttachment[];
  delay_after_ms?: number;
  sign_message?: boolean;
};

export type MessageShortcut = {
  id: string;
  title: string;
  content?: string | null;
  attachments?: MessageShortcutAttachment[] | null;
  steps?: MessageShortcutStep[] | null;
  organization_id?: string;
  flow_id?: string | null;
  [key: string]: unknown;
};

export type ReplaceVariablesContext = {
  customerName?: string | null;
  customerFirstName?: string | null;
  chatStatus?: string | null;
  ticketNumber?: string | number | null;
};

export async function fetchMessageShortcuts(
  organizationId: string,
): Promise<MessageShortcut[]> {
  const {data, error} = await supabase
    .from('message_shortcuts')
    .select('*')
    .eq('organization_id', organizationId)
    .order('title', {ascending: true});

  if (error) throw error;
  return (data || []) as MessageShortcut[];
}

/** Normaliza atalhos legados (sem steps) para array de passos. */
export function normalizeShortcutSteps(
  shortcut: Pick<MessageShortcut, 'content' | 'attachments' | 'steps'>,
): MessageShortcutStep[] {
  if (shortcut.steps?.length) {
    return shortcut.steps.map(step => ({
      content: step.content ?? '',
      attachments: step.attachments ?? [],
      delay_after_ms: step.delay_after_ms,
      sign_message: step.sign_message ?? true,
    }));
  }

  return [
    {
      content: shortcut.content ?? '',
      attachments: shortcut.attachments ?? [],
      sign_message: true,
    },
  ];
}

export function isSequenceShortcut(steps: MessageShortcutStep[]): boolean {
  return steps.length > 1;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em atendimento',
  closed: 'Encerrado',
  await_closing: 'Aguardando encerramento',
};

/** Substitui variáveis comuns de atalhos (subset mobile). */
export function replaceVariables(
  text: string,
  ctx: ReplaceVariablesContext = {},
): string {
  if (!text) return text;

  const customerName = ctx.customerName || '';
  const customerFirstName =
    ctx.customerFirstName ||
    (customerName ? customerName.trim().split(/\s+/)[0] : '');
  const chatStatus =
    (ctx.chatStatus && STATUS_LABELS[ctx.chatStatus]) || ctx.chatStatus || '';
  const ticketNumber =
    ctx.ticketNumber != null ? String(ctx.ticketNumber) : '';

  let processed = text;

  processed = processed.replace(/\{\{customer\.name\}\}/g, customerName);
  processed = processed.replace(/\{\{customer\.firstName\}\}/g, customerFirstName);
  processed = processed.replace(/\{\{customerName\}\}/g, customerName);
  processed = processed.replace(/\{\{customerFirstName\}\}/g, customerFirstName);
  processed = processed.replace(/\{\{chat\.status\}\}/g, chatStatus);
  processed = processed.replace(/\{\{chatStatus\}\}/g, chatStatus);
  processed = processed.replace(/\{\{chat\.ticket_number\}\}/g, ticketNumber);
  processed = processed.replace(/\{\{ticketNumber\}\}/g, ticketNumber);

  return processed;
}
