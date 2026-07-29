export interface ChatFilterRpcInput {
  organizationId: string;
  userId: string;
  selectedFilter: string;
  selectedAgent: string;
  selectedTeams: string[];
  selectedChannel: string;
  selectedTags: string[];
  selectedFunnel: string;
  selectedStages: string[];
  selectedAutomation: string;
  selectedChatTypes: string[];
  selectedSpamFilter: string;
  selectedStatuses: string[];
  isCollaboratingFilter: string;
  excludeFixedFilter: boolean;
  excludeSelfFilter: boolean;
  showUnreadOnly: boolean;
  showArchived: boolean;
  searchText?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  lastMessageAtFrom?: string;
  lastMessageAtTo?: string;
  endTimeFrom?: string;
  endTimeTo?: string;
  orderBy?: string;
  orderDirection?: string;
  pageSize?: number;
  offset?: number;
}

export interface ResolvedFilterParams {
  statusArray: string[] | null;
  assignedToFilter: string | null;
  isCollaborating: boolean;
  includeCollaborating: boolean;
  spamFilter: boolean | null;
  chatTypesArray: string[] | null;
  excludeSelf: boolean;
}

function resolveFilterParams(input: ChatFilterRpcInput): ResolvedFilterParams {
  let statusArray: string[] | null =
    input.selectedStatuses.length > 0 ? input.selectedStatuses : null;
  let assignedToFilter: string | null = input.selectedAgent || null;
  let isCollaborating = input.isCollaboratingFilter === 'yes';
  let includeCollaborating = input.isCollaboratingFilter === 'include';
  let spamFilter: boolean | null = null;
  let chatTypesArray: string[] | null =
    input.selectedChatTypes.length > 0 ? input.selectedChatTypes : null;
  const excludeSelf = input.excludeSelfFilter;

  if (input.selectedSpamFilter === 'spam') {
    spamFilter = true;
  } else if (input.selectedSpamFilter === 'not_spam') {
    spamFilter = false;
  }

  if (!statusArray && !chatTypesArray && !assignedToFilter && input.selectedSpamFilter === '') {
    switch (input.selectedFilter) {
      case 'unassigned':
        statusArray = ['pending'];
        chatTypesArray = ['individual'];
        spamFilter = false;
        break;
      case 'assigned-to-me':
        statusArray = ['in_progress'];
        assignedToFilter = 'me';
        chatTypesArray = ['individual'];
        spamFilter = false;
        break;
      case 'groups':
        statusArray = ['in_progress'];
        chatTypesArray = ['internal_group', 'external_group'];
        break;
      case 'collaborating':
        statusArray = ['in_progress'];
        isCollaborating = true;
        chatTypesArray = ['individual'];
        spamFilter = false;
        break;
      case 'team':
        statusArray = ['in_progress'];
        chatTypesArray = ['individual'];
        spamFilter = false;
        break;
      case 'completed':
        statusArray = ['closed'];
        chatTypesArray = ['individual'];
        break;
      case 'spam':
        spamFilter = true;
        chatTypesArray = ['individual'];
        break;
      default:
        spamFilter = false;
        chatTypesArray = ['individual'];
        break;
    }
  }

  if (assignedToFilter === 'me') {
    assignedToFilter = input.userId;
  }

  return {
    statusArray,
    assignedToFilter,
    isCollaborating,
    includeCollaborating,
    spamFilter,
    chatTypesArray,
    excludeSelf,
  };
}

function appendDateParams(
  params: Record<string, unknown>,
  input: ChatFilterRpcInput,
): void {
  if (input.createdAtFrom) params.p_created_at_from = new Date(input.createdAtFrom).toISOString();
  if (input.createdAtTo) params.p_created_at_to = new Date(input.createdAtTo).toISOString();
  if (input.lastMessageAtFrom) {
    params.p_last_message_at_from = new Date(input.lastMessageAtFrom).toISOString();
  }
  if (input.lastMessageAtTo) {
    params.p_last_message_at_to = new Date(input.lastMessageAtTo).toISOString();
  }
  if (input.endTimeFrom) params.p_end_time_from = new Date(input.endTimeFrom).toISOString();
  if (input.endTimeTo) params.p_end_time_to = new Date(input.endTimeTo).toISOString();
}

