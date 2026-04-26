import { BrowserWindow, screen, Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';
import { IPC } from '../renderer/shared/types';
import type { TimerPhase } from '../renderer/shared/types';
import { PHASE_LABELS } from '../renderer/shared/constants';

const PHASE_TRAY_COLORS: Record<string, string> = {
  focus: '#ef4444', break: '#22c55e', longBreak: '#3b82f6',
};

function getRendererUrl(page: string): string {
  return `file://${path.join(__dirname, '..', '..', 'renderer', 'src', 'renderer', page, 'index.html')}`;
}
function getPreloadPath(name: string): string {
  return path.join(__dirname, '..', 'preload', `${name}.js`);
}

function makeTrayIcon(progress: number, color: string): Electron.NativeImage {
  try {
    const size = 32, r = 12, cx = size / 2, cy = size / 2;
    const c = 2 * Math.PI * r;
    const dash = c * Math.max(0, Math.min(1, progress));
    const gap  = c - dash;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="3"
        stroke-dasharray="${dash} ${gap}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="4" fill="${color}"/>
    </svg>`;
    return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  } catch {
    return nativeImage.createEmpty();
  }
}

export class WindowManager {
  floatingWindow: BrowserWindow | null = null;
  notesWindow:    BrowserWindow | null = null;
  private freezeWindows: BrowserWindow[] = [];
  tray: Tray | null = null;
  private savedBounds: Electron.Rectangle | null = null;
  private freezeActive = false;
  private islandSavedBounds: Electron.Rectangle | null = null;
  private sidebarExpanded = false;
  private lastTrayProgress = -1;
  private lastTrayPhase: TimerPhase | null = null;

  // ── Spotlight-style command bar ────────────────────────────────────────
  // Modeled on https://github.com/ospfranco/sol — top-center, biased above
  // the vertical midline (Sol uses visibleFrame.height * 0.3 above center).
  // Uses macOS `vibrancy` for true NSVisualEffectView blur instead of CSS.
  createFloatingWindow(): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay();
    const { x: dx, y: dy, width: dw, height: dh } = workArea;

    const BAR_W = 728, BAR_H = 72;
    // Sol-inspired positioning: horizontal center, ~25% from top
    const x = dx + Math.round((dw - BAR_W) / 2);
    const y = dy + Math.round(dh * 0.18);

    const win = new BrowserWindow({
      width: BAR_W, height: BAR_H,
      x, y,
      frame: false, transparent: true, hasShadow: true,
      alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: true, show: false,
      // 'fullscreen-ui' renders as a unified light-grey glass slab without
      // the boxy dark "panel" feel that 'hud' gave us. Combined with the
      // light CSS tint in spotlight-surface, the result is one continuous
      // glass-morphism surface instead of a glass-over-black-pill sandwich.
      vibrancy: 'fullscreen-ui',
      visualEffectState: 'active',
      webPreferences: {
        preload: getPreloadPath('floatingPreload'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.loadURL(getRendererUrl('floating'));
    win.once('ready-to-show', () => { win.show(); });
    setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 500);
    // Forward renderer console + crash diagnostics to the terminal log.
    win.webContents.on('console-message', (_e, level, msg, line, src) => {
      if (level >= 2) console.log(`[renderer:${level}] ${msg} (${src}:${line})`);
    });
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[renderer:GONE]', details);
    });

    this.floatingWindow = win;
    return win;
  }

  // ── Sidebar toggle ──────────────────────────────────────────────────────
  toggleSidebar(): { expanded: boolean } {
    this.sidebarExpanded = !this.sidebarExpanded;
    if (this.sidebarExpanded) {
      // Expand window to accommodate sidebar (pill + 340px sidebar)
      const win = this.floatingWindow;
      if (win && !win.isDestroyed()) {
        const [, h] = win.getSize();
        win.setSize(420 + 340, Math.max(h, 540), true);
      }
    } else {
      const win = this.floatingWindow;
      if (win && !win.isDestroyed()) {
        win.setSize(400, 180, true);
      }
    }
    return { expanded: this.sidebarExpanded };
  }

  // ── Notes window (persistent desktop doc — hide on close, never destroy) ──
  createNotesWindow(): BrowserWindow {
    const { workArea } = screen.getPrimaryDisplay();

    const win = new BrowserWindow({
      width: 920, height: 680,
      x: workArea.x + 40, y: workArea.y + 60,
      title: 'Focus Notes',
      frame: true, transparent: false,
      resizable: true, movable: true,
      // Don't show in dock as a separate app — pill owns the dock presence
      skipTaskbar: false,
      webPreferences: {
        preload: getPreloadPath('notesPreload'),
        contextIsolation: true, nodeIntegration: false, sandbox: false,
      },
    });

    win.loadURL(getRendererUrl('notes'));

    // Hide instead of close — preserves state, feels like a real desktop app
    win.on('close', (e) => {
      if (!(app as any).isQuitting) {
        e.preventDefault();
        win.hide();
      }
    });

    this.notesWindow = win;
    return win;
  }

  openNotesWindow(noteId?: string): void {
    const win = this.notesWindow && !this.notesWindow.isDestroyed()
      ? this.notesWindow
      : this.createNotesWindow();

    if (win.isVisible()) {
      win.focus();
    } else {
      win.show();
      win.focus();
    }

    if (noteId) win.webContents.send('notes:openNote', noteId);
  }

  toggleNotesWindow(): void {
    const win = this.notesWindow && !this.notesWindow.isDestroyed()
      ? this.notesWindow
      : this.createNotesWindow();

    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  }

  // ── Freeze windows ──────────────────────────────────────────────────────
  createFreezeWindows() { this.rebuildFreezeWindows(); }

  rebuildFreezeWindows() {
    const displays = screen.getAllDisplays();
    if (this.freezeWindows.length === displays.length) {
      for (let i = 0; i < displays.length; i++) {
        const { x, y, width, height } = displays[i].bounds;
        if (!this.freezeWindows[i].isDestroyed()) {
          this.freezeWindows[i].setBounds({ x, y, width, height });
        }
      }
      return;
    }
    for (const win of this.freezeWindows) { try { win.destroy(); } catch { /* ignore */ } }
    this.freezeWindows = [];

    for (const display of displays) {
      const { x, y, width, height } = display.bounds;
      const win = new BrowserWindow({
        x, y, width, height,
        frame: false, transparent: false, backgroundColor: '#0a0a12',
        skipTaskbar: true, show: false, focusable: true,
        webPreferences: {
          preload: getPreloadPath('freezePreload'),
          contextIsolation: true, nodeIntegration: false, sandbox: false,
        },
      });
      win.on('close', (e) => { if (this.freezeActive) e.preventDefault(); });
      win.loadURL(getRendererUrl('freeze'));
      this.freezeWindows.push(win);
    }
  }

  // ── Tray ────────────────────────────────────────────────────────────────
  createTray() {
    const icon = makeTrayIcon(1, '#ef4444');
    this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
    this.tray.setToolTip('Focus OS');
    const menu = Menu.buildFromTemplate([
      { label: 'Show',  click: () => this.floatingWindow?.show() },
      { label: 'Notes', click: () => this.openNotesWindow() },
      { type: 'separator' },
      { label: 'Quit',  click: () => app.quit() },
    ]);
    this.tray.setContextMenu(menu);
    this.tray.on('click', () => {
      const win = this.floatingWindow;
      if (win) win.isVisible() ? win.hide() : win.show();
    });
  }

  updateTrayProgress(remaining: number, total: number, phase: TimerPhase) {
    if (!this.tray) return;
    try {
      const progress = total > 0 ? remaining / total : 1;
      const shouldRedraw = Math.abs(progress - this.lastTrayProgress) > 0.005 || phase !== this.lastTrayPhase;
      if (shouldRedraw) {
        const color = PHASE_TRAY_COLORS[phase] ?? '#ef4444';
        this.tray.setImage(makeTrayIcon(progress, color).resize({ width: 16, height: 16 }));
        this.lastTrayProgress = progress;
        this.lastTrayPhase    = phase;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      this.tray.setToolTip(`Focus OS — ${m}:${s.toString().padStart(2, '0')} (${PHASE_LABELS[phase]})`);
    } catch { /* ignore */ }
  }

  showFreeze() {
    this.freezeActive = true;
    if (this.floatingWindow) {
      this.savedBounds = this.floatingWindow.getBounds();
      this.floatingWindow.hide();
    }
    this.rebuildFreezeWindows();
    for (const win of this.freezeWindows) {
      if (win.isDestroyed()) continue;
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setSimpleFullScreen(true);
      win.show();
    }
  }

  hideFreeze() {
    this.freezeActive = false;
    for (const win of this.freezeWindows) {
      try { if (!win.isDestroyed()) { win.setSimpleFullScreen(false); win.hide(); } } catch { /* ignore */ }
    }
    if (this.floatingWindow) {
      if (this.savedBounds) this.floatingWindow.setBounds(this.savedBounds);
      this.floatingWindow.show();
    }
  }

  resizeFloating(height: number, width?: number, isIsland?: boolean) {
    const win = this.floatingWindow;
    if (!win || win.isDestroyed()) return;
    const [w] = win.getSize();
    const targetW = width ?? w;

    if (isIsland) {
      if (!this.islandSavedBounds) this.islandSavedBounds = win.getBounds();
      const currentDisplay = screen.getDisplayMatching(win.getBounds());
      const { workArea } = currentDisplay;
      const newX = workArea.x + Math.round((workArea.width - targetW) / 2);
      win.setBounds({ x: newX, y: workArea.y + 12, width: targetW, height }, true);
    } else if (isIsland === false && this.islandSavedBounds) {
      // Always recenter when restoring from island — Spotlight pattern
      const display = screen.getDisplayMatching(win.getBounds());
      const { workArea } = display;
      const newX = workArea.x + Math.round((workArea.width - targetW) / 2);
      win.setBounds({ x: newX, y: workArea.y + 12, width: targetW, height }, true);
      this.islandSavedBounds = null;
    } else {
      // Spotlight stays top-center on every resize, expanding downward
      const [, y] = win.getPosition();
      const display = screen.getDisplayMatching(win.getBounds());
      const { workArea } = display;
      const newX = workArea.x + Math.round((workArea.width - targetW) / 2);
      win.setBounds({ x: newX, y, width: targetW, height }, true);
    }
  }

  updateEmailBadge(_show: boolean) { /* no-op in focus-os v1 */ }

  sendToFloating(channel: string, ...args: unknown[]) {
    this.floatingWindow?.webContents?.send(channel, ...args);
  }
  sendToFreeze(channel: string, ...args: unknown[]) {
    for (const win of this.freezeWindows) {
      try { win.webContents.send(channel, ...args); } catch { /* ignore */ }
    }
  }
  sendToAll(channel: string, ...args: unknown[]) {
    this.sendToFloating(channel, ...args);
    this.sendToFreeze(channel, ...args);
  }

  destroyAll() {
    this.freezeActive = false;
    this.floatingWindow?.destroy();
    this.notesWindow?.destroy();
    for (const win of this.freezeWindows) { try { win.destroy(); } catch { /* ignore */ } }
    this.floatingWindow = null;
    this.notesWindow    = null;
    this.freezeWindows  = [];
  }
}

export const windowManager = new WindowManager();
