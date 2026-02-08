# LightSession for ChatGPT v0.4.1

## Changelog

### v0.4.1 (Chrome Bug Fixes & Stability)
- **Fixed (Chrome)**: Extension toggle now properly disables all trimming operations
- **Fixed (Chrome)**: Auto-trim toggle correctly stops automatic trimming
- **Fixed (Chrome)**: Ctrl+Shift+2 manual trim now works regardless of auto-trim setting
- **Fixed (Chrome)**: Empty spaces and leftover elements removed after trimming
- **Improved (Chrome)**: Settings synchronization between popup, content script, and page script
- **Improved (Chrome)**: Better handling of manual vs automatic trimming logic
- **Firefox**: Version updated to 0.4.1 for consistency (no functional changes - experimental support)

### v0.4.0 (Previous Release)
- Initial stable release with core features

**Platform Status:**
- ✅ **Chrome**: Fully functional and stable
- 🚧 **Firefox**: Under development - may have issues

LightSession is a lightweight browser extension that improves ChatGPT UI performance by trimming long conversations **at render time**. It keeps only the last *N* messages in the DOM while preserving the full conversation on OpenAI servers. Reloading the page restores the full history.

## Features

- **DOM-only trimming** of ChatGPT conversation payloads
- **No flicker** — React never sees untrimmed data
- **Configurable** message limit (1–100)
- **Auto Trim Toggle** - enable/disable automatic trimming
- **Dark Mode** - popup theme matching system preference
- **Keyboard Shortcuts** - Ctrl+Shift+L (toggle), Ctrl+Shift+T (trim), Ctrl+Shift+P (popup)
- **Onboarding & Update Pages** - user-friendly welcome and update notifications
- **Firefox Data Collection Consent** - AMO compliant privacy settings
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

### Prerequisites
- Node.js 18.0+ and npm
- Operating System: Windows, macOS, or Linux
- Required packages: esbuild 0.21.5+, TypeScript 5.9.3+

### Installation
```bash
# Install Node.js from https://nodejs.org/ (version 18.0 or higher)
# Verify installation:
node --version
npm --version

# Clone and install dependencies:
git clone <repository-url>
cd lightsession
npm install
```

**Important:** The project includes a comprehensive `.gitignore` file that excludes:
- `node_modules/` - Dependencies
- `dist/` - Build outputs  
- IDE files and OS-specific files
- Extension packages (`.zip`, `.crx`, `.xpi`)

This ensures a clean repository and prevents unnecessary file tracking.

### Build Instructions
1. Install dependencies:
```bash
npm install
```

2. Development build (with debug logs):
```bash
npm run build:dev
```

3. Production build (clean, no debug logs):
```bash
npm run build
```

### Firefox Testing (Development Version)
**Note:** Firefox support is currently under development and may have issues.

1. Build Firefox version:
```bash
npm run build:firefox
```

2. Load in Firefox:
   - Open Firefox
   - Go to `about:debugging`
   - Click "Load Temporary Add-on"
   - Select `dist/firefox/` directory
   - Test on https://chat.openai.com or https://chatgpt.com

3. **Known Issues:**
   - Some features may not work as expected
   - Debug logging may be enabled by default
   - Performance may vary compared to Chrome version

**For production use, Chrome is recommended at this time.**

### Chrome Testing
1. Build Chrome version:
```bash
npm run build:chrome
```

2. Load in Chrome:
   - Open Chrome
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `dist/chrome/` directory
   - Test on https://chat.openai.com or https://chatgpt.com

### Keyboard Shortcuts
- **Ctrl+Shift+L** - Toggle extension on/off
- **Ctrl+Shift+1** - Open settings popup
- **Ctrl+Shift+2** - Trim messages now

**Note:** Shortcuts work on any ChatGPT page in both Chrome and Firefox.

2. Build for all platforms:
```bash
npm run build
```

3. Build for specific platform:
```bash
npm run build:chrome    # Chrome Web Store
npm run build:firefox   # Firefox AMO
```

### Build Process
The build process uses esbuild to:
- Compile TypeScript to JavaScript
- Bundle multiple files into single outputs
- Minify and optimize code
- Generate platform-specific manifests

### Build Script Details
- **esbuild.config.mjs** - Main build configuration
- **TypeScript compiler** - Type checking and compilation
- **Node.js 18.0+** - Runtime environment
- **npm** - Package manager and dependency resolution

### Build Output
- `dist/chrome/` - Chrome Web Store ready package
- `dist/firefox/` - Firefox AMO ready package

### Development
```bash
npm run typecheck      # Check TypeScript types
npm run test:lightsession  # Run automated tests
```

### TypeScript Development
The project uses TypeScript for type safety and better development experience:

```bash
# Type checking without building
npx tsc --noEmit

# Development build with type checking
npm run build:dev

# Watch mode for development (if available)
npm run dev
```

**Common Issues:**
- **Identifier conflicts**: If you see "Definitions of the following identifiers conflict" errors, make sure to import from shared modules:
  ```typescript
  import { __DEV__, debugLog } from "./shared/debug";
  import { excludedRoles, type ConversationNode, type ConversationPayload } from "./shared/types";
  ```

### Troubleshooting
- **Build fails**: Check for TypeScript errors with `npx tsc --noEmit`
- **Permission errors**: Remove `dist/firefox/background.zip` if build fails with EPERM error
- **Extension not loading**: Check browser console for errors and ensure manifest is valid
- **Firefox issues**: 
  - Firefox support is experimental - some features may not work
  - Check `about:debugging` console for Firefox-specific errors
  - Content script injection may behave differently than Chrome
  - Use Chrome for stable functionality while Firefox is in development

### Source Code Structure
- `src/` - TypeScript source files (not minified, not bundled)
  - `src/shared/` - Shared utilities and types
    - `debug.ts` - Debug logging utilities (`__DEV__`, `debugLog`)
    - `types.ts` - Common types (`ConversationNode`, `ConversationPayload`, `excludedRoles`)
    - `settings.ts` - Settings management
    - `extension-api.ts` - Extension API abstraction
    - `dom.ts` - DOM utilities
  - `src/popup/` - Extension popup UI
  - `src/views/` - Extension views (installed, updated pages)
  - `src/background.ts` - Background script
  - `src/content-script.ts` - Content script (Firefox + Chrome coordination)
  - `src/page-script.ts` - Page script (Chrome fetch interception)
- `dist/` - Built/compiled files (for distribution only)
- `manifest.chrome.json` - Chrome-specific manifest
- `manifest.firefox.json` - Firefox-specific manifest

## Security & privacy

- No analytics or telemetry
- No external network requests
- Domain-scoped to `chat.openai.com` and `chatgpt.com`

## Notes

- This is a UI optimization only.

## License

MIT
