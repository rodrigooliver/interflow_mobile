import {AppState, type AppStateStatus} from 'react-native';
import {io, type Socket} from 'socket.io-client';
import {supabase} from './supabase';
import ENV from '../config/env';

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected';

type InboxHandlers = {
  onChatUpdated?: (payload: {chat: Record<string, unknown>}) => void;
  onChatDeleted?: (payload: {chatId: string}) => void;
  onCollaboratorsChanged?: (payload: {
    chatId: string;
    collaborators: Array<Record<string, unknown>>;
  }) => void;
};

type ThreadHandlers = {
  onMessageCreated?: (payload: {message: Record<string, unknown>; chatId: string}) => void;
  onMessageUpdated?: (payload: {message: Record<string, unknown>; chatId: string}) => void;
  onMessageDeleted?: (payload: {messageId: string; chatId: string}) => void;
  onChatUpdated?: (payload: {chat: Record<string, unknown>}) => void;
  onChatDeleted?: (payload: {chatId: string}) => void;
  onPinnedCreated?: (payload: {chatId: string; pin: Record<string, unknown>}) => void;
  onPinnedDeleted?: (payload: {chatId: string; pinId: string}) => void;
};

const statusListeners = new Set<(status: Status) => void>();
let socket: Socket | null = null;
let status: Status = 'idle';
let currentOrgId: string | null = null;
const subscribedChats = new Map<string, number>();
let connectingPromise: Promise<Socket | null> | null = null;
let lifecycleInstalled = false;

function setStatus(next: Status) {
  status = next;
  statusListeners.forEach(listener => listener(next));
}

function socketOrigin() {
  return String(ENV.API_BASE_URL || '')
    .replace(/\/$/, '')
    .replace(/\/api$/, '');
}

function resubscribeRooms() {
  if (!socket) return;
  for (const chatId of subscribedChats.keys()) {
    socket.emit('subscribe:chat', {chatId});
  }
}

function bindSocketHandlers(target: Socket) {
  target.on('connect', () => {
    setStatus('connected');
    resubscribeRooms();
  });
  target.on('disconnect', () => setStatus('disconnected'));
  target.on('connect_error', () => setStatus('disconnected'));
  target.io.on('reconnect_attempt', async () => {
    const token = await getAccessToken();
    if (token && currentOrgId) {
      target.auth = {token, organizationId: currentOrgId};
    }
  });
}

function installRealtimeLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;

  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active' && currentOrgId) {
      void connectRealtime(currentOrgId);
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!socket || !currentOrgId || !session?.access_token) return;
    socket.auth = {token: session.access_token, organizationId: currentOrgId};
    if (!socket.connected) {
      setStatus('connecting');
      socket.connect();
    }
  });
}

function retainChat(chatId: string) {
  const next = (subscribedChats.get(chatId) || 0) + 1;
  subscribedChats.set(chatId, next);
  if (next === 1) socket?.emit('subscribe:chat', {chatId});
}

function releaseChat(chatId: string) {
  const next = (subscribedChats.get(chatId) || 1) - 1;
  if (next <= 0) {
    subscribedChats.delete(chatId);
    socket?.emit('unsubscribe:chat', {chatId});
    return;
  }
  subscribedChats.set(chatId, next);
}

export function isRealtimeConnected() {
  return status === 'connected' && Boolean(socket?.connected);
}

