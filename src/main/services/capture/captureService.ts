import { app, globalShortcut, clipboard, Notification } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';
import { focusStore } from '../store';
import { checkAccessibilityPermission } from './permissionCheck';
import type { Capture } from '../../../shared/schema/index';

// Global mouse/keyboard hooks. Lets us detect "user just released the mouse
// after dragging" — a strong signal that they finished selecting text — even
// inside Electron-based apps where AXSelectedText is blank. Same trick PopClip
// and Highlights use. Requires Accessibility permission for Focus OS itself.
import { uIOhook, UiohookMouseEvent } from 'uiohook-napi';

// ── Clipboard-fallback capture ───────────────────────────────────────────────
// The "AX without clipboard touch" path requires the helper binary itself to
// be in System Settings → Privacy → Accessibility, which most users will never
// do. The clipboard path works on every install: save clipboard, send Cmd+C
// via osascript (osascript inherits AX from the system), read clipboard,
// restore. Restoration happens fast enough that the user shouldn't notice.
function captureViaClipboard(): Promise<string> {
  return new Promise((resolve) => {
    const originalText  = clipboard.readText() || '';
    const originalImage = clipboard.readImage();
    const hadImage      = !originalImage.isEmpty();
    // Clear clipboard so we can detect whether Cmd+C actually wrote anything
    // (otherwise we'd just re-read whatever was already there).
    clipboard.clear();
    execFile('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down'],
      { timeout: 1500 },
      (err) => {
        if (err) {
          console.warn('[capture] osascript Cmd+C failed:', err.message);
          // Restore original
          if (hadImage) clipboard.writeImage(originalImage);
          else if (originalText) clipboard.writeText(originalText);
          resolve(''); return;
        }
        // Brief delay so the OS finishes the copy operation
        setTimeout(() => {
          const captured = clipboard.readText().trim();
          // Restore original clipboard so user doesn't lose what they had
          if (hadImage) clipboard.writeImage(originalImage);
          else if (originalText) clipboard.writeText(originalText);
          else clipboard.clear();
          resolve(captured);
        }, 120);
      }
    );
  });
}

// ── Read selected text via macOS Accessibility API (no clipboard touch) ──────
// Previously this spawned `swift -e <snippet>` on every poll, which recompiled
// the helper each time (1-3s startup). Now we compile it ONCE on first run,
// cache the binary in `userData`, then `execFile` the binary on each poll
// (~10-30ms). The binary prints selected text to stdout, exits 0.
const SWIFT_SOURCE = `
import Cocoa
let elem = AXUIElementCreateSystemWide()
var focused: AnyObject?
AXUIElementCopyAttributeValue(elem, kAXFocusedUIElementAttribute as CFString, &focused)
if let el = focused {
  var sel: AnyObject?
  AXUIElementCopyAttributeValue(el as! AXUIElement, kAXSelectedTextAttribute as CFString, &sel)
  if let text = sel as? String, !text.isEmpty {
    print(text)
  }
}
`;

let helperBinaryPath: string | null = null;
let helperBuildAttempted = false;

function getHelperPath(): string {
  return path.join(app.getPath('userData'), 'ax-selection-reader');
}

/**
 * Compile the Swift helper once, cache it under userData. Returns the binary
 * path on success, or null if compilation failed (e.g. xcrun missing).
 */
async function ensureHelperBuilt(): Promise<string | null> {
  if (helperBinaryPath) return helperBinaryPath;
  if (helperBuildAttempted) return null;
  helperBuildAttempted = true;

  const target = getHelperPath();
  if (fs.existsSync(target)) { helperBinaryPath = target; return target; }

  const sourcePath = path.join(app.getPath('userData'), 'ax-selection-reader.swift');
  fs.writeFileSync(sourcePath, SWIFT_SOURCE);

  return new Promise((resolve) => {
    // `xcrun -f swiftc` then compile. swiftc is faster + more reliable than swift -e.
    execFile('xcrun', ['swiftc', '-O', sourcePath, '-o', target], { timeout: 30_000 }, (err) => {
      if (err) {
        console.warn('[captureService] Failed to compile helper:', err.message);
        resolve(null);
      } else {
        helperBinaryPath = target;
        console.log(`[captureService] Compiled AX helper -> ${target}`);
        resolve(target);
      }
    });
  });
}

