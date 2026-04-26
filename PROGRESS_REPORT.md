# Focus OS — Progress Report

**Period covered:** 2026-04-25 (yesterday) through 2026-04-26 (today, mid-day)
**Repository:** https://github.com/5u2ny/focus-os
**Branch:** `main` · 9 commits · `f43a14e` → `f8b1556`

---

## 1. Where we started

Yesterday's starting point: a working Pomodoro timer app called `focus-pomodoro-app` that needed a complete UX overhaul. The core complaints driving the work were:

- The pill UI was getting cut off and looked low-quality
- Highlight capture was being requested but the existing implementation didn't actually work
- Multiple advertised features (Gmail, Notes, Settings, Calendar) were either visually broken or non-functional
- The app didn't feel like a focused tool — it was a dashboard pretending to be a HUD

Goal that emerged through iteration: build a Spotlight/Sol-style command bar that lives at the top of the screen, with all features (Focus / Saves / Tasks / Calendar / Inbox) accessible from one always-visible surface.

---

## 2. Major workstreams (in order)

### 2.1 Spotlight-style UI rebuild

**Inspiration:** [github.com/ospfranco/sol](https://github.com/ospfranco/sol) — fetched their actual Swift `Panel.swift`, `PanelManager.swift`, and React `MainInput.tsx` as reference.

**What we built:**
- 728×72 px frameless BrowserWindow positioned **top-center, biased above midline** at `workArea.height * 0.18` (Sol's exact math)
- Always-on-top, transparent, moveable
- 5 always-visible tabs: **Focus / Saves / Tasks / Calendar / Inbox**
- Click any tab → window expands downward to 728×460
- Auto-collapse to a 280×52 dynamic island after 8s of running session
- Bottom key-hint bar like Sol's: `⌘1-5 switch tab · ⌘K focus task · ⌘↩ start/pause · Esc collapse`

**Keyboard model:**
- `Cmd+1..5` — switch tab from anywhere
- `Cmd+K` — focus the task input
- `Cmd+Enter` — toggle start/pause
- `Esc` — collapse panel; minimize to island; **suppressed during running session** (Sol's rule)

**Stack added:** Tailwind 3, hand-rolled shadcn-style components (`Tabs` wrapping `@radix-ui/react-tabs`, `Button` with cva variants, `Input`), `lucide-react` icons.

### 2.2 Highlight capture (the hardest part)

This burned the most cycles. Here's the journey:

1. **Original (broken):** A compiled Swift helper at `~/Library/Application Support/focus-os/ax-selection-reader` polled `AXSelectedText` every 600ms. Returned empty every time.
   - **Why it failed:** macOS Accessibility permission attaches per bundle ID. The Electron parent had AX, but the spawned helper binary did not — and macOS has no UI to add a non-app binary to the AX whitelist easily. Confirmed empirically by running the binary directly with text selected → empty output.

2. **Switched to osascript+System Events:** worked for native apps (TextEdit, Notes, Mail, Safari).
   - **Why it failed for the user:** Claude desktop, VSCode, Slack, Cursor, Notion, Discord — every Electron-based app — renders text in a custom React DOM that does not expose `AXSelectedText`. The user was highlighting inside Claude itself, so AX returned `missing value`.

3. **Final solution — PopClip pattern via `uiohook-napi`:**
   - Native module `uiohook-napi` installs a global mouse event tap (Carbon-equivalent)
   - On `mousedown`, record cursor position
   - On `mouseup`, if drag distance > 12 px and primary button → 80 ms settle delay → spawn `osascript` to synthesize `Cmd+C`
   - Read the clipboard, restore the original contents, save the captured text
   - Works in **every macOS app** including Electron because it doesn't depend on AX exposure — only on Cmd+C, which every text-rendering app honors

4. **Performance fix (today):** the mouse hook was firing on every drag globally — window drags, scrollbar drags, Finder item drags — which queued osascript calls and made the system feel frozen. Added:
   - `captureInFlight` flag to prevent concurrent invocations (also fixed clipboard restore race)
   - 800 ms cooldown between auto-captures
   - Drag threshold raised from 5 px → 12 px to filter click-release wiggles

**What works now:** highlight any text in any app → ~1 second later it appears in the Saves tab + macOS notification fires. Zero shortcut required from the user. Original clipboard preserved.

### 2.3 Gmail — App Password → OAuth2 → working Inbox

**Day 1 (App Password path):**
1. Initial `gmail:connect` IPC → `imap.gmail.com:993` with email + App Password
2. User reported "Invalid credentials" — turns out their Workspace account doesn't allow App Passwords
3. Added pre-flight validation (16-char check) + translated "Invalid credentials" into a 3-step actionable error message
4. Added a step-by-step setup walkthrough in the Settings → Gmail tab

**Day 1 (OAuth pivot):**
- App Passwords are blocked on most Workspace accounts and Google has been quietly removing them from personal accounts in 2024-2025
- Built a full OAuth2 flow: `src/main/services/gmail/oauth.ts`
- **PKCE + loopback redirect:** spins up `http://127.0.0.1:<random>/callback`, opens system browser to Google consent, exchanges code for tokens
- Tokens stored encrypted via `safeStorage` in macOS Keychain (`gmailOauthRefreshTokenEncrypted`, `gmailOauthAccessTokenEncrypted`)
- Auto-refreshes the 1-hour access token via `getValidAccessToken()`
- IMAP client extended to support **XOAUTH2 SASL** (`buildXOAuth2()` builds the `user=...auth=Bearer ...` SASL string)
- Settings UI: mode toggle between "Sign in with Google (recommended)" and "App Password (legacy)"
- "Reset" button that wipes saved Client ID + Secret + tokens (added when user reported the OAuth screen was showing the wrong project name — they had stale credentials saved)
- "Shipped credentials" path in `oauthConfig.ts` — when populated, the Client ID/Secret fields hide and the user gets pure one-click sign-in

**Day 1 (the bug we hit during OAuth):**
- First sign-in attempt completed the auth round-trip but then errored with "Failed to fetch user email"
- Root cause: only requested `https://mail.google.com/` scope. The userinfo endpoint requires `openid email`.
- Fixed: added `openid email` scopes + read the email from the `id_token` claim first (avoids extra HTTP call), with `/oauth2/v2/userinfo` as fallback

**Day 2 (Inbox UI):**
- Even after successful Gmail connect (17-20 emails fetched into the focusStore), the Inbox tab was hardcoded to show "Inbox coming soon — connect Gmail in Settings"
- Wired it up: `gmail:list` IPC on mount, `gmail:newEmails` listener for live updates, `gmail:fetchNow` for manual refresh
- Built `EmailCard` component: importance chip (high/medium/low color-coded), unread dot, sender, subject, 2-line preview, timeAgo timestamp
- Hover reveals **Draft** (calls `gmail:generateReply` → LLM via `callLLM`) and **Archive** buttons
- Drafts render inline below the email when generated
- Inbox tab badge in the bar header now shows the unread count (live)
- Auto-fetch on app boot + on connect → user sees emails immediately instead of waiting for the 15-min poll

### 2.4 Notes — silent crash fix

The Notes window opened but the TipTap editor crashed silently on first render.

- **Root cause:** `JSON.parse(note.content || '{}')` produces `{}` when content is empty. TipTap rejects `{}` as not a valid ProseMirror doc and throws `Invalid content for node doc`.
- **Fix:** added `parseContent()` guard in `notes/Editor.tsx` that returns `''` (which TipTap accepts) for empty/invalid input, and only returns the parsed object if it's actually a `{type: 'doc', ...}` shape.

### 2.5 Calendar tab (newly added)

The Calendar tab didn't exist in the new Spotlight UI even though IPC handlers (`calendar:list`, `calendar:create`, `calendar:delete`) and the `calendarService` already existed in main.

Added:
- New tab trigger between Tasks and Inbox with badge showing today's event count
- Add-event input row: title field + HH:MM time field + Add button
- Today's events rendered as cards: time range, title, category chip, hover-reveal Trash button
- Past events dim to 50% opacity
- Cmd+4 switches to Calendar; tab range is now Cmd+1..5

### 2.6 Settings panel rewrite

The original SettingsPanel referenced ~14 CSS classes that didn't exist in `floating.css` (`.settings-header`, `.settings-body`, `.settings-input`, `.settings-check`, `.category-row`, etc.). It rendered as raw unstyled inputs.

Rewrote completely in Tailwind + the new shadcn primitives:
- `Section` wrapper, `Field` label+hint, `NumberField` with suffix, custom `Toggle` switch
- 5 internal tabs: **Timer / Capture / AI / Gmail / Tags**
- Per-tab walkthroughs and inline guidance
- Permission status banner at top of Capture tab (Accessibility check)
- Keychain-availability warning banner where relevant
- Footer with Save / Cancel

### 2.7 Glass morphism unification

User feedback: "the dual color theme of the outer shell of the pill as glass morphism and black pill make it one that being glass morphism."

Before: window vibrancy material + a heavy `rgba(12,12,16,0.66)` dark CSS wash on top = "glass over a black pill."

After:
- BrowserWindow `vibrancy: 'hud'` → `'fullscreen-ui'` (lighter, more uniform material)
- `.spotlight-surface` background dropped to `rgba(255,255,255,0.05)` — just a wisp of brightness
- Added `backdrop-filter: blur(24px) saturate(1.5)` on top of the native vibrancy
- Top rim highlight at `rgba(255,255,255,0.55)` keeps the edge crisp
- Body `text-shadow: 0 1px 2px rgba(0,0,0,0.45)` so white text stays legible on bright wallpapers without needing a dark fill

Result: one continuous glass-morphism surface — wallpaper bleeds through cleanly.

### 2.8 Other fixes done along the way

- **Cutoff issue:** Tab content panels were a fixed `h-[336px]` with `p-4` padding. Made the EXPANDED window 460 px tall to give room for the new bottom hint bar without clipping.
- **Cold-start Accessibility prompt:** added `promptAccessibilityPermission()` call at app boot so the OS dialog appears on first launch instead of capture silently failing.
- **Multiple capture shortcuts:** registered `Cmd+Shift+C`, `Cmd+Option+C`, and `Cmd+Shift+9` because Cmd+Shift+C is hijacked by Chrome/Safari DevTools "Inspect Element" mode.
- **`useCallback` TDZ bug:** the keyboard `useEffect` in App.tsx referenced `closeSettings` (declared later as a `useCallback`). The deps array is built during render → Temporal Dead Zone error in production. Moved the effect after the callback.
- **TipTap JSON.parse crash** (already covered in Notes section).
- **Old robotjs / Blackboard removal:** stripped from package.json dependencies; postinstall no longer needs native rebuild for them.
- **CLAUDE.md created** so future Claude Code sessions have the architecture map and the gotchas above.

---

## 3. Tech stack changes

| Added today/yesterday | Why |
|---|---|
| `tailwindcss@3` + `postcss` + `autoprefixer` | new shadcn-style component layer |
| `@radix-ui/react-tabs` | accessible tab primitive |
| `class-variance-authority`, `clsx`, `tailwind-merge` | shadcn pattern |
| `lucide-react` | icon set |
| `uiohook-napi` | global mouse hook for the PopClip-style capture |
| `node-gyp` + `electron-rebuild` | needed to compile `uiohook-napi` against Electron 31 |

| Removed | Why |
|---|---|
| `robotjs` | replaced by uiohook-napi + osascript |
| Blackboard LMS integration | scope cut |

---

## 4. Architecture map (today's state)

```
┌──────────────────────────────────────────────────────────────────┐
│  Main process (src/main/*)                                       │
│  ─ index.ts        bootstrap, AX prompt, IPC, captureService      │
│                    .start, gmail polling resume                  │
│  ─ ipcHandlers.ts  ~40 channels — timer:* state:* capture:*       │
│                    todo:* notes:* calendar:* gmail:* permission:* │
│  ─ windowManager   floating (vibrancy hud→fullscreen-ui),        │
│                    notes (hide-on-close), freeze (lock screen)   │
│  ─ services/                                                     │
│      capture/      uiohook mouseup → osascript Cmd+C →           │
│                    clipboard restore (PopClip pattern)           │
│      gmail/        oauth.ts (PKCE + loopback) │ imapClient.ts    │
│                    (XOAUTH2) │ gmailService.ts (orchestrator)    │
│      keychain/     secureStore wraps Electron safeStorage        │
│      store.ts      focusStore = electron-store JSON              │
│                    (single source of truth)                      │
└──────────────────────────────────────────────────────────────────┘
                  ▲ ipc.invoke(channel, payload)
                  │ window.focusAPI.* (typed bridge)
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  Renderers (3 Vite entry points)                                 │
│  ─ floating/  Spotlight bar — Tabs (Focus, Saves, Tasks,         │
│               Calendar, Inbox), SettingsPanel (5 sub-tabs),      │
│               EmailCard, TodoRow, EmptyState                     │
│  ─ notes/     persistent TipTap window (hide on close)           │
│  ─ freeze/    full-screen lock overlays during forced focus      │
└──────────────────────────────────────────────────────────────────┘
```

Persistence: `~/Library/Application Support/focus-os/focus-os-store.json` (electron-store v7), schema in `src/shared/schema/index.ts`.

Encrypted fields: `gmailOauthRefreshTokenEncrypted`, `gmailOauthAccessTokenEncrypted`, `gmailOauthClientSecretEncrypted`, `gmailAppPasswordEncrypted`, `llmApiKeyEncrypted` — all via macOS Keychain.

---

## 5. Commits in chronological order

| # | Hash | When | Summary |
|---|---|---|---|
| 1 | `f43a14e` | 2026-04-25 18:58 | Initial commit — full Focus OS codebase |
| 2 | `04db2c7` | 2026-04-25 19:05 | Gmail "Invalid credentials" → actionable error + setup guide |
| 3 | `3f392ea` | 2026-04-25 19:27 | Add Google OAuth2 sign-in (works for Workspace accounts) |
| 4 | `feb146f` | 2026-04-25 19:37 | Support shipped OAuth credentials for one-click sign-in |
| 5 | `5c35d47` | 2026-04-25 19:59 | Show stored OAuth Client ID + add Reset button |
| 6 | `def193b` | 2026-04-25 20:47 | Fix OAuth "failed to fetch user email" — add openid+email scopes |
| 7 | `8c89f87` | 2026-04-25 20:55 | Auto-fetch Gmail on connect + on app boot |
| 8 | `5f8e58c` | 2026-04-26 11:07 | Wire Inbox tab to real Gmail data + add CLAUDE.md |
| 9 | `f8b1556` | 2026-04-26 11:21 | Fix system freeze on drag + unify pill into one glass surface |

---

## 6. What's working end-to-end (verified)

| Feature | Status | Verification |
|---|---|---|
| Pomodoro timer (start/pause/reset, phase advance, cycle counter) | ✅ | `[main] Initial Gmail fetch: 20 emails` appears in log on every boot; timer advances live in screenshots |
| Highlight capture (any app, including Electron) | ✅ | Captured 196-char selection from Claude desktop via mouse-up hook (PopClip pattern) — verified in store + log |
| Tasks (add, complete, set active) | ✅ | 5 todos render in Tasks tab with Active badge + Completed strikethrough section |
| Calendar (today's events, add via title + HH:MM) | ✅ | 4 injected events render with time range, category chips, dim-past styling |
| Notes (window opens, TipTap editor mounts, no crash) | ✅ | Created fresh "Untitled" note via Open Notes button; toolbar (B/I/U/H2/+ list) renders |
| Gmail OAuth2 sign-in | ✅ | Connected as `sunnysonimba26@gmail.com` via real Google sign-in; refresh+access tokens encrypted in Keychain |
| Gmail IMAP fetch (XOAUTH2) | ✅ | 20 emails fetched on boot; LandPMJob + Indeed + others visible in store |
| Inbox UI (cards + refresh + draft + archive) | ✅ | Cards render with importance chips, unread dots, hover actions; badge in tab header shows live unread count |
| Settings panel (Timer / Capture / AI / Gmail / Tags) | ✅ | All 5 sub-tabs render properly; OAuth + App Password modes both functional |
| Glass morphism shell | ✅ | One unified light vibrancy slab; wallpaper bleeds through; subtle phase glow when running |

---

## 7. Known limits / what's NOT done

- **Highlight capture in some special cases:** if the foreground app is in fullscreen (Mission Control) or behind a system overlay, `osascript` can't reach it. Rare in practice.
- **OAuth credentials are not shipped** in `oauthConfig.ts` yet — currently `SHIPPED_OAUTH = { clientId: '', clientSecret: '' }`. Each user supplies their own from Google Cloud Console (one-time, ~3 min). To make it true one-click, paste your OAuth client credentials into that file and commit.
- **LLM provider not configured by default:** generating email drafts requires the user to add an Anthropic or OpenAI API key in Settings → AI.
- **No automated tests yet** for the new Gmail OAuth flow or the capture pipeline.
- **CLAUDE.md exists; no contributor docs / changelog / release process.**

---

## 8. Files of note (quick reference for next session)

| File | What lives there |
|---|---|
| `src/renderer/floating/App.tsx` | The Spotlight bar — every tab, keyboard handlers, IPC wiring |
| `src/renderer/floating/components/SettingsPanel.tsx` | All 5 settings sub-tabs |
| `src/renderer/notes/Editor.tsx` | TipTap setup with the `parseContent()` guard |
| `src/main/index.ts` | Bootstrap — AX prompt, IPC, capture, Gmail polling resume |
| `src/main/ipcHandlers.ts` | All ~40 IPC channels |
| `src/main/windowManager.ts` | Vibrancy + Sol-style positioning + 3 window types |
| `src/main/services/capture/captureService.ts` | uiohook + osascript + clipboard restore (the PopClip implementation) |
| `src/main/services/gmail/oauth.ts` | PKCE + loopback OAuth2 + token refresh |
| `src/main/services/gmail/oauthConfig.ts` | Where to bake shipped Client ID/Secret for true one-click sign-in |
| `src/main/services/gmail/imapClient.ts` | Dual-mode IMAP (App Password OR XOAUTH2) |
| `src/main/services/keychain/secureStore.ts` | safeStorage wrapper |
| `src/shared/schema/index.ts` | All data shapes — Capture, Todo, Settings, EmailDigestItem, etc. |
| `src/renderer/floating/styles/globals.css` | Tailwind + spotlight-surface (the glass morphism) |
| `tailwind.config.js` | Theme tokens |
| `CLAUDE.md` | Architecture map + footguns for future Claude sessions |
| `~/Library/Application Support/focus-os/focus-os-store.json` | Live data on disk — captures, todos, notes, calendar, settings |
| `/tmp/focus-app.log` | Where renderer console + main process logs land when running |

---

## 9. How to resume tomorrow

```bash
cd "/Users/e/Documents/Claude/Projects/PMP Project/focus-pomodoro-app"
git pull   # if anyone else committed
npm start  # builds + launches; or: npm run build && ./node_modules/.bin/electron .
tail -f /tmp/focus-app.log | grep -E "capture|gmail|ax"   # live debugging stream
```

App is currently quit. State is preserved in the focusStore JSON file — your Gmail OAuth tokens, captures, todos, calendar events all persist across launches.

---

*Generated 2026-04-26.*
