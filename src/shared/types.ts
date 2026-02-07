export type ConversationNode = {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: {
    author?: {
      role?: string;
    };
  };
};

export type ConversationPayload = {
  mapping?: Record<string, ConversationNode>;
  current_node?: string;
  [key: string]: unknown;
};

export const excludedRoles = new Set(["system", "tool", "thinking"]);
