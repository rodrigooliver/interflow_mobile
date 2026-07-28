/**
 * Capacidades por tipo de canal — espelha ChatMessages.tsx (web).
 */

export type ChannelFeatures = {
  canReplyToMessages: boolean;
  canSendAudio: boolean;
  canSendTemplates: boolean;
  has24HourWindow: boolean;
  canSendAfter24Hours: boolean;
  canDeleteMessages: boolean;
  canEditMessages: boolean;
};

const DEFAULT_FEATURES: ChannelFeatures = {
  canReplyToMessages: false,
  canSendAudio: false,
  canSendTemplates: false,
  has24HourWindow: false,
  canSendAfter24Hours: true,
  canDeleteMessages: false,
  canEditMessages: false,
};

export function getChannelFeatures(
  channelType?: string | null,
  options?: {isInternalChat?: boolean},
): ChannelFeatures {
  if (options?.isInternalChat) {
    return {
      canReplyToMessages: true,
      canSendAudio: true,
      canSendTemplates: false,
      has24HourWindow: false,
      canSendAfter24Hours: true,
      canDeleteMessages: false,
      canEditMessages: false,
    };
  }

  switch (channelType) {
    case 'whatsapp_official':
      return {
        canReplyToMessages: true,
        canSendAudio: true,
        canSendTemplates: true,
        has24HourWindow: true,
        canSendAfter24Hours: true,
        canDeleteMessages: false,
        canEditMessages: false,
      };
    case 'whatsapp_wapi':
    case 'whatsapp_waha':
    case 'whatsapp_zapi':
    case 'whatsapp_evo':
      return {
        canReplyToMessages: true,
        canSendAudio: true,
        canSendTemplates: false,
        has24HourWindow: false,
        canSendAfter24Hours: true,
        canDeleteMessages: true,
        canEditMessages: true,
      };
    case 'instagram':
    case 'facebook':
      return {
        canReplyToMessages: false,
        canSendAudio: false,
        canSendTemplates: false,
        has24HourWindow: true,
        canSendAfter24Hours: false,
        canDeleteMessages: false,
        canEditMessages: false,
      };
    default:
      return {...DEFAULT_FEATURES};
  }
}

export function isInternalChatType(chatType?: string | null): boolean {
  return (
    chatType === 'internal' ||
    chatType === 'internal_group' ||
    chatType === 'internal_direct'
  );
}
