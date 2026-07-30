import type {ChatMessage} from '../../services/chatsApi';

/** Posição na tela (measureInWindow) para overlay de ações. */
export type MessageAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MessageAttachment = {
  url?: string;
  type?: string;
  name?: string;
  file_name?: string;
  mime_type?: string | null;
  preview_url?: string;
  /** Dimensões naturais (mesma estrutura da web) — usadas no layout da bolha. */
  width?: number | null;
  height?: number | null;
};

/** Limites de exibição de mídia no chat — alinhados à web (MessageBubble). */
export const CHAT_MEDIA_MAX_WIDTH = 320;
export const CHAT_MEDIA_MAX_HEIGHT = 320;
export const CHAT_MEDIA_PROBE_PLACEHOLDER = {
  width: CHAT_MEDIA_MAX_WIDTH,
  height: CHAT_MEDIA_MAX_HEIGHT,
};

/** Escala para ≤ max preservando proporção (nunca amplia). */
export function getConstrainedMediaSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth = CHAT_MEDIA_MAX_WIDTH,
  maxHeight = CHAT_MEDIA_MAX_HEIGHT,
): {width: number; height: number} {
  if (!naturalWidth || !naturalHeight) {
    return {width: maxWidth, height: maxHeight};
  }

  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  const width = Math.max(1, Math.min(maxWidth, Math.floor(naturalWidth * scale)));
  const height = Math.max(
    1,
    Math.min(maxHeight, Math.round((width * naturalHeight) / naturalWidth)),
  );

  return {width, height};
}

export type LocationData = {
  latitude?: number;
  longitude?: number;
  jpegThumbnail?: string;
  name?: string;
  address?: string;
};

export type ContactInfo = {
  displayName: string;
  phone?: string;
  organization?: string;
};

/** Tipos de evento de sistema (sender_type=system ou type específico). */
export const SYSTEM_EVENT_TYPES = new Set([
  'user_start',
  'user_start_auto',
  'auto_assigned',
  'user_entered',
  'user_left',
  'user_transferred',
  'user_transferred_himself',
  'team_transferred',
  'user_join',
  'user_closed',
  'user_reopened',
  'info',
  'call_received',
  'tag_added',
  'tag_removed',
  'stage_update',
  'task',
]);

export function isOutgoing(msg: ChatMessage): boolean {
  const type = msg.type || '';
  const isSystemContentType =
    msg.sender_type === 'system' && type === 'template';
  return msg.sender_type === 'agent' || isSystemContentType;
}

export function isSystemEvent(msg: ChatMessage): boolean {
  const type = msg.type || '';
  if (type === 'private' || type === 'alert' || type === 'context') {
    return false;
  }
  if (msg.sender_type === 'system' && type !== 'template') {
    return true;
  }
  return SYSTEM_EVENT_TYPES.has(type);
}

/**
 * Mensagens que a API/web não exibem na thread.
 * (instruções internas do modelo IA, agendadas, etc.)
 */
export function isHiddenFromChatThread(msg: Pick<ChatMessage, 'type' | 'status'>): boolean {
  if (msg.type === 'instructions_model') return true;
  if (msg.status === 'scheduled') return true;
  return false;
}

export function getMetadata(msg: ChatMessage): Record<string, unknown> {
  const meta = msg.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return {};
}

export function getAttachments(msg: ChatMessage): MessageAttachment[] {
  if (!Array.isArray(msg.attachments)) return [];
  return msg.attachments as MessageAttachment[];
}

export function attachmentMime(att: MessageAttachment): string {
  return (att.mime_type || att.type || '').toLowerCase();
}

export function isImageAttachment(att: MessageAttachment): boolean {
  const mime = attachmentMime(att);
  return mime.startsWith('image') || mime === 'sticker';
}

export function isVideoAttachment(att: MessageAttachment): boolean {
  return attachmentMime(att).startsWith('video');
}

export function isAudioAttachment(att: MessageAttachment): boolean {
  return attachmentMime(att).startsWith('audio');
}

export function attachmentLabel(att: MessageAttachment): string {
  return att.name || att.file_name || 'arquivo';
}

export type DownloadableKind = 'image' | 'video' | 'audio' | 'file';

export type DownloadableMedia = {
  url: string;
  name?: string;
  mimeType?: string | null;
  kind: DownloadableKind;
};

