import { app, screen, globalShortcut, systemPreferences } from 'electron';
import { windowManager } from './windowManager';
import { setupIPC } from './ipcHandlers';
import { appTracker } from './appTracker';
import { focusStore } from './services/store';
import { captureService } from './services/capture/captureService';
import { promptAccessibilityPermission } from './services/capture/permissionCheck';
import { gmailService } from './services/gmail/gmailService';

process.on('uncaughtException',  (err)    => console.error('[main] Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('[main] Unhandled rejection:', reason));

// Mark app as NOT quitting by default (used by notes window hide-on-close guard)
(app as any).isQuitting = false;

app.whenReady().then(async () => {
  console.log('[main] App ready, platform:', process.platform);
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  // ── Init store (electron-store creates the file on first access) ──────
  let settings: any;
  try {
    settings = focusStore.getSettings();
    console.log('[main] focusStore OK, onboarding:', settings.hasCompletedOnboarding);
  } catch (e: any) {
    console.error('[main] focusStore FAILED:', e.message);
    settings = { captureShortcut: 'CommandOrControl+Shift+C', gmailEnabled: false };
  }

  // ── IPC ───────────────────────────────────────────────────────────────
  setupIPC();
  console.log('[main] IPC handlers registered');

  // ── Windows ────────────────────────────────────────────────────────────
  windowManager.createFloatingWindow();
  windowManager.createFreezeWindows();
  windowManager.createTray();

  // ── App / window tracking (eye strain shield) ─────────────────────────
  appTracker.start();

  // ── Global shortcuts ──────────────────────────────────────────────────
  // Timer toggle
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    windowManager.sendToFloating('timer:toggle', undefined);
  });

  // Pill toggle
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const win = windowManager.floatingWindow;
    if (win) win.isVisible() ? win.hide() : win.show();
  });

  // Notes window toggle (open the persistent desktop doc from anywhere)
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    windowManager.toggleNotesWindow();
  });

  // Cold-start: prompt for Accessibility permission so the OS dialog appears
  // on first launch. Without this, the auto-capture poll silently no-ops
  // forever and users have no idea why highlights aren't being saved.
  if (process.platform === 'darwin') {
    const granted = promptAccessibilityPermission();
    console.log(`[main] Accessibility permission granted: ${granted}`);
  }

  // Capture shortcut + auto-poll (registered by captureService)
  captureService.start(settings.captureShortcut, (capture) => {
    windowManager.sendToFloating('capture:new', capture);
    // Also forward to notes window if it's open
    windowManager.notesWindow?.webContents?.send('capture:new', capture);
  });

  // ── Resume Gmail polling if connected ─────────────────────────────────
  if (settings.gmailEnabled) {
    gmailService.startPolling((items) => {
      windowManager.sendToFloating('gmail:newEmails', items);
    });
  }

  // ── Multi-display support ─────────────────────────────────────────────
  screen.on('display-added',          () => windowManager.rebuildFreezeWindows());
  screen.on('display-removed',        () => windowManager.rebuildFreezeWindows());
  screen.on('display-metrics-changed',() => windowManager.rebuildFreezeWindows());

  app.on('activate', () => windowManager.floatingWindow?.show());
});

app.on('window-all-closed', () => { /* live in tray */ });

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  captureService.stop();
  gmailService.stopPolling();
  windowManager.destroyAll();
});