export function buildChatRpcParams(input: ChatFilterRpcInput): Record<string, unknown> {
  const resolved = resolveFilterParams(input);
  const tagIds = input.selectedTags.length > 0 ? input.selectedTags : null;
  const stageIds = input.selectedStages.length > 0 ? input.selectedStages : null;
  const funnelId = input.selectedFunnel || null;

  const params: Record<string, unknown> = {
    p_organization_id: input.organizationId,
    p_user_id: input.userId,
    p_status: resolved.statusArray,
    p_assigned_to: resolved.assignedToFilter,
    p_team_ids: input.selectedTeams.length > 0 ? input.selectedTeams : null,
    p_channel_id: input.selectedChannel || null,
    p_show_unread_only: input.showUnreadOnly,
    p_is_spam: resolved.spamFilter,
    p_is_collaborating: resolved.isCollaborating,
    p_include_collaborating: resolved.includeCollaborating,
    p_exclude_fixed: input.excludeFixedFilter,
    p_show_archived: input.showArchived,
    p_tag_ids: tagIds,
    p_stage_ids: stageIds,
    p_funnel_id: funnelId,
    p_chat_types: resolved.chatTypesArray,
    p_exclude_self: resolved.excludeSelf,
    p_page_size: input.pageSize ?? 20,
    p_offset: input.offset ?? 0,
  };

  if (input.selectedAutomation) {
    params.p_automation_filter = input.selectedAutomation;
  }

  if (input.searchText?.trim()) {
    params.p_search_text = input.searchText.trim();
  }

  appendDateParams(params, input);

  params.p_order_by = input.orderBy || 'last_message_at';
  params.p_order_direction = input.orderDirection || 'DESC';

  return params;
}

export const DEFAULT_FILTER_CRITERIA: Record<string, Record<string, unknown>> = {
  unassigned: {
    selectedStatuses: ['pending'],
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'not_spam',
    isCollaboratingFilter: '',
  },
  'assigned-to-me': {
    selectedStatuses: ['in_progress'],
    selectedAgent: 'me',
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'not_spam',
    isCollaboratingFilter: '',
  },
  groups: {
    selectedStatuses: ['in_progress'],
    selectedChatTypes: ['internal_group', 'external_group'],
    isCollaboratingFilter: '',
  },
  collaborating: {
    selectedStatuses: ['in_progress'],
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'not_spam',
    isCollaboratingFilter: 'yes',
  },
  team: {
    selectedStatuses: ['in_progress'],
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'not_spam',
    isCollaboratingFilter: '',
    excludeSelfFilter: true,
  },
  completed: {
    selectedStatuses: ['closed'],
    selectedChatTypes: ['individual'],
    isCollaboratingFilter: '',
  },
  spam: {
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'spam',
    isCollaboratingFilter: '',
  },
  all: {
    selectedChatTypes: ['individual'],
    selectedSpamFilter: 'not_spam',
    isCollaboratingFilter: '',
  },
  internal: {
    selectedChatTypes: ['internal_group', 'internal_direct'],
    selectedStatuses: [],
    selectedSpamFilter: '',
    isCollaboratingFilter: '',
  },
};

export const DEFAULT_QUICK_FILTERS = [
  {id: 'unassigned', label: 'Não atribuídos', showCount: true, color: '#F59E0B'},
  {id: 'assigned-to-me', label: 'Meus', showCount: true, color: '#3B82F6'},
  {id: 'groups', label: 'Grupos', showCount: false, color: '#6366F1'},
  {id: 'collaborating', label: 'Colaborando', showCount: false, color: '#8B5CF6'},
  {id: 'team', label: 'Equipe', showCount: true, color: '#10B981'},
  {id: 'completed', label: 'Concluídos', showCount: false, color: '#059669'},
  {id: 'spam', label: 'Spam', showCount: false, color: '#EF4444'},
  {id: 'all', label: 'Todos', showCount: true, color: '#6B7280'},
];

/** Cor padrão quando o filtro não traz `color` na config. */
export const DEFAULT_QUICK_FILTER_COLOR = '#6B7280';

