import type {ChatLastMessage, ChatListItem} from '../services/chatsApi';

export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  sticker: 'Figurinha',
  location: 'Localização',
  contact: 'Contato',
  reaction: 'Reação',
  deleted: 'Mensagem apagada',
  template: 'Template',
};

export const CHAT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em atendimento',
  closed: 'Finalizado',
  await_closing: 'Aguardando',
};

export function getLastMessage(item: ChatListItem): ChatLastMessage | null {
  return (
    (item.metadata?.last_message as ChatLastMessage | null | undefined) ||
    item.last_message ||
    null
  );
}

export function getLastMessagePreview(item: ChatListItem): {
  kind: 'text' | 'reaction' | 'deleted' | 'type' | 'empty';
  text: string;
  lastMessage: ChatLastMessage | null;
} {
  const lastMessage = getLastMessage(item);
  if (!lastMessage) {
    return {kind: 'empty', text: 'Sem mensagens', lastMessage: null};
  }

  const type = lastMessage.type || 'text';

  if (type === 'text') {
    return {
      kind: 'text',
      text: lastMessage.content?.trim() || 'Texto',
      lastMessage,
    };
  }

  if (type === 'reaction') {
    const reaction = lastMessage.reaction || '';
    return {
      kind: 'reaction',
      text: reaction ? `Reagiu com ${reaction}` : 'Reação',
      lastMessage,
    };
  }

  if (type === 'deleted') {
    return {kind: 'deleted', text: 'Mensagem apagada', lastMessage};
  }

  return {
    kind: 'type',
    text: MESSAGE_TYPE_LABELS[type] || lastMessage.content?.trim() || type,
    lastMessage,
  };
}

export function normalizeDeliveryStatus(
  status?: string | null,
): 'pending' | 'sent' | 'delivered' | 'read' | 'failed' {
  if (status === 'deleted') return 'failed';
  if (status === 'pending') return 'pending';
  if (status === 'sent') return 'sent';
  if (status === 'delivered') return 'delivered';
  if (status === 'read') return 'read';
  return 'failed';
}

export function getChannelLabel(item: ChatListItem): string {
  const metadataName =
    item.metadata && typeof item.metadata.channel_name === 'string'
      ? item.metadata.channel_name
      : null;
  return metadataName || item.channel?.name || item.channel?.type || 'Canal';
}

export function getChannelInitials(
  channelName?: string | null,
  channelType?: string | null,
): string {
  if (channelName?.trim()) {
    const words = channelName.trim().split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 4).toUpperCase();
    if (words.length === 2) {
      return (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
    }
    if (words.length === 3) {
      return (
        words[0][0] +
        words[1][0] +
        words[2].substring(0, 2)
      ).toUpperCase();
    }
    return words
      .slice(0, 4)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  switch (channelType) {
    case 'whatsapp_official':
    case 'whatsapp_wapi':
    case 'whatsapp_zapi':
    case 'whatsapp_evo':
    case 'whatsapp_waha':
      return 'WHAP';
    case 'instagram':
    case 'instagramId':
      return 'INST';
    case 'facebook':
    case 'facebookId':
      return 'FACE';
    case 'email':
      return 'MAIL';
    case 'telegram':
      return 'TELE';
    default:
      return 'CHAN';
  }
}

export function getChannelColor(channelType?: string | null): string {
  switch (channelType) {
    case 'whatsapp_official':
    case 'whatsapp_wapi':
    case 'whatsapp_zapi':
    case 'whatsapp_evo':
    case 'whatsapp_waha':
      return '#25D366';
    case 'instagram':
    case 'instagramId':
      return '#E4405F';
    case 'facebook':
    case 'facebookId':
      return '#1877F2';
    case 'email':
      return '#EA4335';
    case 'telegram':
      return '#0088CC';
    default:
      return '#64748B';
  }
}

export function getTeamColor(teamName: string): string {
  const colors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#84CC16',
  ];
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getTeamInitials(teamName: string): string {
  const words = teamName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'EQ';
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}
