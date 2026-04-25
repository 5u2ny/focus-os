# Focus OS

A local-first focus command center for macOS. Timer, highlight-anywhere capture,
notes, AI email triage, todo, and calendar — all in one always-visible pill.

## Install (60 seconds)

```bash
git clone https://github.com/5u2ny/focus-pomodoro-app
cd focus-pomodoro-app
npm install
npm start
```

> **macOS note:** `npm install` runs `electron-rebuild` automatically to compile
> the native robotjs module for your Electron version. Python 3 and Xcode Command
> Line Tools must be installed (`xcode-select --install`).

## Features

| Module | What it does |
|--------|-------------|
| **Pill timer** | Always-on-top Pomodoro HUD — click to start/pause, auto-advances phases |
| **Highlight capture** | Press `Cmd+Shift+C` anywhere to save selected text as a Capture |
| **Notes** | Full rich-text editor (TipTap) with drag-insert from captures |
| **AI email triage** | IMAP Gmail fetch, zero-shot importance scoring, one-click draft reply |
| **Todo** | Inline task list with active-task indicator visible in the HUD |
| **Calendar** | 7-day event strip, local CRUD, no cloud sync required |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Space` | Toggle timer start/pause |
| `Cmd+Shift+C` | Capture highlighted text from any app |
| `Cmd+Shift+P` | Show/hide the pill |

## AI & Privacy

Focus OS runs all AI locally by default (distilbert via @xenova/transformers —
downloaded once, cached in `~/Library/Application Support/focus-os`).

Optionally connect Anthropic or OpenAI in **Settings → AI** for richer email
summaries and draft replies. Your API key is encrypted with Electron safeStorage
and never leaves your machine.

Gmail is accessed via IMAP with an App Password — Focus OS never stores your
Google account credentials.

## Blackboard LMS

The original Pomodoro app's Blackboard integration is preserved. Connect in
**Settings → Blackboard** with your institution URL and session cookie.

## Development

```bash
npm run dev:renderer   # Hot-reload renderer only
npm run build:main     # Compile main process
npm run build          # Full production build
npm run typecheck      # TypeScript check without emit
```

## Stack

- **Electron 31** + React 18 + TypeScript 5.5
- **electron-store v7** — local-first JSON persistence
- **TipTap 2** — rich-text notes editor
- **@xenova/transformers** — on-device zero-shot classification
- **robotjs** — system-level keyboard simulation for capture
- **imap + mailparser** — pure-JS Gmail IMAP client

## License

MIT
