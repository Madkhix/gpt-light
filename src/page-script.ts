import { __DEV__, debugLog } from "./shared/debug";
import { excludedRoles, type ConversationNode, type ConversationPayload } from "./shared/types";

// Chrome-only page script - Firefox uses content script only

type PageSettings = {
  enabled: boolean;
  keepLastN: number;
  autoTrim: boolean;
};

let pageSettings: PageSettings = {
  enabled: true,
  keepLastN: 4,
  autoTrim: true
};

// === LISTEN FOR CONTENT SCRIPT MESSAGES ONLY ===
window.addEventListener("lightsession:settings", (event: Event) => {
  const customEvent = event as CustomEvent<{ enabled: boolean; autoTrim: boolean; keepLastN: number }>;
  if (!customEvent.detail) return;

  const { enabled, autoTrim, keepLastN } = customEvent.detail;
  
  // Update local settings
  pageSettings.enabled = enabled;
  pageSettings.autoTrim = autoTrim;
  pageSettings.keepLastN = keepLastN;

  debugLog("Settings updated from content script:", { enabled, autoTrim, keepLastN });
});

// === MANUAL TRIM HANDLER ===
window.addEventListener("lightsession:trim-now", (event: Event) => {
  const keepLastN = (event as CustomEvent<{ keepLastN: number }>).detail.keepLastN;
  trimDOMToLastNMessages(keepLastN);
});

// === NEW MESSAGE DETECTION ===
const pageObserver = new MutationObserver((mutations) => {
  let shouldNotify = false;
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          const element = addedNode as Element;
          if (element.matches('[data-message-author-role]') || 
              element.matches('.min-h-8.text-message') ||
              element.querySelector('[data-message-author-role]') ||
              element.querySelector('.min-h-8.text-message')) {
            shouldNotify = true;
            break;
          }
        }
      }
    }
    if (shouldNotify) break;
  }
  
  if (shouldNotify) {
    // Notify content script about new message
    setTimeout(() => {
      window.postMessage({ type: "lightsession:new-message" }, "*");
    }, 500);
  }
});

// === START OBSERVER ===
const startObserver = () => {
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full');
  if (container) {
    pageObserver.observe(container, {
      childList: true,
      subtree: true
    });
    debugLog("Observer started");
  } else {
    setTimeout(startObserver, 1000);
  }
};

setTimeout(startObserver, 1000);

// === FETCH INTERCEPTION (Chrome only) ===
const pageOriginalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await pageOriginalFetch(input, init);
  
  try {
    if (!pageSettings.enabled || !pageSettings.autoTrim) {
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
    const data = (await clone.json()) as any;
    
    // IMPORTANT: Check both enabled AND autoTrim before trimming
    if (!pageSettings.enabled || !pageSettings.autoTrim) {
      return response;
    }
    
    const trimmed = trimConversation(data, pageSettings.keepLastN + 1);
    
    if (!trimmed) {
      return response;
    }

    debugLog("trimmed conversation", {
      keepLastN: pageSettings.keepLastN,
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


function trimDOMToLastNMessages(keepLastN: number) {
  // Find container dynamically
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full') || 
                   document.querySelector('#thread') ||
                   document.querySelector('[id="thread"]');
  
  if (!container) {
    if (__DEV__) debugLog("trimDOM: conversation container not found");
    return;
  }

  // Get all message containers
  let allMessages = Array.from(container.querySelectorAll('[data-message-author-role]'));
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('.min-h-8.text-message'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
  }

  debugLog("trimDOM: found", allMessages.length, "message containers");
  
  // Filter messages by role and sort
  const validMessages = allMessages.filter(msg => {
    // Find role using different methods
    let role = msg.getAttribute('data-message-author-role');
    if (!role) {
      // Check if role info exists in classes
      if (msg.classList.contains('user') || msg.querySelector('.user')) role = 'user';
      else if (msg.classList.contains('assistant') || msg.querySelector('.assistant')) role = 'assistant';
      else if (msg.textContent?.includes('You') || msg.textContent?.includes('Siz')) role = 'user';
      else if (msg.textContent?.includes('ChatGPT') || msg.textContent?.includes('Assistant')) role = 'assistant';
      else {
        // Default: guess role based on message content
        const content = msg.textContent?.trim();
        if (content && content.length > 0) {
          // If message is short and question, user, long and answer, assistant
          role = content.length < 200 && content.includes('?') ? 'user' : 'assistant';
        } else {
          role = 'unknown';
        }
      }
    }
    return role === 'user' || role === 'assistant';
  });

  debugLog("trimDOM: filtered to", validMessages.length, "valid messages (user/assistant)");
  
  // Find first user message and start from there (also get previous message)
  let firstUserIndex = -1;
  let firstAssistantIndex = -1;
  
  for (let i = 0; i < validMessages.length; i++) {
    const role = validMessages[i].getAttribute('data-message-author-role');
    if (role === 'user' && firstUserIndex === -1) {
      firstUserIndex = Math.max(0, i - 1); // Also get previous message
    }
    if (role === 'assistant' && firstAssistantIndex === -1) {
      firstAssistantIndex = i;
    }
  }
  
  // If no user message, start from first assistant
  const startIndex = firstUserIndex >= 0 ? firstUserIndex : firstAssistantIndex;
  
  // If no messages found, start from the beginning
  const messagesToConsider = startIndex >= 0 ? 
    validMessages.slice(startIndex) : 
    validMessages;
    
  debugLog("trimDOM: first user message at index", firstUserIndex, "considering", messagesToConsider.length, "messages");
  
  // keepLastN is direct message count
  const targetCount = keepLastN ;
  debugLog("trimDOM: keepLastN", keepLastN, "messages, targetCount", targetCount, "messages");
  
  if (messagesToConsider.length <= targetCount) {
    debugLog("trimDOM: nothing to trim, messages", messagesToConsider.length, "targetCount", targetCount);
    return;
  }

  // Keep last targetCount messages, remove the rest
  const toRemove = messagesToConsider.slice(0, messagesToConsider.length - targetCount);
  
  debugLog("trimDOM: removing", toRemove.length, "messages, keeping", targetCount);
  
  // Clean up messages to be removed and their toolbars
  toRemove.forEach(msg => {
    // Find the correct wrapper that includes the toolbar
    let wrapper = null;
    
    // Search for specific wrapper by role
    const role = msg.getAttribute('data-message-author-role');
    if (role === 'assistant') {
      wrapper = msg.closest('.agent-turn');
    } else if (role === 'user') {
      // User messages don't have .user-turn class, use group/turn-messages
      wrapper = msg.closest('.group\\/turn-messages');
    }
    
    // Fallback selectors
    if (!wrapper) {
      wrapper = msg.closest('[data-testid*="conversation-turn"]');
    }
    if (!wrapper) {
      wrapper = msg.closest('.flex.flex-col.gap-2');
    }
    if (!wrapper) {
      wrapper = msg.closest('.group');
    }
    if (!wrapper) {
      wrapper = msg.parentElement;
    }
    
    // Completely remove wrapper
    if (wrapper) {
      wrapper.remove();
    } else {
      msg.remove();
    }
  });

  debugLog("trimDOM: trimmed to last", keepLastN, "messages, removed", toRemove.length, "messages");
}

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
