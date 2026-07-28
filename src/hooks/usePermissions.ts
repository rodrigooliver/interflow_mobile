import {useMemo} from 'react';
import {useAuth} from '../contexts/AuthContext';

type ChatPerms = {
  enabled: boolean;
  canAccessAll: boolean;
  canAssignToOthers: boolean;
  canTransferChats: boolean;
  canUseFilters: boolean;
  canManageCollaborators: boolean;
  canBecomeCollaborator: boolean;
};

const OWNER_CHATS: ChatPerms = {
  enabled: true,
  canAccessAll: true,
  canAssignToOthers: true,
  canTransferChats: true,
  canUseFilters: true,
  canManageCollaborators: true,
  canBecomeCollaborator: true,
};

const ROLE_CHAT_TEMPLATES: Record<string, ChatPerms> = {
  owner: OWNER_CHATS,
  admin: OWNER_CHATS,
  manager: {
    enabled: true,
    canAccessAll: true,
    canAssignToOthers: true,
    canTransferChats: true,
    canUseFilters: true,
    canManageCollaborators: false,
    canBecomeCollaborator: true,
  },
  agent: {
    enabled: true,
    canAccessAll: false,
    canAssignToOthers: false,
    canTransferChats: true,
    canUseFilters: true,
    canManageCollaborators: false,
    canBecomeCollaborator: true,
  },
  agent_limited: {
    enabled: true,
    canAccessAll: false,
    canAssignToOthers: false,
    canTransferChats: false,
    canUseFilters: false,
    canManageCollaborators: false,
    canBecomeCollaborator: false,
  },
  sales: {
    enabled: true,
    canAccessAll: false,
    canAssignToOthers: false,
    canTransferChats: true,
    canUseFilters: true,
    canManageCollaborators: false,
    canBecomeCollaborator: true,
  },
};

function normalizeChatPerms(raw: unknown, role: string): ChatPerms {
  const fallback = ROLE_CHAT_TEMPLATES[role] || ROLE_CHAT_TEMPLATES.agent;
  if (!raw || typeof raw !== 'object') return fallback;
  const chats = (raw as {chats?: Record<string, unknown>}).chats;
  if (!chats || typeof chats !== 'object') return fallback;
  return {
    enabled: chats.enabled !== false,
    canAccessAll: Boolean(chats.canAccessAll),
    canAssignToOthers: Boolean(chats.canAssignToOthers),
    canTransferChats: Boolean(chats.canTransferChats),
    canUseFilters: chats.canUseFilters !== false,
    canManageCollaborators: Boolean(chats.canManageCollaborators),
    canBecomeCollaborator: chats.canBecomeCollaborator !== false,
  };
}

export function usePermissions() {
  const {profile, currentOrganizationMember} = useAuth();

  const chatsPermissions = useMemo(() => {
    if (profile?.is_superadmin) return OWNER_CHATS;
    if (!currentOrganizationMember) {
      return ROLE_CHAT_TEMPLATES.agent;
    }
    if (currentOrganizationMember.role === 'owner') return OWNER_CHATS;
    if (currentOrganizationMember.custom_permissions) {
      return normalizeChatPerms(
        currentOrganizationMember.custom_permissions,
        currentOrganizationMember.role,
      );
    }
    return (
      ROLE_CHAT_TEMPLATES[currentOrganizationMember.role] || ROLE_CHAT_TEMPLATES.agent
    );
  }, [profile?.is_superadmin, currentOrganizationMember]);

  const isOwnerOrAdmin = useMemo(() => {
    if (profile?.is_superadmin) return true;
    const role = currentOrganizationMember?.role;
    return role === 'owner' || role === 'admin';
  }, [profile?.is_superadmin, currentOrganizationMember?.role]);

  return {chatsPermissions, isOwnerOrAdmin};
}