async function getAccessToken() {
  const {
    data: {session},
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

async function waitForExistingSocket(existing: Socket) {
  if (existing.connected) return existing;
  return new Promise<Socket | null>(resolve => {
    const onConnect = () => {
      cleanup();
      resolve(existing);
    };
    const onError = () => {
      cleanup();
      resolve(existing.connected ? existing : null);
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve(existing.connected ? existing : null);
    }, 8000);
    const cleanup = () => {
      clearTimeout(timeout);
      existing.off('connect', onConnect);
      existing.off('connect_error', onError);
    };
    existing.once('connect', onConnect);
    existing.once('connect_error', onError);
  });
}

export async function connectRealtime(organizationId: string) {
  if (!organizationId) return null;
  installRealtimeLifecycle();

  if (connectingPromise && currentOrgId === organizationId) return connectingPromise;

  const token = await getAccessToken();
  if (!token) return null;

  if (socket && currentOrgId === organizationId) {
    socket.auth = {token, organizationId};
    if (socket.connected) return socket;
    setStatus('connecting');
    socket.connect();
    return waitForExistingSocket(socket);
  }

  if (socket && currentOrgId !== organizationId) {
    socket.disconnect();
    socket = null;
  }

  currentOrgId = organizationId;
  connectingPromise = (async () => {
    try {
      setStatus('connecting');
      socket = io(socketOrigin(), {
        transports: ['websocket'],
        auth: {token, organizationId},
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      });

      bindSocketHandlers(socket);

      await waitForExistingSocket(socket);
      return socket?.connected ? socket : null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export async function ensureRealtimeConnected(organizationId: string) {
  return connectRealtime(organizationId);
}

export function subscribeInbox(handlers: InboxHandlers) {
  if (!socket) return () => undefined;

  const onUpdated = (payload: {chat: Record<string, unknown>}) => {
    handlers.onChatUpdated?.(payload);
  };
  const onDeleted = (payload: {chatId: string}) => handlers.onChatDeleted?.(payload);
  const onCollaboratorsChanged = (payload: {
    chatId: string;
    collaborators: Array<Record<string, unknown>>;
  }) => {
    handlers.onCollaboratorsChanged?.(payload);
  };

  socket.on('chat.updated', onUpdated);
  socket.on('chat.deleted', onDeleted);
  socket.on('collaborators.changed', onCollaboratorsChanged);

  return () => {
    socket?.off('chat.updated', onUpdated);
    socket?.off('chat.deleted', onDeleted);
    socket?.off('collaborators.changed', onCollaboratorsChanged);
  };
}

export function subscribeChatThread(chatId: string, handlers: ThreadHandlers) {
  if (!socket || !chatId) return () => undefined;

  retainChat(chatId);

  const onMessageCreated = (payload: {message: Record<string, unknown>; chatId: string}) => {
    if (payload.chatId === chatId) handlers.onMessageCreated?.(payload);
  };
  const onMessageUpdated = (payload: {message: Record<string, unknown>; chatId: string}) => {
    if (payload.chatId === chatId) handlers.onMessageUpdated?.(payload);
  };
  const onMessageDeleted = (payload: {messageId: string; chatId: string}) => {
    if (payload.chatId === chatId) handlers.onMessageDeleted?.(payload);
  };
  const onChatUpdated = (payload: {chat: Record<string, unknown>}) => {
    if ((payload.chat as {id?: string})?.id === chatId) handlers.onChatUpdated?.(payload);
  };
  const onChatDeleted = (payload: {chatId: string}) => {
    if (payload.chatId === chatId) handlers.onChatDeleted?.(payload);
  };
  const onPinnedCreated = (payload: {chatId: string; pin: Record<string, unknown>}) => {
    if (payload.chatId === chatId) handlers.onPinnedCreated?.(payload);
  };
  const onPinnedDeleted = (payload: {chatId: string; pinId: string}) => {
    if (payload.chatId === chatId) handlers.onPinnedDeleted?.(payload);
  };

  socket.on('message.created', onMessageCreated);
  socket.on('message.updated', onMessageUpdated);
  socket.on('message.deleted', onMessageDeleted);
  socket.on('chat.updated', onChatUpdated);
  socket.on('chat.deleted', onChatDeleted);
  socket.on('pinned.created', onPinnedCreated);
  socket.on('pinned.deleted', onPinnedDeleted);

  return () => {
    releaseChat(chatId);
    socket?.off('message.created', onMessageCreated);
    socket?.off('message.updated', onMessageUpdated);
    socket?.off('message.deleted', onMessageDeleted);
    socket?.off('chat.updated', onChatUpdated);
    socket?.off('chat.deleted', onChatDeleted);
    socket?.off('pinned.created', onPinnedCreated);
    socket?.off('pinned.deleted', onPinnedDeleted);
  };
}
