"use strict";
(() => {
  // src/page-script.ts
  var excludedRoles = /* @__PURE__ */ new Set(["system", "tool", "thinking"]);
  var originalFetch = window.fetch.bind(window);
  var __DEV__ = false;
  var debugLog = (...args) => {
    if (__DEV__) {
      console.log("[LightSession]", ...args);
    }
  };
  var settings = {
    enabled: true,
    keepLastN: 4,
    autoTrim: true
  };
  window.addEventListener("lightsession:settings", (event) => {
    const customEvent = event;
    if (!customEvent.detail) {
      return;
    }
    settings = {
      enabled: typeof customEvent.detail.enabled === "boolean" ? customEvent.detail.enabled : settings.enabled,
      keepLastN: clampNumber(customEvent.detail.keepLastN, 1, 100, settings.keepLastN),
      autoTrim: typeof customEvent.detail.autoTrim === "boolean" ? customEvent.detail.autoTrim : settings.autoTrim
    };
    if (settings.enabled && !settings.autoTrim) {
      trimDOMToLastNMessages(settings.keepLastN);
    }
  });
  setTimeout(() => {
    if (settings.enabled && settings.autoTrim) {
      trimDOMToLastNMessages(settings.keepLastN);
    }
  }, 5e3);
  var observer = new MutationObserver((mutations) => {
    if (!settings.enabled || !settings.autoTrim) return;
    let shouldTrim = false;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const addedNode of mutation.addedNodes) {
          if (addedNode.nodeType === Node.ELEMENT_NODE) {
            const element = addedNode;
            if (element.matches("[data-message-author-role]") || element.matches(".min-h-8.text-message") || element.querySelector("[data-message-author-role]") || element.querySelector(".min-h-8.text-message")) {
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
      }, 100);
    }
  });
  var container = document.querySelector(".group\\/thread.flex.flex-col.min-h-full");
  if (container) {
    observer.observe(container, {
      childList: true,
      subtree: true
    });
  } else {
    setTimeout(() => {
      const lateContainer = document.querySelector(".group\\/thread.flex.flex-col.min-h-full");
      if (lateContainer) {
        observer.observe(lateContainer, {
          childList: true,
          subtree: true
        });
      }
    }, 3e3);
  }
  function trimDOMToLastNMessages(keepLastN) {
    const container2 = document.querySelector(".group\\/thread.flex.flex-col.min-h-full") || document.querySelector("#thread") || document.querySelector('[id="thread"]');
    if (!container2) {
      if (__DEV__) debugLog("trimDOM: conversation container not found");
      return;
    }
    let allMessages = Array.from(container2.querySelectorAll("[data-message-author-role]"));
    if (allMessages.length === 0) {
      allMessages = Array.from(container2.querySelectorAll(".min-h-8.text-message"));
    }
    if (allMessages.length === 0) {
      allMessages = Array.from(container2.querySelectorAll('[data-testid*="conversation-turn"]'));
    }
    debugLog("trimDOM: found", allMessages.length, "message containers");
    const validMessages = allMessages.filter((msg) => {
      let role = msg.getAttribute("data-message-author-role");
      if (!role) {
        if (msg.classList.contains("user") || msg.querySelector(".user")) role = "user";
        else if (msg.classList.contains("assistant") || msg.querySelector(".assistant")) role = "assistant";
        else if (msg.textContent?.includes("You") || msg.textContent?.includes("Siz")) role = "user";
        else if (msg.textContent?.includes("ChatGPT") || msg.textContent?.includes("Assistant")) role = "assistant";
        else {
          const content = msg.textContent?.trim();
          if (content && content.length > 0) {
            role = content.length < 200 && content.includes("?") ? "user" : "assistant";
          } else {
            role = "unknown";
          }
        }
      }
      return role === "user" || role === "assistant";
    });
    debugLog("trimDOM: filtered to", validMessages.length, "valid messages (user/assistant)");
    let firstUserIndex = -1;
    let firstAssistantIndex = -1;
    for (let i = 0; i < validMessages.length; i++) {
      const role = validMessages[i].getAttribute("data-message-author-role");
      if (role === "user" && firstUserIndex === -1) {
        firstUserIndex = Math.max(0, i - 1);
      }
      if (role === "assistant" && firstAssistantIndex === -1) {
        firstAssistantIndex = i;
      }
    }
    const startIndex = firstUserIndex >= 0 ? firstUserIndex : firstAssistantIndex;
    const messagesToConsider = startIndex >= 0 ? validMessages.slice(startIndex) : validMessages;
    debugLog("trimDOM: first user message at index", firstUserIndex, "considering", messagesToConsider.length, "messages");
    if (__DEV__) {
      validMessages.forEach((msg, index) => {
        const role = msg.getAttribute("data-message-author-role");
        const content = msg.textContent?.substring(0, 30);
        debugLog(`Message ${index} (${role}):`, content);
      });
    }
    const targetCount = keepLastN + 1;
    debugLog("trimDOM: keepLastN", keepLastN, "messages, targetCount", targetCount, "messages");
    if (messagesToConsider.length <= targetCount) {
      debugLog("trimDOM: nothing to trim, messages", messagesToConsider.length, "targetCount", targetCount);
      return;
    }
    const toRemove = messagesToConsider.slice(0, messagesToConsider.length - targetCount);
    debugLog("trimDOM: removing", toRemove.length, "messages, keeping", targetCount);
    toRemove.forEach((msg) => {
      let wrapper = null;
      const role = msg.getAttribute("data-message-author-role");
      if (role === "assistant") {
        wrapper = msg.closest(".agent-turn");
      } else if (role === "user") {
        wrapper = msg.closest(".group\\/turn-messages");
      }
      if (!wrapper) {
        wrapper = msg.closest('[data-testid*="conversation-turn"]');
      }
      if (!wrapper) {
        wrapper = msg.closest(".flex.flex-col.gap-2");
      }
      if (!wrapper) {
        wrapper = msg.parentElement;
      }
      if (wrapper) {
        wrapper.remove();
      } else {
        msg.remove();
      }
    });
    debugLog("trimDOM: trimmed to last", keepLastN, "messages, removed", toRemove.length, "messages");
  }
  window.fetch = async (input, init) => {
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
      const data = await clone.json();
      const trimmed = trimConversation(data, settings.keepLastN + 1);
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
  function trimConversation(payload, keepLastN) {
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
    const nextMapping = {};
    for (const id of keepIds) {
      const node = payload.mapping[id];
      if (!node) {
        continue;
      }
      const parent = node.parent && keepIds.has(node.parent) ? node.parent : null;
      const children = Array.isArray(node.children) ? node.children.filter((child) => keepIds.has(child)) : [];
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
  function buildChain(mapping, currentNode) {
    const visited = /* @__PURE__ */ new Set();
    const chain = [];
    let pointer = currentNode;
    let iterations = 0;
    const maxIterations = 1e3;
    while (pointer && mapping[pointer] && !visited.has(pointer) && iterations < maxIterations) {
      visited.add(pointer);
      chain.push(pointer);
      pointer = mapping[pointer].parent ?? null;
      iterations += 1;
    }
    return chain.reverse();
  }
  function buildRoleGroups(chain, mapping) {
    const groups = [];
    let lastRole = null;
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
  function toUrl(input, fallback) {
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
  function clampNumber(value, min, max, fallback) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }
})();