// Periodic logging so we can debug "I highlighted but nothing saved".
let _axCallCounter = 0;
const AX_LOG_EVERY = 5;

// AppleScript-based AX read. Unlike a spawned `swift` binary, osascript talks
// to the System Events daemon which already has the AX privileges it needs.
// This means we can read AXSelectedText from any focused control without
// granting AX to a helper binary, and WITHOUT touching the clipboard.
const AX_READ_SCRIPT = `try
  tell application "System Events"
    set procs to every process whose frontmost is true
    if (count of procs) is 0 then return ""
    set frontProc to item 1 of procs
    set focusedEl to value of attribute "AXFocusedUIElement" of frontProc
    set selText to value of attribute "AXSelectedText" of focusedEl
    if selText is missing value then return ""
    return selText
  end tell
on error
  return ""
end try`;

function readSelectedTextViaAX(): Promise<string> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', AX_READ_SCRIPT], { timeout: 1500 }, (err, stdout, stderr) => {
      _axCallCounter++;
      const text = err ? '' : stdout.trim();
      if (_axCallCounter % AX_LOG_EVERY === 0 || text.length > 0) {
        const stderrStr = stderr ? String(stderr).trim() : '';
        console.log(`[ax] poll#${_axCallCounter} text.len=${text.length}${err ? ` err=${err.message.slice(0,60)}` : ''}${stderrStr ? ` stderr=${stderrStr.slice(0,80)}` : ''}`);
      }
      resolve(text);
    });
  });
}

// ── Auto-capture: watch for selection changes ────────────────────────────────
// Poll AXSelectedText every ~600ms. When text appears, wait for it to be stable
// for one more tick (user finished selecting), then capture automatically.
// Zero clipboard touch — purely reads from the focused element's AX attribute.

const POLL_INTERVAL_MS  = 600;   // how often we check
const STABLE_TICKS      = 1;     // ticks text must be unchanged before capture
const MIN_AUTO_LENGTH   = 20;    // ignore tiny accidental selections
const DEBOUNCE_SAME_MS  = 30_000; // don't recapture identical text within 30s

let lastCaptureTick = 0;
const DEBOUNCE_MS = 300;

export class CaptureService {
  private onCaptureCallback: ((c: Capture) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingText = '';
  private pendingTicks = 0;
  private lastAutoText = '';
  private lastAutoTime = 0;

  start(shortcut: string, onCapture: (c: Capture) => void) {
    this.onCaptureCallback = onCapture;

    // ── Manual shortcuts ──────────────────────────────────────────────────
    // Register the configured shortcut PLUS a fallback (Cmd+Option+C). Cmd+Shift+C
    // is hijacked by Chrome/Safari DevTools "Inspect Element" mode and several
    // other apps, so it often never reaches us. Cmd+Option+C is far less common.
    const fire = (origin: string) => {
      console.log(`[captureService] >>> SHORTCUT FIRED via ${origin}`);
      const now = Date.now();
      if (now - lastCaptureTick < DEBOUNCE_MS) return;
      lastCaptureTick = now;
      this.captureSelection('shortcut');
    };

    // Cmd+Option+C and Cmd+Shift+9 are picked specifically because they don't
    // collide with: browser DevTools (Cmd+Shift+C), system Save-As (Cmd+Shift+S),
    // Spotlight (Cmd+Space), Hide-Others (Cmd+Option+H), or any common app shortcut.
    const shortcuts = [shortcut, 'CommandOrControl+Alt+C', 'CommandOrControl+Shift+9'];
    for (const sc of shortcuts) {
      try {
        const ok = globalShortcut.register(sc, () => fire(sc));
        if (ok) console.log(`[captureService] Shortcut registered: ${sc}`);
        else    console.warn(`[captureService] Failed to register: ${sc} (already taken)`);
      } catch (err) {
        console.warn(`[captureService] Register error for ${sc}:`, (err as Error).message);
      }
    }

    // ── Auto-capture poll ────────────────────────────────────────────────
    this.startAutoCapturePoll();
  }

  stop() {
    globalShortcut.unregisterAll();
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.hookStarted) {
      try { uIOhook.stop(); } catch { /* ignore */ }
      this.hookStarted = false;
    }
  }

