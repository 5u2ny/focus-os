# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
npm start              # build + launch Electron (full app)
npm run build          # build:renderer + build:main
npm run build:renderer # vite build (3 entry points: floating, notes, freeze)
npm run build:main     # tsc -p tsconfig.main.json (main process)
npm run dev:renderer   # vite dev server on :7331 — main still needs to be rebuilt separately
npm run typecheck      # tsc --noEmit -p tsconfig.json
npm test               # vitest (config in vite.config.ts under `test:`)

# Launching without the build step (faster iteration on main):
./node_modules/.bin/electron . > /tmp/focus-app.log 2>&1 &
tail -f /tmp/focus-app.log              # see renderer console + main process logs
tail -f /tmp/focus-app.log | grep -E "capture|gmail|ax"   # feature-specific
```

When something fails silently in the running app, the renderer console errors are forwarded to the main process log via the hook installed in `windowManager.createFloatingWindow`. **Always check `/tmp/focus-app.log` before adding more `console.log`.**

## Three-process architecture

1. **Main process** (`src/main/*.ts`) — Node.js, owns the filesystem, IPC handlers, native modules, window lifecycle, and all services (capture, Gmail OAuth/IMAP, LLM, store).
2. **Preload bridges** (`src/preload/*Preload.ts`) — `contextBridge.exposeInMainWorld('focusAPI', ...)` and a generic `electron.invoke` bridge. Renderers call `window.focusAPI.*` for typed methods or `ipc.invoke('channel', payload)` from `@shared/ipc-client` for everything else.
3. **Three renderers**, each with its own Vite entry point in `vite.config.ts`:
   - `floating/` — the always-on-top Spotlight-style command bar (the hero UI)
   - `notes/` — persistent TipTap editor in a hide-on-close BrowserWindow
   - `freeze/` — full-screen lock overlays during forced focus blocks

Renderer↔main communication is **always async via IPC**. Adding a new feature usually means: schema field → focusStore mutator → service method → IPC handler in `src/main/ipcHandlers.ts` → renderer call site.

## Single source of truth: focusStore

Persistence is one JSON file at `~/Library/Application Support/focus-os/focus-os-store.json`, managed by `electron-store` v7. The schema lives in `src/shared/schema/index.ts` (`StoreData`, `Settings`, `DEFAULT_SETTINGS`, plus all entity types). When adding a field:

1. Edit `Settings` (or the relevant interface) in `src/shared/schema/index.ts`
2. If it has a default, add to `DEFAULT_SETTINGS`
3. Add a focusStore mutator in `src/main/services/store.ts` if it needs special logic; otherwise direct `focusStore.updateSettings({ ... })` is fine
4. Surface in `src/renderer/floating/components/SettingsPanel.tsx`

Sensitive values (Gmail OAuth refresh token, LLM API key, Gmail App Password) go through `src/main/services/keychain/secureStore.ts` which wraps Electron's `safeStorage` (macOS Keychain). They're stored as base64-encoded ciphertext under `*Encrypted` field names in the schema.

## Highlight capture (the trickiest part)

`src/main/services/capture/captureService.ts`. Three things you need to know:

- **AX is dead in Electron-based apps.** `AXSelectedText` returns "missing value" inside Claude desktop, VSCode, Slack, Cursor, etc. We tried osascript-via-System-Events and a compiled Swift helper — both were rejected by the sandbox boundary or returned empty.
- **What works everywhere:** the **PopClip pattern** via `uiohook-napi`. Listen for global `mouseup`, check the drag distance from the recorded `mousedown` (>5px → likely a selection), wait 80ms for the host app to settle, synthesize `Cmd+C` via `osascript`, read the clipboard, restore the original clipboard contents, save the captured text. Implemented in `captureFromMouseUp()`.
- **Three global hotkeys are registered:** `Cmd+Shift+C`, `Cmd+Option+C`, `Cmd+Shift+9`. Cmd+Shift+C is hijacked by Chrome/Safari DevTools "Inspect Element" mode in browser contexts, so the fallbacks exist.

`uiohook-napi` is a native module — it's already rebuilt for Electron 31 (`npm install` runs the rebuild). If you bump Electron, run `./node_modules/.bin/electron-rebuild -f -w uiohook-napi`.

## Gmail integration

Two paths in `src/main/services/gmail/`, both feeding `imapClient.ts` (which now supports both passwords and OAuth via `xoauth2` SASL):

1. **App Password** (`gmailService.connect`) — legacy. Most Workspace accounts have this disabled by admin policy and Google has been quietly removing the option for many personal accounts in 2024-2025.
2. **OAuth2 PKCE + loopback** (`oauth.ts` → `gmailService.oauthConnect`) — the path that actually works for everyone. Spins up `http://127.0.0.1:<random>/callback`, opens the system browser to Google consent, exchanges the code for tokens, stores both encrypted in Keychain. Access tokens auto-refresh via `getValidAccessToken()` when they expire (1h lifetime).

OAuth credentials can be **shipped with the app** by editing `src/main/services/gmail/oauthConfig.ts` (`SHIPPED_OAUTH.clientId`/`clientSecret`) — when these are non-empty, the SettingsPanel hides the per-user Client ID/Secret fields and gives a true one-click "Sign in with Google". Currently empty, so users supply their own credentials from a Google Cloud project.

Required scopes: `openid email https://mail.google.com/`. Without `email`, the userinfo lookup fails after the OAuth round-trip — the `id_token` claim is read first as a faster fallback than calling `/oauth2/v2/userinfo`.

## Window chassis

`src/main/windowManager.ts`:

- The floating bar uses **Electron's `vibrancy: 'hud'`** option (real `NSVisualEffectView`), positioned at `workArea.height * 0.18` below the menu bar (Sol-style "biased above midline").
- The Spotlight surface CSS background must stay around **rgba(12,12,16,0.66)** — too transparent and white text vanishes against bright wallpapers; too opaque and the vibrancy is wasted.
- Notes window uses **hide-on-close** — `app.isQuitting` flag in `src/main/index.ts` lets `before-quit` actually destroy it; otherwise close just hides.
- Three window dimensions: `COLLAPSED { 728×72 }`, `EXPANDED { 728×460 }`, `ISLAND { 280×52 }`. The bar always recenters horizontally on resize.

## UI primitives (shadcn-style, hand-rolled)

`src/renderer/shared/ui/` contains `tabs.tsx` (wraps `@radix-ui/react-tabs`), `button.tsx` (cva variants: `default | phase | ghost | icon`), `input.tsx`. Tailwind config lives in `tailwind.config.js`; tokens in `src/renderer/floating/styles/globals.css`. The `phase-*` utility classes (`phase-text`, `phase-bg-soft`, `phase-border`, `phase-glow`) read from CSS variables `--phase-r/g/b` set dynamically in `App.tsx` based on the current timer phase.

## Known footguns

- **TipTap content cannot be `{}`.** `JSON.parse('') === SyntaxError` and `JSON.parse('{}') === {}` which is not a valid ProseMirror doc. Always pass either an empty string or `{type:'doc',content:[...]}`. See `parseContent()` in `notes/Editor.tsx`.
- **useCallback TDZ in App.tsx:** the keyboard `useEffect` references `closeSettings` (a `useCallback`) — it must appear *after* that callback in source order, otherwise the dependency array reads an undefined slot during render and throws "Cannot access 'B' before initialization."
- **Spawned binaries don't inherit Electron's AX permission.** macOS attaches AX grants per bundle ID. A Swift helper compiled into `~/Library/Application Support/focus-os/ax-selection-reader` would need its OWN whitelist entry. Don't go down this path again — use the `uiohook-napi` mouse-up trick.

## Capture flow at a glance

```
mouse drag in any app
  → uIOhook 'mouseup' (drag > 5px)
  → 80ms settle delay
  → save current clipboard
  → osascript Cmd+C
  → read new clipboard
  → restore original clipboard
  → focusStore.addCapture()
  → IPC `capture:new` → floating window
  → captureFlash + auto-switch to Saves tab + macOS notification
```

## Tab + keyboard model in the floating bar

5 tabs always visible: **Focus / Saves / Tasks / Calendar / Inbox**. Click any tab to expand the panel; click the chevron or press `Esc` to collapse. `Cmd+1..5` switch tabs from anywhere. `Cmd+K` focuses the task input. `Cmd+Enter` toggles start/pause. `Esc` is suppressed during a running session — the bar will not auto-hide while a focus block is in progress.
