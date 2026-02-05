type PageSettings = {
  enabled: boolean;
  keepLastN: number;
  autoTrim: boolean;
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
const __DEV__ = false;
const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log("[LightSession]", ...args);
  }
};

let settings: PageSettings = {
  enabled: true,
  keepLastN: 4,
  autoTrim: true
};

window.addEventListener("lightsession:settings", (event: Event) => {
  const customEvent = event as CustomEvent<PageSettings>;
  if (!customEvent.detail) {
    return;
  }
  settings = customEvent.detail;
  debugLog("settings updated", settings);
});

// Manuel trim için dinleyici
window.addEventListener("lightsession:trim-now", (event: Event) => {
  if (__DEV__) debugLog("manual trim triggered");
  
  // Auto trim ile aynı mantığı kullan
  trimDOMToLastNMessages(settings.keepLastN);
});

// Sayfa yüklendikten sonra ilk trimming
setTimeout(() => {
  if (settings.enabled && settings.autoTrim) {
    trimDOMToLastNMessages(settings.keepLastN);
  }
}, 5000); // 5 saniye bekle

// Yeni mesaj eklendiğinde otomatik trimming yap
const observer = new MutationObserver((mutations) => {
  if (!settings.enabled || !settings.autoTrim) return;
  
  let shouldTrim = false;
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          const element = addedNode as Element;
          // Yeni mesaj container'ı eklendi mi kontrol et
          if (element.matches('[data-message-author-role]') || 
              element.matches('.min-h-8.text-message') ||
              element.querySelector('[data-message-author-role]') ||
              element.querySelector('.min-h-8.text-message')) {
            shouldTrim = true;
            break;
          }
        }
      }
    }
    if (shouldTrim) break;
  }
  
  if (shouldTrim) {
    setTimeout(() => {
      trimDOMToLastNMessages(settings.keepLastN);
    }, 500); // Kısa bekleme mesajın tam yüklenmesi için
  }
});

// Observer'ı başlat
const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full');
if (container) {
  observer.observe(container, {
    childList: true,
    subtree: true
  });
} else {
  // Container henüz yoksa, bekle ve tekrar dene
  setTimeout(() => {
    const lateContainer = document.querySelector('.group\\/thread.flex.flex-col.min-h-full');
    if (lateContainer) {
      observer.observe(lateContainer, {
        childList: true,
        subtree: true
      });
    }
  }, 3000);
}

function trimDOMToLastNMessages(keepLastN: number) {
  // Container'ı dynamic olarak bul
  const container = document.querySelector('.group\\/thread.flex.flex-col.min-h-full') || 
                   document.querySelector('#thread') ||
                   document.querySelector('[id="thread"]');
  
  if (!container) {
    if (__DEV__) debugLog("trimDOM: conversation container not found");
    return;
  }

  // Tüm mesaj container'larını al
  let allMessages = Array.from(container.querySelectorAll('[data-message-author-role]'));
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('.min-h-8.text-message'));
  }
  if (allMessages.length === 0) {
    allMessages = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
  }

  debugLog("trimDOM: found", allMessages.length, "message containers");
  
  // Mesajları role'lerine göre filtrele ve sırala
  const validMessages = allMessages.filter(msg => {
    // Farklı yöntemlerle role'ı bul
    let role = msg.getAttribute('data-message-author-role');
    if (!role) {
      // Class'larda role bilgisi var mı kontrol et
      if (msg.classList.contains('user') || msg.querySelector('.user')) role = 'user';
      else if (msg.classList.contains('assistant') || msg.querySelector('.assistant')) role = 'assistant';
      else if (msg.textContent?.includes('You') || msg.textContent?.includes('Siz')) role = 'user';
      else if (msg.textContent?.includes('ChatGPT') || msg.textContent?.includes('Assistant')) role = 'assistant';
      else {
        // Varsayılan: mesaj içeriğine göre tahmin et
        const content = msg.textContent?.trim();
        if (content && content.length > 0) {
          // Eğer mesaj kısa ve soru ise user, uzun ve cevap ise assistant
          role = content.length < 200 && content.includes('?') ? 'user' : 'assistant';
        } else {
          role = 'unknown';
        }
      }
    }
    return role === 'user' || role === 'assistant';
  });

  debugLog("trimDOM: filtered to", validMessages.length, "valid messages (user/assistant)");
  
  // İlk user mesajını bul ve oradan başla (bir önceki mesajı da al)
  let firstUserIndex = -1;
  let firstAssistantIndex = -1;
  
  for (let i = 0; i < validMessages.length; i++) {
    const role = validMessages[i].getAttribute('data-message-author-role');
    if (role === 'user' && firstUserIndex === -1) {
      firstUserIndex = Math.max(0, i - 1); // Bir önceki mesajı da al
    }
    if (role === 'assistant' && firstAssistantIndex === -1) {
      firstAssistantIndex = i;
    }
  }
  
  // Eğer user mesajı yoksa, ilk assistant'dan başla
  const startIndex = firstUserIndex >= 0 ? firstUserIndex : firstAssistantIndex;
  
  // Eğer hiç mesaj bulunamazsa, en baştan başla
  const messagesToConsider = startIndex >= 0 ? 
    validMessages.slice(startIndex) : 
    validMessages;
    
  debugLog("trimDOM: first user message at index", firstUserIndex, "considering", messagesToConsider.length, "messages");
  
  // Tüm mesaj container'larını logla
  if (__DEV__) {
    validMessages.forEach((msg, index) => {
      const role = msg.getAttribute('data-message-author-role');
      const content = msg.textContent?.substring(0, 30);
      debugLog(`Message ${index} (${role}):`, content);
    });
  }
  
  // keepLastN doğrudan mesaj sayısı
  const targetCount = keepLastN ;
  debugLog("trimDOM: keepLastN", keepLastN, "messages, targetCount", targetCount, "messages");
  
  if (messagesToConsider.length <= targetCount) {
    debugLog("trimDOM: nothing to trim, messages", messagesToConsider.length, "targetCount", targetCount);
    return;
  }

  // Son targetCount mesajı koru, gerisini sil
  const toRemove = messagesToConsider.slice(0, messagesToConsider.length - targetCount);
  
  debugLog("trimDOM: removing", toRemove.length, "messages, keeping", targetCount);
  
  // Silinecek mesajların ve toolbar'larını temizle
  toRemove.forEach(msg => {
    // DOĞRU wrapper'ı bul - toolbar'ı da içeren büyük container
    let wrapper = null;
    
    // Role göre spesifik wrapper ara
    const role = msg.getAttribute('data-message-author-role');
    if (role === 'assistant') {
      wrapper = msg.closest('.agent-turn');
    } else if (role === 'user') {
      // User mesajları .user-turn class'ı yok, group/turn-messages kullanıyor
      wrapper = msg.closest('.group\\/turn-messages');
    }
    
    // Fallback selector'lar
    if (!wrapper) {
      wrapper = msg.closest('[data-testid*="conversation-turn"]');
    }
    if (!wrapper) {
      wrapper = msg.closest('.flex.flex-col.gap-2');
    }
    if (!wrapper) {
      wrapper = msg.parentElement;
    }
    
    // Wrapper'ı tamamen sil
    if (wrapper) {
      wrapper.remove();
    } else {
      msg.remove();
    }
  });

  debugLog("trimDOM: trimmed to last", keepLastN, "messages, removed", toRemove.length, "messages");
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
    // keepLastN doğrudan mesaj sayısı
    const trimmed = trimConversation(data, settings.keepLastN  +1);
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
