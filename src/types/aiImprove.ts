/** Espelha src/types/aiImprove.ts (sem React icons). */

export type AIImproveDefaultOption = {
  id: string;
  visible: boolean;
  order: number;
};

export type AIImproveCustomInstruction = {
  id: string;
  title: string;
  instruction: string;
  promptId?: string;
  order: number;
  active: boolean;
};

export type AIImproveSettings = {
  defaultOptions?: AIImproveDefaultOption[];
  customInstructions?: AIImproveCustomInstruction[];
};

export type AIImproveOptionItem = {
  id: string;
  label: string;
  isCustom?: boolean;
  customInstruction?: string;
  promptId?: string;
};
