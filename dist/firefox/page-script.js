"use strict";
(() => {
  // src/page-script.ts
  var excludedRoles = /* @__PURE__ */ new Set(["system", "tool", "thinking"]);
  var originalFetch = window.fetch.bind(window);
  var __DEV__ = true;
  var debugLog = (...args) => {
    if (__DEV__) {
      console.debug("[LightSession]", ...args);
    }
  };
  var settings = {
    enabled: true,
    keepLastN: 30
  };
  window.addEventListener("lightsession:settings", (event) => {
    const customEvent = event;
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
  setTimeout(() => {
    if (settings.enabled) {
      trimDOMToLastNMessages(settings.keepLastN);
    }
  }, 2e3);
  function trimDOMToLastNMessages(keepLastN) {
    const container = document.querySelector(".group\\/thread.flex.flex-col.min-h-full");
    if (!container) {
      if (__DEV__) debugLog("trimDOM: conversation container not found");
      return;
    }
    let messageContainers = Array.from(container.querySelectorAll("[data-message-author-role]"));
    if (messageContainers.length === 0) {
      messageContainers = Array.from(container.querySelectorAll(".min-h-8.text-message"));
    }
    if (messageContainers.length === 0) {
      messageContainers = Array.from(container.querySelectorAll('[data-testid*="conversation-turn"]'));
    }
    debugLog("trimDOM: found", messageContainers.length, "message containers");
    debugLog("trimDOM: keepLastN", keepLastN, "targetCount", keepLastN * 2);
    const targetCount = keepLastN * 2;
    if (messageContainers.length <= targetCount) {
      debugLog("trimDOM: nothing to trim, messages", messageContainers.length, "targetCount", targetCount);
      return;
    }
    const toRemove = messageContainers.slice(0, messageContainers.length - targetCount);
    toRemove.forEach((msg) => msg.remove());
    debugLog("trimDOM: trimmed to last", keepLastN, "pairs, removed", toRemove.length, "messages");
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
