import {supabase} from '../lib/supabase';

export type PromptListItem = {
  id: string;
  title: string;
  is_default?: boolean | null;
};

/** Lista leve de agentes/prompts da org (mesmo source da web). */
export async function fetchOrganizationPrompts(
  organizationId: string,
): Promise<PromptListItem[]> {
  if (!organizationId) return [];

  const {data, error} = await supabase
    .from('prompts')
    .select('id, title, is_default')
    .eq('organization_id', organizationId)
    .order('created_at', {ascending: false});

  if (error) {
    console.warn('[promptsApi] fetch failed', error.message);
    throw error;
  }

  return (data || []) as PromptListItem[];
}
