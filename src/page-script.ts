type PageSettings = {
  enabled: boolean;
  keepLastN: number;
};

type ConversationNode = {
  id?: string;
  parent?: string | null;
  children?: string[];
  message?: {
    author?: {
      role?: string;
    };
  };
};

type ConversationPayload = {
  mapping?: Record<string, ConversationNode>;
  current_node?: string;
  [key: string]: unknown;
};

const excludedRoles = new Set(["system", "tool", "thinking"]);
const originalFetch = window.fetch.bind(window);
const __DEV__ = true;
const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.debug("[LightSession]", ...args);
  }
};

let settings: PageSettings = {
  enabled: true,
  keepLastN: 30
};

window.addEventListener("lightsession:settings", (event: Event) => {
  const customEvent = event as CustomEvent<PageSettings>;
  if (!customEvent.detail) {
    return;
  }
  settings = {
    enabled: typeof customEvent.detail.enabled === "boolean" ? customEvent.detail.enabled : settings.enabled,
    keepLastN: clampNumber(customEvent.detail.keepLastN, 1, 100, settings.keepLastN)
  };
  if (settings.enabled) {
    trimDOMToLastNMessages(settings.keepLastN);
  }
});

// Sayfa yüklendikten sonra ilk trimming
setTimeout(() => {
  if (settings.enabled) {
    trimDOMToLastNMessages(settings.keepLastN);
  }
}, 2000); // 2 saniye bekle

function trimDOMToLastNMessages(keepLastN: number) {
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full');
  if (!container) {
    if (__DEV__) debugLog("trimDOM: conversation container not found");
    return;
  }

  // Farklı selector'ları dene
  let messageContainers = Array.from(container.querySelectorAll('[data-message-author-role]'));
  if (messageContainers.length === 0) {
    messageContainers = Array.from(container.querySelectorAll('.min-h-8.text-message'));
  }
  if (messageContainers.length === 0) {
    messageContainers = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
  }

  debugLog("trimDOM: found", messageContainers.length, "message containers");
  debugLog("trimDOM: keepLastN", keepLastN, "targetCount", keepLastN * 2);
  
  const targetCount = keepLastN * 2; // keepLastN çifti = keepLastN * 2 mesaj
  
  if (messageContainers.length <= targetCount) {
    debugLog("trimDOM: nothing to trim, messages", messageContainers.length, "targetCount", targetCount);
    return;
  }

  // Son targetCount mesajı koru, gerisini sil
  const toRemove = messageContainers.slice(0, messageContainers.length - targetCount);
  toRemove.forEach(msg => msg.remove());

  debugLog("trimDOM: trimmed to last", keepLastN, "pairs, removed", toRemove.length, "messages");
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await originalFetch(input, init);
  try {
    if (!settings.enabled) {
      return response;
    }

    const url = toUrl(input, response.url);
    if (!url || !/\/backend-api\/conversation/.test(url.pathname)) {
      return response;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return response;
    }

    const clone = response.clone();
    const data = (await clone.json()) as ConversationPayload;
    const trimmed = trimConversation(data, settings.keepLastN);
    if (!trimmed) {
      return response;
    }

    debugLog("trimmed conversation", {
      keepLastN: settings.keepLastN,
      originalCount: Object.keys(data.mapping ?? {}).length,
      trimmedCount: Object.keys(trimmed.mapping ?? {}).length
    });

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json; charset=utf-8");
    }

    return new Response(JSON.stringify(trimmed), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    return response;
  }
};

function trimConversation(payload: ConversationPayload, keepLastN: number): ConversationPayload | null {
  if (!payload?.mapping || !payload.current_node) {
    return null;
  }

  const chain = buildChain(payload.mapping, payload.current_node);
  if (chain.length === 0) {
    return null;
  }

  const groups = buildRoleGroups(chain, payload.mapping);
  if (groups.length === 0) {
    return null;
  }

  const startIndex = groups.length <= keepLastN ? 0 : groups[groups.length - keepLastN].startIndex;
  const keepIds = new Set(chain.slice(startIndex));

  const nextMapping: Record<string, ConversationNode> = {};
  for (const id of keepIds) {
    const node = payload.mapping[id];
    if (!node) {
      continue;
    }

    const parent = node.parent && keepIds.has(node.parent) ? node.parent : null;
    const children = Array.isArray(node.children)
      ? node.children.filter((child) => keepIds.has(child))
      : [];

    nextMapping[id] = {
      ...node,
      parent,
      children
    };
  }

  const nextCurrentNode = keepIds.has(payload.current_node) ? payload.current_node : chain[chain.length - 1];

  return {
    ...payload,
    mapping: nextMapping,
    current_node: nextCurrentNode
  };
}

function buildChain(mapping: Record<string, ConversationNode>, currentNode: string): string[] {
  const visited = new Set<string>();
  const chain: string[] = [];
  let pointer: string | null | undefined = currentNode;
  let iterations = 0;
  // Safety guard against malformed or cyclic conversation graphs
  const maxIterations = 1000;

  while (pointer && mapping[pointer] && !visited.has(pointer) && iterations < maxIterations) {
    visited.add(pointer);
    chain.push(pointer);
    pointer = mapping[pointer].parent ?? null;
    iterations += 1;
  }

  return chain.reverse();
}

function buildRoleGroups(chain: string[], mapping: Record<string, ConversationNode>) {
  const groups: { startIndex: number; endIndex: number; role: string }[] = [];
  let lastRole: string | null = null;

  for (let index = 0; index < chain.length; index += 1) {
    const node = mapping[chain[index]];
    const role = node?.message?.author?.role;
    if (!role || excludedRoles.has(role)) {
      continue;
    }

    if (!lastRole || role !== lastRole) {
      groups.push({ startIndex: index, endIndex: index, role });
      lastRole = role;
      continue;
    }

    groups[groups.length - 1].endIndex = index;
  }

  return groups;
}

function toUrl(input: RequestInfo | URL, fallback: string | null): URL | null {
  try {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }
    if (input instanceof URL) {
      return input;
    }
    if (input instanceof Request) {
      return new URL(input.url);
    }
    if (fallback) {
      return new URL(fallback);
    }
  } catch (error) {
    return null;
  }
  return null;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
