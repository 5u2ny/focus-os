# Contributing to Focus OS

Thanks for digging in. This file covers the practical mechanics — for the
architecture deep-dive (capture flow, OAuth, store schema, footguns), see
[`CLAUDE.md`](./CLAUDE.md).

## Dev setup

```bash
git clone https://github.com/5u2ny/focus-pomodoro-app
cd focus-pomodoro-app
npm install        # also runs electron-rebuild for uiohook-napi
npm start          # full build + launch
```

Faster iteration on the main process:

```bash
npm run build:main
./node_modules/.bin/electron . > /tmp/focus-app.log 2>&1 &
tail -f /tmp/focus-app.log
```

Renderer-only HMR: `npm run dev:renderer` (port 7331). Type-check: `npm run
typecheck`. Tests: `npm test` (Vitest).

Requirements: macOS, Node 20+, Xcode Command Line Tools (`xcode-select
--install`) for the native `uiohook-napi` build.

## Renderer / main split

- **Main** (`src/main/*.ts`) — Node, owns FS, native modules, services,
  IPC handlers, window lifecycle.
- **Preload** (`src/preload/*Preload.ts`) — `contextBridge` exposes
  `window.focusAPI` (typed) plus a generic `ipc.invoke` channel.
- **Renderers** — three Vite entry points: `floating/` (the HUD),
  `notes/` (TipTap editor), `freeze/` (lock overlay).

All renderer ↔ main communication is async via IPC. Never import from
`src/main/*` inside a renderer.

## IPC pattern

Channels are plain strings, payloads are JSON-serializable. A typical
round-trip:

```ts
// renderer
const todos = await ipc.invoke<Todo[]>('todo:list')

// main (src/main/ipcHandlers.ts)
ipc.handle('todo:list', () => focusStore.get('todos'))
```

For push events main → renderer, use `mainWindow.webContents.send('foo', ...)`
and `ipc.on('foo', handler)` in the renderer.

## Adding a new IPC channel

1. Define the channel name in `src/main/ipcHandlers.ts` and register a handler.
2. If the payload uses a new shape, add types to `src/shared/schema/index.ts`
   (or a more specific file) so both sides share them.
3. Call from the renderer with `ipc.invoke('your:channel', payload)`.
4. If it touches persisted state, add a focusStore mutator in
   `src/main/services/store.ts`.

## Where the gotchas live

- **Capture** (`src/main/services/capture/captureService.ts`) — uses the
  PopClip mouse-up + clipboard pattern via `uiohook-napi`. AX read paths
  exist as fallbacks but are unreliable in Electron-based apps. Concurrent
  captures are guarded by `captureInFlight` — don't remove this guard.
- **Gmail OAuth** (`src/main/services/gmail/oauth.ts`) — loopback redirect
  on a random port, PKCE, refresh tokens stored encrypted via Keychain.
  Required scopes: `openid email https://mail.google.com/`.
- **TipTap content** (`src/renderer/notes/Editor.tsx`) — never pass `{}` as
  initial content; it's not a valid ProseMirror doc. Use `''` or
  `{type:'doc',content:[]}`.
- **useCallback ordering** in `floating/App.tsx` — the keyboard `useEffect`
  references `closeSettings`; it must appear *after* that callback or you
  get a TDZ error.

## Submitting a PR

1. Branch from `main`. Keep changes focused — one feature or fix per PR.
2. Run `npm run typecheck` and `npm test` before pushing.
3. Manually verify in `npm start`. Tail `/tmp/focus-app.log` to confirm
   no new errors.
4. Update `CHANGELOG.md` under `## [Unreleased]` (Added / Changed / Fixed).
5. Open a PR with a short description of the user-visible change and the
   reasoning. Screenshots help for UI changes.

## Code style

- TypeScript strict mode. Prefer named exports.
- Tailwind for styling; use the `phase-*` utilities for color so the UI
  stays in sync with the timer phase.
- Keep main-process side effects inside services, not directly in IPC
  handlers.
