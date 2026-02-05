# LightSession for ChatGPT

LightSession is a lightweight browser extension that improves ChatGPT UI performance by trimming long conversations **at render time**. It keeps only the last *N* messages in the DOM while preserving the full conversation on OpenAI servers. Reloading the page restores the full history.

## Features

- **DOM-only trimming** of ChatGPT conversation payloads
- **No flicker** — React never sees untrimmed data
- **Configurable** message limit (1–100)
- **Auto Trim Toggle** - enable/disable automatic trimming
- **Dark Mode** - popup theme matching system preference
- **Optional status indicator**
- **Ultra Lean Mode** (CSS-only reduction of animations)
- **100% local** — no telemetry, no external requests

## What it does not do

- Does **not** reset sessions or clear cookies
- Does **not** automate prompts or scrape data
- Does **not** send telemetry or external requests
- Does **not** modify server-side conversation history

## How it works

1. A page script runs in the page context at `document_start` and patches `window.fetch`.
2. When ChatGPT returns conversation JSON (`/backend-api/conversation`), LightSession trims the mapping to the last *N* messages.
3. The trimmed payload is returned as a new `Response`, so React only renders the trimmed DOM.

Only the UI is affected. The full conversation remains on the server and reappears after a reload.

## Message counting rules

- A message = contiguous nodes with the same role
- Consecutive assistant nodes count as **one** message
- `system`, `tool`, and `thinking` roles are ignored

## Why message count instead of tokens?

- **Performance:** counting roles and adjacency is cheap and avoids extra parsing.
- **Simplicity:** message boundaries are stable in the payload.
- **Safety:** tokenization is model-dependent and risks unexpected variance.

## Configure via CustomEvent

The content script listens for a `lightsession:settings` event in the page context. This is primarily for advanced users and developers.

```js
window.dispatchEvent(
  new CustomEvent("lightsession:settings", {
    detail: {
      enabled: true,
      keepLastN: 30
    }
  })
);
```

- `enabled`: enable/disable trimming
- `keepLastN`: number of messages to keep (1–100)

## Test Automation

A userscript is provided to automatically test DOM trimming:

1. Open `scripts/lightsession-auto-test.user.js`.
2. Copy the entire script.
3. Open ChatGPT, paste into DevTools console and press Enter.
4. The script will:
   - Detect the conversation container.
   - Run tests for keepLastN = [1, 3, 5].
   - Trim DOM and verify results.
   - Print a summary table.

Manual test:
```js
LightSessionAutoTestHelpers.runTest(5);
```

All tests should show ✅ PASS.

## Build

```bash
npm install
npm run build
```

Build output:

- `dist/chrome/`
- `dist/firefox/`

Load the folder for your target browser in the extension manager.

## Development

```bash
npm run typecheck
```

## Security & privacy

- No analytics or telemetry
- No external network requests
- Domain-scoped to `chat.openai.com` and `chatgpt.com`

## Notes

- This is a UI optimization only.

## License

MIT