/** Tipos de mensagem com mídia baixável — espelha a web (hasDownloadableMedia). */
const DOWNLOADABLE_TYPES = new Set([
  'image',
  'video',
  'audio',
  'document',
  'file',
  'sticker',
]);

/** Primeiro anexo baixável da mensagem, já classificado por tipo de mídia. */
export function getDownloadableMedia(msg: ChatMessage): DownloadableMedia | null {
  const att = getAttachments(msg).find(a => a.url || a.preview_url);
  if (!att) return null;

  const url = att.url || att.preview_url;
  if (!url) return null;

  const messageType = (msg.type || '').toLowerCase();
  const attachmentType = (att.type || '').toLowerCase();
  const isImage = isImageAttachment(att) || messageType === 'image' || messageType === 'sticker';
  const isVideo = isVideoAttachment(att) || messageType === 'video';
  const isAudio = isAudioAttachment(att) || messageType === 'audio';

  const downloadable =
    isImage ||
    isVideo ||
    isAudio ||
    DOWNLOADABLE_TYPES.has(messageType) ||
    DOWNLOADABLE_TYPES.has(attachmentType);
  if (!downloadable) return null;

  const kind: DownloadableKind = isImage
    ? 'image'
    : isVideo
      ? 'video'
      : isAudio
        ? 'audio'
        : 'file';

  return {
    url,
    name: att.name || att.file_name,
    mimeType: att.mime_type || att.type,
    kind,
  };
}

function parseVCard(vcard: string): ContactInfo | null {
  const lines = vcard.split(/\r?\n/);
  let name = '';
  let phone = '';
  let organization = '';

  for (const line of lines) {
    if (line.startsWith('FN:')) {
      name = line.slice(3).trim();
    } else if (line.startsWith('ORG:')) {
      organization = line.slice(4).trim();
    } else if (line.includes('TEL')) {
      const phoneMatch = line.match(/:(.*)/);
      if (phoneMatch) phone = phoneMatch[1].trim();
    }
  }

  if (!name && !phone) return null;
  return {displayName: name || phone, phone, organization};
}