export function resolveQuickFilterColor(color?: string | null): string {
  if (typeof color === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) {
    return color;
  }
  return DEFAULT_QUICK_FILTER_COLOR;
}

export function emptyFilterInput(
  organizationId: string,
  userId: string,
  selectedFilter = 'assigned-to-me',
): ChatFilterRpcInput {
  return {
    organizationId,
    userId,
    selectedFilter,
    selectedAgent: '',
    selectedTeams: [],
    selectedChannel: '',
    selectedTags: [],
    selectedFunnel: '',
    selectedStages: [],
    selectedAutomation: '',
    selectedChatTypes: [],
    selectedSpamFilter: '',
    selectedStatuses: [],
    isCollaboratingFilter: '',
    excludeFixedFilter: false,
    excludeSelfFilter: selectedFilter === 'team',
    showUnreadOnly: false,
    showArchived: false,
    pageSize: 20,
    offset: 0,
  };
}

/**
 * Mescla critérios salvos com defaults de código (igual getMergedQuickFilterCriteria da web).
 * Filtro padrão do sistema: código sobrescreve o JSON salvo.
 * Filtro customizado: usa o JSON salvo por completo.
 */
export function getMergedQuickFilterCriteria(filter: {
  id: string;
  filters?: Record<string, unknown>;
  isDefault?: boolean;
  isCustom?: boolean;
}): Record<string, unknown> | null {
  if (!filter.filters) return null;
  const defaultCriteria =
    filter.isDefault && !filter.isCustom
      ? DEFAULT_FILTER_CRITERIA[filter.id]
      : undefined;
  return defaultCriteria
    ? ({...filter.filters, ...defaultCriteria} as Record<string, unknown>)
    : filter.filters;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

/**
 * Aplica critérios do filtro rápido (padrão ou personalizado) no input do RPC.
 * Espelha handleQuickFilterClick da web: tags, estágios, funil, equipes, canal, etc.
 */
export function applyQuickFilterCriteria(
  base: ChatFilterRpcInput,
  filterId: string,
  customFilters?: Record<string, unknown>,
  meta?: {isDefault?: boolean; isCustom?: boolean},
): ChatFilterRpcInput {
  const merged =
    getMergedQuickFilterCriteria({
      id: filterId,
      filters: customFilters ?? DEFAULT_FILTER_CRITERIA[filterId] ?? {},
      isDefault: meta?.isDefault,
      isCustom: meta?.isCustom,
    }) ??
    ({
      ...(DEFAULT_FILTER_CRITERIA[filterId] || {}),
      ...(customFilters || {}),
    } as Record<string, unknown>);

  // Migração legado: selectedTeam (string) → selectedTeams (array)
  const selectedTeams = asStringArray(merged.selectedTeams);
  const legacyTeam =
    typeof merged.selectedTeam === 'string' && merged.selectedTeam
      ? [merged.selectedTeam]
      : [];

  return {
    ...base,
    selectedFilter: filterId,
    selectedStatuses: asStringArray(merged.selectedStatuses),
    selectedChatTypes: asStringArray(merged.selectedChatTypes),
    selectedSpamFilter:
      typeof merged.selectedSpamFilter === 'string'
        ? merged.selectedSpamFilter
        : '',
    isCollaboratingFilter:
      typeof merged.isCollaboratingFilter === 'string'
        ? merged.isCollaboratingFilter
        : '',
    selectedAgent:
      typeof merged.selectedAgent === 'string' ? merged.selectedAgent : '',
    selectedTeams: selectedTeams.length > 0 ? selectedTeams : legacyTeam,
    selectedChannel:
      typeof merged.selectedChannel === 'string' ? merged.selectedChannel : '',
    selectedTags: asStringArray(merged.selectedTags),
    selectedFunnel:
      typeof merged.selectedFunnel === 'string' ? merged.selectedFunnel : '',
    selectedStages: asStringArray(merged.selectedStages),
    selectedAutomation:
      typeof merged.selectedAutomation === 'string'
        ? merged.selectedAutomation
        : '',
    excludeFixedFilter: Boolean(merged.excludeFixedFilter),
    excludeSelfFilter: Boolean(merged.excludeSelfFilter),
    showUnreadOnly: Boolean(merged.showUnreadOnly),
  };
}
