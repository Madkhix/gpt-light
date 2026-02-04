// ==UserScript==
// @name         LightSession DOM Trimming QA Test
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automated test for LightSession DOM trimming behavior
// @author       QA
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const __DEV__ = true;

  function debugLog(...args) {
    if (__DEV__) {
      console.debug("[LightSession QA Test]", ...args);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    await sleep(500);
  }

  function detectConversationContainer() {
    // Try multiple selectors used by ChatGPT UI
    const candidates = [
      '[data-testid="conversation-turn"]',
      '[data-message-author-role]',
      ".text-base",
      "main > div > div",
      '[role="main"] > div',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const container = el.closest('[data-testid="conversation-turn"]')?.parentElement?.parentElement ||
                          el.closest("main") ||
                          el.parentElement?.parentElement ||
                          el.parentElement;
        if (container && container.children.length > 0) {
          debugLog("Detected conversation container:", container);
          return container;
        }
      }
    }
    debugLog("Conversation container not found.");
    return null;
  }

  function countMessageGroups(container) {
    const turns = Array.from(container.querySelectorAll('[data-testid="conversation-turn"], [data-message-author-role]'));
    const groups = [];
    let lastRole = null;
    for (const turn of turns) {
      const roleEl = turn.querySelector('[data-message-author-role]') ||
                     turn.querySelector('img[alt*="User"], img[alt*="Assistant"]') ||
                     turn;
      const role = roleEl?.getAttribute('data-message-author-role') ||
                   (roleEl?.textContent?.match(/user|assistant/i)?.[0]?.toLowerCase() ?? null);
      if (!role || ["system", "tool", "thinking"].includes(role)) {
        continue;
      }
      if (role !== lastRole) {
        groups.push(turn);
        lastRole = role;
      }
    }
    return groups.length;
  }

  async function setKeepLastN(n) {
    debugLog("Setting keepLastN to", n);
    const event = new CustomEvent("lightsession:settings", {
      detail: { enabled: true, keepLastN: n }
    });
    window.dispatchEvent(event);
    // Allow DOM mutations to settle
    await sleep(800);
  }

  async function runTest(keepLastN) {
    debugLog(`=== Running test for keepLastN = ${keepLastN} ===`);
    const container = detectConversationContainer();
    if (!container) {
      console.error("Test aborted: conversation container not found.");
      return { keepLastN, before: 0, after: 0, passed: false };
    }

    const before = countMessageGroups(container);
    debugLog("Message groups before trimming:", before);

    await setKeepLastN(keepLastN);
    await scrollToTop();

    const after = countMessageGroups(container);
    debugLog("Message groups after trimming:", after);

    const passed = after <= keepLastN;
    debugLog(`Test ${passed ? "PASSED" : "FAILED"}: expected <= ${keepLastN}, got ${after}`);

    return { keepLastN, before, after, passed };
  }

  async function runAllTests() {
    const testValues = [1, 3, 5];
    const results = [];

    for (const n of testValues) {
      const result = await runTest(n);
      results.push(result);
      // Small pause between tests
      await sleep(600);
    }

    console.groupCollapsed("🔍 LightSession DOM Trimming Test Summary");
    results.forEach(r => {
      console.log(
        `keepLastN=${r.keepLastN}: before=${r.before}, after=${r.after}, ${r.passed ? "✅ PASS" : "❌ FAIL"}`
      );
    });
    const allPassed = results.every(r => r.passed);
    console.log(`Overall: ${allPassed ? "✅ All tests passed" : "❌ Some tests failed"}`);
    console.groupEnd();

    return results;
  }

  // Auto-run after page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runAllTests);
  } else {
    runAllTests();
  }
})();
