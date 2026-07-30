/**
 * Janela de 24h — espelha lógica de ChatMessages.tsx (web).
 */

import type {ChannelFeatures} from './channelFeatures';

export type MessageWindowState = {
  canSendMessage: boolean;
  isMessageWindowClosed: boolean;
};

export function computeMessageWindow(params: {
  channelType?: string | null;
  lastCustomerMessageAt?: string | null;
  isInternalChat?: boolean;
  channelFeatures?: ChannelFeatures;
}): MessageWindowState {
  const {channelType, lastCustomerMessageAt, isInternalChat} = params;

  if (isInternalChat) {
    return {canSendMessage: true, isMessageWindowClosed: false};
  }

  const hasTimeWindow =
    channelType === 'instagram' ||
    channelType === 'facebook' ||
    channelType === 'whatsapp_official';

  if (!hasTimeWindow) {
    return {canSendMessage: true, isMessageWindowClosed: false};
  }

  if (!lastCustomerMessageAt) {
    return {canSendMessage: false, isMessageWindowClosed: true};
  }

  const hoursDifference =
    (Date.now() - new Date(lastCustomerMessageAt).getTime()) / (1000 * 60 * 60);

  if (hoursDifference > 24) {
    return {canSendMessage: false, isMessageWindowClosed: true};
  }

  return {canSendMessage: true, isMessageWindowClosed: false};
}
