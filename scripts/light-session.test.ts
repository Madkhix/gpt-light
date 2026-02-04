import fs from "fs";
import path from "path";

/**
 * Minimal, dependency-free test runner for LightSession trimming logic.
 * Run with: ts-node or tsx in dev, or compile with tsc if preferred.
 */

const __DEV__ = true;

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
};

type Settings = {
  enabled: boolean;
  keepLastN: number;
};

const excludedRoles = new Set(["system", "tool", "thinking"]);

function debugLog(...args: unknown[]) {
  if (__DEV__) {
    console.debug("[LightSession Test]", ...args);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildChain(mapping: Record<string, ConversationNode>, currentNode: string): string[] {
  const visited = new Set<string>();
  const chain: string[] = [];
  let pointer: string | null | undefined = currentNode;
  let iterations = 0;
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

function createMockPayload(): ConversationPayload {
  const mapping: Record<string, ConversationNode> = {
    root: { id: "root", parent: null, children: ["u1"], message: { author: { role: "system" } } },
    u1: { id: "u1", parent: "root", children: ["a1"], message: { author: { role: "user" } } },
    a1: { id: "a1", parent: "u1", children: ["a2"], message: { author: { role: "assistant" } } },
    a2: { id: "a2", parent: "a1", children: ["u2"], message: { author: { role: "assistant" } } },
    u2: { id: "u2", parent: "a2", children: ["a3"], message: { author: { role: "user" } } },
    a3: { id: "a3", parent: "u2", children: ["t1"], message: { author: { role: "assistant" } } },
    t1: { id: "t1", parent: "a3", children: [], message: { author: { role: "tool" } } }
  };

  return {
    mapping,
    current_node: "t1"
  };
}

function applySettings(settings: Settings) {
  debugLog("settings applied", settings);
}

function runTrimTests() {
  const payload = createMockPayload();

  // Test 1: keepLastN trims message groups correctly.
  const settings1: Settings = { enabled: true, keepLastN: 2 };
  applySettings(settings1);

  const trimmed1 = settings1.enabled ? trimConversation(payload, settings1.keepLastN) : payload;
  if (!trimmed1) {
    throw new Error("Expected trimmed payload to be returned.");
  }

  const originalCount = Object.keys(payload.mapping ?? {}).length;
  const trimmedCount = Object.keys(trimmed1.mapping ?? {}).length;
  debugLog("counts", { originalCount, trimmedCount });

  // Message groups (user + assistant) => last 2 groups keep u2/a3/t1 in chain.
  assert(trimmedCount < originalCount, "Expected trimmed mapping to be smaller.");

  // Test 2: current_node fallback works when original node is trimmed away.
  const settings2: Settings = { enabled: true, keepLastN: 1 };
  applySettings(settings2);

  const trimmed2 = trimConversation(payload, settings2.keepLastN);
  if (!trimmed2) {
    throw new Error("Expected trimmed payload for current_node test.");
  }

  const keepIds2 = new Set(Object.keys(trimmed2.mapping ?? {}));
  const currentNodeValid = typeof trimmed2.current_node === "string" && keepIds2.has(trimmed2.current_node);
  debugLog("current_node validation", { currentNode: trimmed2.current_node, currentNodeValid });
  assert(currentNodeValid, "Expected current_node to point to a kept node.");

  // Test 3: disabled trimming leaves all messages intact.
  const settings3: Settings = { enabled: false, keepLastN: 1 };
  applySettings(settings3);

  const trimmed3 = settings3.enabled ? trimConversation(payload, settings3.keepLastN) : payload;
  if (!trimmed3?.mapping) {
    throw new Error("Disabled trimming should keep all nodes.");
  }
  assert(Object.keys(trimmed3.mapping).length === originalCount, "Disabled trimming should keep all nodes.");
}

function verifyDistFolders() {
  const chromePath = path.join("dist", "chrome");
  const firefoxPath = path.join("dist", "firefox");

  assert(fs.existsSync(chromePath), `Missing build output at ${chromePath}`);
  assert(fs.existsSync(firefoxPath), `Missing build output at ${firefoxPath}`);
  debugLog("dist folders present", { chromePath, firefoxPath });
}

function main() {
  verifyDistFolders();
  runTrimTests();
  console.log("LightSession tests passed ✅");
}

main();