  // ── Auto-capture: mouse-driven (PopClip pattern) ─────────────────────────
  // Listen for global mouse-down → mouse-up. If the cursor moved more than
  // a few pixels (i.e. user dragged to select text), briefly synthesize
  // Cmd+C, read clipboard, then RESTORE the original clipboard. This works
  // in EVERY app — including Electron apps like Claude, VSCode, Slack — and
  // requires no per-app integration. Apple Accessibility permission for
  // Focus OS is still required (for the global mouse hook itself).
  private mouseDownX = 0;
  private mouseDownY = 0;
  private hookStarted = false;
  // True while a captureFromMouseUp is in progress. Prevents queued osascript
  // spawns from piling up when the user does many drags in quick succession.
  // (Was the root cause of "the app freezes when I drag windows around.")
  private captureInFlight = false;
  // Min ms between consecutive auto-captures, regardless of selection content.
  // 800ms feels instant for selection workflows but rate-limits window/scroll drags.
  private static readonly MOUSEUP_COOLDOWN_MS = 800;
  private lastMouseupCaptureAt = 0;
  // Drag must be at least this many pixels — filters out idle clicks AND tiny
  // accidental wiggles that happen when releasing a normal click.
  private static readonly DRAG_THRESHOLD_PX = 12;

  private startAutoCapturePoll() {
    if (this.hookStarted) return;
    try {
      uIOhook.on('mousedown', (e: UiohookMouseEvent) => {
        this.mouseDownX = e.x;
        this.mouseDownY = e.y;
      });
      uIOhook.on('mouseup', (e: UiohookMouseEvent) => {
        if (e.button !== 1) return;
        const dx = Math.abs(e.x - this.mouseDownX);
        const dy = Math.abs(e.y - this.mouseDownY);
        // Drag too short → not a text selection (just a click or tiny wiggle)
        if (dx + dy < CaptureService.DRAG_THRESHOLD_PX) return;
        // Already capturing → skip; prevents osascript queue buildup
        if (this.captureInFlight) return;
        // Cooldown — don't fire faster than 800ms even if user is dragging
        // wildly. This is what stops the app from feeling "frozen" when the
        // user moves a window or selects across multiple lines rapidly.
        const now = Date.now();
        if (now - this.lastMouseupCaptureAt < CaptureService.MOUSEUP_COOLDOWN_MS) return;
        this.lastMouseupCaptureAt = now;
        this.captureInFlight = true;
        // 80ms settle so the host app finishes updating its selection state
        setTimeout(() => {
          this.captureFromMouseUp().finally(() => { this.captureInFlight = false; });
        }, 80);
      });
      uIOhook.start();
      this.hookStarted = true;
      console.log('[capture] auto-watch started: global mouse-up hook (PopClip pattern)');
    } catch (err) {
      console.error('[capture] Failed to start uIOhook:', (err as Error).message);
    }
  }

  /**
   * Save current clipboard, send Cmd+C via osascript, read what landed,
   * restore original clipboard, dedupe, save. Works in every app.
   * MUST be guarded by `captureInFlight` upstream — concurrent invocations
   * race the clipboard state and corrupt restoration.
   */
  private async captureFromMouseUp() {
    const originalText  = clipboard.readText() || '';
    const originalImage = clipboard.readImage();
    const hadImage      = !originalImage.isEmpty();

    clipboard.clear();

    await new Promise<void>((resolve) => {
      execFile('osascript', ['-e', 'tell application "System Events" to keystroke "c" using command down'],
        { timeout: 1500 },
        () => resolve()
      );
    });
    await new Promise(r => setTimeout(r, 90));

    const captured = clipboard.readText().trim();

    // Restore the user's original clipboard before any further work
    if (hadImage)          clipboard.writeImage(originalImage);
    else if (originalText) clipboard.writeText(originalText);
    else                   clipboard.clear();

    if (!captured || captured.length < MIN_AUTO_LENGTH) return;

    const now = Date.now();
    if (captured === this.lastAutoText && now - this.lastAutoTime < DEBOUNCE_SAME_MS) return;
    this.lastAutoText = captured;
    this.lastAutoTime = now;

    console.log(`[capture] MOUSE-UP → captured ${captured.length} chars`);
    this.saveCapturedText(captured, 'highlight');
  }