export function extractContactInfo(msg: ChatMessage): ContactInfo | null {
  const metadata = getMetadata(msg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const msgData = metadata as any;

  const candidates = [
    msgData?.contact,
    msgData?._data?.Message?.contactMessage,
    msgData?._data?.RawMessage?.contactMessage,
    msgData?.media?.Message?.contactMessage,
  ];

  for (const contactMsg of candidates) {
    if (!contactMsg) continue;

    if (typeof contactMsg.vcard === 'string') {
      const parsed = parseVCard(contactMsg.vcard);
      if (parsed) {
        return {
          ...parsed,
          displayName: contactMsg.displayName || parsed.displayName,
        };
      }
    }

    if (Array.isArray(contactMsg.contacts) && contactMsg.contacts[0]) {
      const first = contactMsg.contacts[0];
      if (typeof first.vcard === 'string') {
        const parsed = parseVCard(first.vcard);
        if (parsed) {
          return {
            ...parsed,
            displayName:
              contactMsg.displayName || first.displayName || parsed.displayName,
          };
        }
      }
      if (first.displayName || first.name) {
        return {
          displayName: first.displayName || first.name,
          phone: first.phone,
          organization: first.organization,
        };
      }
    }

    if (contactMsg.displayName) {
      return {
        displayName: contactMsg.displayName,
        phone: contactMsg.phone,
        organization: contactMsg.organization,
      };
    }
  }

  if (typeof msg.content === 'string' && msg.content.trim()) {
    return {displayName: msg.content.trim()};
  }

  return null;
}

export function extractLocation(msg: ChatMessage): LocationData | null {
  const metadata = getMetadata(msg);
  const location = metadata.location as LocationData | undefined;
  if (location?.latitude != null && location?.longitude != null) {
    return location;
  }
  return null;
}

export function formatMessageTime(createdAt?: string | null): string {
  if (!createdAt) return '';
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type SystemLabels = {
  userStart: string;
  userStartAuto: string;
  autoAssigned: string;
  userEntered: string;
  userLeft: string;
  userTransferred: string;
  userTransferredHimself: string;
  teamTransferred: string;
  userJoin: string;
  userClosed: string;
  userReopened: string;
  callReceived: string;
  tagAdded: string;
  tagRemoved: string;
  stageUpdate: string;
  task: string;
  info: string;
  privateNote: string;
  mediaAbsent: string;
  openAudio: string;
  openVideo: string;
  openMap: string;
  openFile: string;
  location: string;
  contact: string;
  deleted: string;
  template: string;
};

export function getSystemEventLabel(
  msg: ChatMessage,
  labels: SystemLabels,
): string {
  const type = msg.type || '';
  const metadata = getMetadata(msg);
  const agent =
    (msg.sender_agent as {full_name?: string} | undefined)?.full_name ||
    (typeof metadata.agent_name === 'string' ? metadata.agent_name : '') ||
    '';
  const name = agent || (typeof msg.content === 'string' ? msg.content : '');

  const withName = (template: string) =>
    name
      ? template.replace('{name}', name)
      : template
          .replace('{name} ', '')
          .replace(' {name}', '')
          .replace('{name}', '')
          .replace(/\s+/g, ' ')
          .trim();

  switch (type) {
    case 'user_start':
      return withName(labels.userStart);
    case 'user_start_auto':
      return withName(labels.userStartAuto);
    case 'auto_assigned':
      return withName(labels.autoAssigned);
    case 'user_entered':
      return withName(labels.userEntered);
    case 'user_left':
      return withName(labels.userLeft);
    case 'user_transferred':
      return withName(labels.userTransferred);
    case 'user_transferred_himself':
      return withName(labels.userTransferredHimself);
    case 'team_transferred':
      return withName(labels.teamTransferred);
    case 'user_join':
      return withName(labels.userJoin);
    case 'user_closed':
      return withName(labels.userClosed);
    case 'user_reopened':
      return withName(labels.userReopened);
    case 'call_received':
      return labels.callReceived;
    case 'tag_added': {
      const tag = (metadata.tag_name as string) || '';
      return labels.tagAdded.replace('{tag}', tag);
    }
    case 'tag_removed': {
      const tag = (metadata.tag_name as string) || '';
      return labels.tagRemoved.replace('{tag}', tag);
    }
    case 'stage_update':
      return msg.content?.trim() || labels.stageUpdate;
    case 'task':
      return msg.content?.trim() || labels.task;
    case 'info':
      return msg.content?.trim() || labels.info;
    default:
      return msg.content?.trim() || type || labels.info;
  }
}

export function parseTemplateParts(content: string): {
  header?: string;
  body?: string;
  footer?: string;
} {
  const parts = content
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean);

  let header = '';
  let body = '';
  let footer = '';

  for (const part of parts) {
    if (part.startsWith('📌')) {
      header = part.replace(/^📌\s*/, '').trim();
    } else if (part.startsWith('_') && part.endsWith('_')) {
      footer = part.replace(/^_\s*|\s*_$/g, '').trim();
    } else if (!part.startsWith('📋')) {
      body = body ? `${body}\n${part}` : part;
    }
  }

  if (!header && !body && !footer) {
    return {body: content};
  }

  return {
    header: header || undefined,
    body: body || undefined,
    footer: footer || undefined,
  };
}

export function getInteractiveButtons(
  msg: ChatMessage,
): Array<{id?: string; title: string}> {
  const metadata = getMetadata(msg);
  const buttons: Array<{id?: string; title: string}> = [];

  if (Array.isArray(metadata.buttons)) {
    for (const btn of metadata.buttons as Array<Record<string, unknown>>) {
      const title =
        (typeof btn.title === 'string' && btn.title) ||
        (typeof btn.text === 'string' && btn.text) ||
        (typeof (btn.buttonText as {displayText?: string} | undefined)
          ?.displayText === 'string' &&
          (btn.buttonText as {displayText: string}).displayText) ||
        '';
      if (title) {
        buttons.push({
          id: typeof btn.id === 'string' ? btn.id : undefined,
          title,
        });
      }
    }
  }

  const rawTemplateButtons = metadata.template_buttons;
  if (Array.isArray(rawTemplateButtons)) {
    for (const btn of rawTemplateButtons as Array<{text?: string}>) {
      if (btn.text) buttons.push({title: btn.text});
    }
  }

  return buttons;
}
