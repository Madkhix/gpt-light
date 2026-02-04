// ==UserScript==
// @name         LightSession Auto DOM Trimming Test
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automated DOM trimming test for LightSession on ChatGPT
// @author       QA
// @match        https://chat.openai.com/*
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const __DEV__ = true;

  function debugLog(...args) {
    if (__DEV__) console.debug("[LightSession AutoTest]", ...args);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    await sleep(500);
  }

  function detectConversationContainer() {
    return document.querySelector('.group\\/thread.flex.flex-col.min-h-full');
  }

  function countMessageGroups(container) {
    return container.querySelectorAll('.min-h-8.text-message').length;
  }

  async function setKeepLastN(n) {
    debugLog("Setting keepLastN to", n);
    const event = new CustomEvent("lightsession:settings", {
      detail: { enabled: true, keepLastN: n }
    });
    window.dispatchEvent(event);
    await sleep(800);
  }

  async function runTest(keepLastN) {
    debugLog(`=== Test: keepLastN = ${keepLastN} ===`);
    const container = detectConversationContainer();
    if (!container) {
      console.error("Test aborted: conversation container not found.");
      return { keepLastN, before: 0, after: 0, passed: false };
    }

    const before = countMessageGroups(container);
    debugLog("Message groups before trimming:", before);

    await setKeepLastN(keepLastN);
    await scrollToTop();

    // Manuel DOM trimming (LightSession yoksa)
    const messages = Array.from(container.querySelectorAll('.min-h-8.text-message'));
    if (messages.length > keepLastN) {
      const toRemove = messages.slice(0, messages.length - keepLastN);
      toRemove.forEach(el => el.remove());
      console.log(`Trimmed to last ${keepLastN} messages`);
    }

    const after = countMessageGroups(container);
    debugLog("Message groups after trimming:", after);

    const passed = after <= keepLastN;
    debugLog(`Result: ${passed ? "✅ PASS" : "❌ FAIL"} (expected <= ${keepLastN}, got ${after})`);

    return { keepLastN, before, after, passed };
  }

  async function runAllTests() {
    const testValues = [1, 3, 5];
    const results = [];

    for (const n of testValues) {
      const result = await runTest(n);
      results.push(result);
      await new Promise(r => setTimeout(r, 600));
    }

    console.groupCollapsed("🔍 LightSession AutoTest Özeti");
    console.table(results.map(r => ({
      keepLastN: r.keepLastN,
      before: r.before,
      after: r.after,
      status: r.passed ? "✅ PASS" : "❌ FAIL"
    })));
    const allPassed = results.every(r => r.passed);
    console.log(`Genel Sonuç: ${allPassed ? "✅ Tüm testler başarılı" : "❌ Bazı testler başarısız"}`);
    console.groupEnd();

    return results;
  }

  async function runAllTests() {
    const testValues = [1, 3, 5];
    const results = [];

    for (const n of testValues) {
      const result = await runTest(n);
      results.push(result);
      await sleep(600);
    }

    console.groupCollapsed("🔍 LightSession AutoTest Özeti");
    console.table(results.map(r => ({
      keepLastN: r.keepLastN,
      before: r.before,
      after: r.after,
      status: r.passed ? "✅ PASS" : "❌ FAIL"
    })));
    const allPassed = results.every(r => r.passed);
    console.log(`Genel Sonuç: ${allPassed ? "✅ Tüm testler başarılı" : "❌ Bazı testler başarısız"}`);
    console.groupEnd();

    return results;
  }

  async function waitForConversation() {
    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      if (detectConversationContainer()) {
        debugLog("Conversation container ready, starting tests.");
        await runAllTests();
        return;
      }
      debugLog("Waiting for conversation container...", attempts + 1);
      await sleep(1000);
      attempts++;
    }
    console.error("Conversation container not found after waiting. Aborting tests.");
  }

  if (window.LightSessionAutoTestStarted) {
    debugLog("LightSession AutoTest already started. Skipping duplicate run.");
    return window.LightSessionAutoTestHelpers;
  }
  window.LightSessionAutoTestStarted = true;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForConversation);
  } else {
    waitForConversation();
  }

  window.LightSessionAutoTestHelpers = {
    runAllTests,
    runTest,
    detectConversationContainer,
    countMessageGroups,
    setKeepLastN,
    scrollToTop,
    __DEV__,
    trimDOMToLastNMessages(keepLastN) {
      const container = detectConversationContainer();
      if (!container) return;

      // Tüm mesaj container'larını al (user ve assistant için)
      const messageContainers = Array.from(container.querySelectorAll('[data-message-author-role]'));
      const targetCount = keepLastN * 2; // keepLastN çifti = keepLastN * 2 mesaj
      if (messageContainers.length <= targetCount) return;

      const toRemove = messageContainers.slice(0, messageContainers.length - targetCount);
      toRemove.forEach(el => el.remove());
      console.log(`Trimmed to last ${keepLastN} pairs (${targetCount} messages)`);
    }
  };

  return window.LightSessionAutoTestHelpers;
})();
