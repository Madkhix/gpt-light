# Changelog

All notable changes to LightSession will be documented in this file.

## [0.4.0] - 2026-02-07

### 🚀 Major Changes
- **TypeScript Refactoring**: Complete codebase restructure for better maintainability
- **Shared Modules**: Created `src/shared/` directory with common utilities
- **Platform Status**: Added clear Chrome/Firefox development status indicators

### ✨ New Features
- **Shared Debug Module**: Centralized `__DEV__` and `debugLog` utilities
- **Shared Types Module**: Common types (`ConversationNode`, `ConversationPayload`, `excludedRoles`)
- **Comprehensive .gitignore**: Proper exclusion of build artifacts and IDE files
- **Enhanced Documentation**: Updated README with troubleshooting and development guides

### 🐛 Bug Fixes
- **Fixed TypeScript Identifier Conflicts**: Resolved duplicate definitions between `page-script.ts` and `content-script.ts`
- **Variable Naming**: Renamed conflicting variables (`observer` → `pageObserver`, `originalFetch` → `pageOriginalFetch`, `settings` → `pageSettings`)

### 📝 Documentation
- **Enhanced README**: Added TypeScript development guide, troubleshooting section, and platform status
- **Source Structure**: Detailed explanation of new modular architecture
- **Build Instructions**: Updated with TypeScript-specific commands and common issues

### 🔧 Development
- **Better Type Safety**: Improved TypeScript imports and module structure
- **Cleaner Repository**: Added comprehensive `.gitignore` for better version control
- **Build Process**: Maintained compatibility while improving developer experience

### ⚠️ Platform Notes
- **Chrome**: Fully functional and stable ✅
- **Firefox**: Under development - may have issues 🚧

---

## [0.3.0] - Previous Version

### Features
- DOM-only trimming of ChatGPT conversations
- Configurable message limit (1-100)
- Auto Trim Toggle
- Dark Mode support
- Keyboard shortcuts
- Onboarding & Update Pages
- Firefox Data Collection Consent
- Optional status indicator
- Ultra Lean Mode
- 100% local operation (no telemetry)

---

**Note:** Version 0.4.0 focuses on code quality, maintainability, and developer experience improvements while maintaining all existing functionality.
