# Focus OS

A local-first, Spotlight-style productivity HUD for macOS. Always-on-top pill
with a Pomodoro timer, auto-capture of any text you highlight, todos,
calendar, and an AI-triaged Gmail inbox — all under one glass surface.

## Install

```bash
git clone https://github.com/5u2ny/focus-pomodoro-app
cd focus-pomodoro-app
npm install        # also rebuilds the native uiohook-napi module
npm start
```

Requires macOS, Node 20+, and Xcode Command Line Tools
(`xcode-select --install`). On first launch, grant **Accessibility**
permission to Focus OS in System Settings → Privacy & Security so the global
mouse hook can drive auto-capture.

## Use

- **Timer** — click the pill to start/pause. `Cmd+Enter` toggles from
  anywhere. The HUD auto-shrinks to a Dynamic Island after 8s of focus and
  re-expands on break.
- **Capture** — highlight text in any app and release the mouse. Focus OS
  detects the drag, briefly synthesizes `Cmd+C`, restores your clipboard, and
  saves the selection to the **Saves** tab. Manual fallbacks: `Cmd+Shift+C`,
  `Cmd+Option+C`, `Cmd+Shift+9`.
- **Inbox** — connect Gmail in **Settings → Gmail**. Recommended path is
  "Sign in with Google" (OAuth2, works for Workspace). App Password is kept
  as a legacy option. Email is hidden during focus sessions.
- **Tabs** — `Cmd+1..5` switches between Focus / Saves / Tasks / Calendar /
  Inbox. `Cmd+K` focuses the task input. `Esc` collapses; `Esc Esc` minimizes
  to the island (suppressed while a session is running).

API keys (Anthropic / OpenAI) and Gmail tokens are encrypted via macOS
Keychain (`safeStorage`) and never leave your machine except to the provider
you chose.

## Stack

Electron 31 · React 18 · TypeScript 5.5 · Vite · Tailwind · Radix UI ·
TipTap 2 (notes) · `uiohook-napi` (global mouse hook for capture) ·
`electron-store` v7 (local JSON persistence) · `imapflow` + `mailparser`
(Gmail IMAP with XOAUTH2) · `@xenova/transformers` (on-device zero-shot
classification, optional).

See [`CLAUDE.md`](./CLAUDE.md) for the architecture deep-dive and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev workflow. MIT licensed.