  /** Save text directly without re-reading AX/clipboard. Used by auto-watch. */
  private async saveCapturedText(text: string, source: 'highlight' | 'shortcut') {
    let sourceApp: string | undefined;
    let sourceUrl: string | undefined;
    try {
      const activeWin = require('active-win');
      const win = await activeWin();
      sourceApp = win?.owner?.name;
      sourceUrl = (win as any)?.url;
    } catch { /* optional */ }

    const capture: Capture = {
      id: uuid(),
      text: text.trim(),
      source,
      sourceApp,
      sourceUrl,
      createdAt: Date.now(),
      pinned: false,
    };

    focusStore.addCapture(capture);
    this.onCaptureCallback?.(capture);
    console.log(`[captureService] Captured ${text.length} chars from ${sourceApp ?? 'unknown'} (${source})`);

    try {
      if (Notification.isSupported()) {
        new Notification({
          title: `📎 Captured ${text.length} chars`,
          body: text.slice(0, 120) + (text.length > 120 ? '…' : ''),
          subtitle: sourceApp,
          silent: true,  // no sound for auto-captures (would be annoying)
        }).show();
      }
    } catch { /* notification is optional */ }

    this.autoCategorizeAsync(capture);
  }

  // ── Core capture ──────────────────────────────────────────────────────────
  private async captureSelection(source: 'highlight' | 'shortcut' = 'highlight') {
    // For manual shortcut: use clipboard first (it works without per-binary AX
    // grants). For auto-poll: try AX first; if it returned nothing AND we
    // somehow got here, fall through to clipboard as last resort.
    let text = '';
    if (source === 'shortcut') {
      console.log('[captureService] Manual shortcut → trying clipboard capture');
      text = await captureViaClipboard();
      if (text) console.log(`[captureService] Clipboard capture succeeded: ${text.length} chars`);
    } else {
      // Auto-poll already verified AX returned text (otherwise we wouldn't be here)
      text = await readSelectedTextViaAX();
    }

    if (!text) {
      console.log('[captureService] Nothing captured (no selection or AX denied for helper binary)');
      return;
    }
    if (text.length < MIN_AUTO_LENGTH && source === 'highlight') {
      console.log(`[captureService] Suppressing auto-capture: only ${text.length} chars`);
      return;
    }

    // Get source app/URL for provenance
    let sourceApp: string | undefined;
    let sourceUrl: string | undefined;
    try {
      const activeWin = require('active-win');
      const win = await activeWin();
      sourceApp = win?.owner?.name;
      sourceUrl = (win as any)?.url;
    } catch { /* optional */ }

    const capture: Capture = {
      id: uuid(),
      text: text.trim(),
      source,
      sourceApp,
      sourceUrl,
      createdAt: Date.now(),
      pinned: false,
    };

    focusStore.addCapture(capture);
    this.onCaptureCallback?.(capture);
    console.log(`[captureService] Captured ${text.length} chars from ${sourceApp ?? 'unknown'} (${source})`);

    // Native macOS notification — proves to the user that the capture fired
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: `📎 Captured ${text.length} chars`,
          body: text.slice(0, 120) + (text.length > 120 ? '…' : ''),
          subtitle: sourceApp,
          silent: false,
        }).show();
      }
    } catch (err) {
      console.warn('[captureService] Notification failed:', (err as Error).message);
    }

    // Auto-categorize in the background (non-blocking)
    this.autoCategorizeAsync(capture);
  }

  private async autoCategorizeAsync(capture: Capture) {
    try {
      const { autoCategorize } = await import('../notes/autoCategorize');
      const category = await autoCategorize(capture.text);
      if (category) {
        focusStore.updateCapture(capture.id, { category });
        this.onCaptureCallback?.({ ...capture, category });
      }
    } catch { /* classifier is optional */ }
  }
}

export const captureService = new CaptureService();
