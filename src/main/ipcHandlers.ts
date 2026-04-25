import { ipcMain } from 'electron';
import { IPC } from '../renderer/shared/types';
import type { AppSettings } from '../renderer/shared/types';
import { stateStore } from './stateStore';
import { TimerEngine } from './timerEngine';
import { freezeController } from './freezeController';
import { windowManager } from './windowManager';
import { showPhaseNotification } from './notificationManager';
import { playAlertSound } from './soundManager';
// ── Focus OS services ───────────────────────────────────────────────────────
import { focusStore } from './services/store';
import { secureStore } from './services/keychain/secureStore';
import { checkAccessibilityPermission, openAccessibilitySettings } from './services/capture/permissionCheck';
import { notesService } from './services/notes/notesService';
import { todoService } from './services/todo/todoService';
import { calendarService } from './services/calendar/calendarService';
import { gmailService } from './services/gmail/gmailService';
import { v4 as uuid } from 'uuid';

let timerEngine: TimerEngine;

export function setupIPC() {
  timerEngine = new TimerEngine(stateStore.getSnapshot().settings);

  // ── Timer engine events → renderer ────────────────────────────────────
  timerEngine.on('tick', (data) => {
    stateStore.updateSilent({
      remainingSeconds: data.remainingSeconds,
      phase: data.phase,
      isRunning: data.isRunning,
    });
    windowManager.sendToFloating(IPC.TIMER_TICK, data);
    try {
      windowManager.updateTrayProgress(data.remainingSeconds, timerEngine.totalSeconds, data.phase);
    } catch { /* ignore */ }
  });

  timerEngine.on('stateChanged', () => {
    stateStore.update({
      remainingSeconds: timerEngine.remainingSeconds,
      totalSeconds:     timerEngine.totalSeconds,
      phase:            timerEngine.phase,
      isRunning:        timerEngine.isRunning,
      cycleCount:       timerEngine.cycleCount,
    });
  });

  timerEngine.on('phaseComplete', ({ newPhase }) => {
    const settings = stateStore.getSnapshot().settings;
    try { showPhaseNotification(newPhase, settings); } catch { /* ignore */ }
    try { playAlertSound(settings); }               catch { /* ignore */ }

    if (newPhase === 'break' || newPhase === 'longBreak') {
      const dur = Math.floor(newPhase === 'break' ? settings.breakDuration : settings.longBreakDuration);
      timerEngine.start();
      freezeController.enter(newPhase, dur, () => {
        timerEngine.resetToPhase('focus');
        if (settings.autoStartFocus) timerEngine.start();
      });
    }
  });

  stateStore.on('changed', (state) => {
    windowManager.sendToAll(IPC.STATE_UPDATED, state);
  });

  // ── Core timer IPC ────────────────────────────────────────────────────
  ipcMain.handle(IPC.TIMER_START,      () => timerEngine.start());
  ipcMain.handle(IPC.TIMER_PAUSE,      () => timerEngine.pause());
  ipcMain.handle(IPC.TIMER_RESET,      () => {
    timerEngine.reset();
    stateStore.update({ remainingSeconds: timerEngine.remainingSeconds, isRunning: false });
  });
  ipcMain.handle(IPC.TIMER_SKIP_PHASE, () => timerEngine.skipPhase());
  ipcMain.handle(IPC.TASK_SET, (_e, task: string) => stateStore.update({ currentTask: task }));
  ipcMain.handle(IPC.SETTINGS_GET, () => stateStore.getSnapshot().settings);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, s: AppSettings) => {
    stateStore.saveSettings(s);
    stateStore.update({ settings: s });
    timerEngine.updateSettings(s);
  });
  ipcMain.handle(IPC.STATE_GET,    () => stateStore.getSnapshot());
  ipcMain.handle(IPC.WINDOW_RESIZE, (_e, h: number, w?: number, isIsland?: boolean) => {
    windowManager.resizeFloating(Math.round(h), w ? Math.round(w) : undefined, isIsland);
  });

  // Timer toggle push event from renderer shortcut
  ipcMain.handle('timer:toggle', () => {
    if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
  });

  // ── Focus OS: Captures ────────────────────────────────────────────────
  ipcMain.handle('capture:list', (_e, req: { limit?: number; category?: string }) => {
    let items = focusStore.get('captures');
    if (req?.category) items = items.filter(c => c.category === req.category);
    if (req?.limit)    items = items.slice(0, req.limit);
    return items;
  });

  ipcMain.handle('capture:save', (_e, req: { text: string; source: 'highlight' | 'manual' }) => {
    const capture = {
      id: uuid(), text: req.text, source: req.source,
      createdAt: Date.now(), pinned: false,
    };
    focusStore.addCapture(capture);
    return capture;
  });

  ipcMain.handle('capture:delete', (_e, req: { id: string }) => {
    focusStore.set('captures', focusStore.get('captures').filter(c => c.id !== req.id));
  });

  ipcMain.handle('capture:pin', (_e, req: { id: string; pinned: boolean }) => {
    focusStore.updateCapture(req.id, { pinned: req.pinned });
    return focusStore.get('captures').find(c => c.id === req.id)!;
  });

  // ── Focus OS: Notes ───────────────────────────────────────────────────
  ipcMain.handle('notes:list',   ()              => notesService.list());
  ipcMain.handle('notes:get',    (_e, r)         => notesService.get(r.id));
  ipcMain.handle('notes:create', (_e, r)         => notesService.create(r));
  ipcMain.handle('notes:update', (_e, r)         => notesService.update(r.id, r.patch));
  ipcMain.handle('notes:delete', (_e, r)         => notesService.delete(r.id));

  // ── Focus OS: Todos ───────────────────────────────────────────────────
  ipcMain.handle('todo:list',      ()     => todoService.list());
  ipcMain.handle('todo:create',    (_e, r) => todoService.create(r));
  ipcMain.handle('todo:update',    (_e, r) => todoService.update(r.id, r.patch));
  ipcMain.handle('todo:setActive', (_e, r) => todoService.setActive(r.id));
  ipcMain.handle('todo:delete',    (_e, r) => todoService.delete(r.id));

  // ── Focus OS: Calendar ────────────────────────────────────────────────
  ipcMain.handle('calendar:list',   (_e, r) => calendarService.list(r.from, r.to));
  ipcMain.handle('calendar:create', (_e, r) => calendarService.create(r));
  ipcMain.handle('calendar:delete', (_e, r) => calendarService.delete(r.id));

  // ── Focus OS: Gmail ───────────────────────────────────────────────────
  ipcMain.handle('gmail:connect', async (_e, r: { email: string; appPassword: string }) => {
    const result = await gmailService.connect(r.email, r.appPassword);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
    }
    return result;
  });
  // OAuth2 path — works for Workspace accounts where App Passwords are blocked
  ipcMain.handle('gmail:oauthConnect', async (_e, r: { clientId: string; clientSecret: string }) => {
    const result = await gmailService.oauthConnect(r.clientId, r.clientSecret);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
    }
    return result;
  });
  ipcMain.handle('gmail:disconnect', () => {
    gmailService.disconnect();
    return { ok: true };
  });
  ipcMain.handle('gmail:hasShippedOAuth', () => gmailService.hasShippedOAuth());
  ipcMain.handle('gmail:fetchNow', async () => {
    const items = await gmailService.fetchNow();
    windowManager.sendToFloating('gmail:newEmails', items);
    return items;
  });
  ipcMain.handle('gmail:list',    ()      => gmailService.list());
  ipcMain.handle('gmail:archive', (_e, r) => gmailService.archive(r.id));
  ipcMain.handle('gmail:generateReply', async (_e, r: { id: string }) => {
    const email = focusStore.get('emails').find(e => e.id === r.id);
    if (!email) return '';
    const { callLLM } = await import('./services/llm/llmService');
    return callLLM([
      { role: 'system', content: 'Draft a brief, professional reply to this email.' },
      { role: 'user', content: `From: ${email.from}\nSubject: ${email.subject}\n\n${email.preview}` },
    ]);
  });

  // ── Focus OS: Settings ────────────────────────────────────────────────
  ipcMain.handle('focus:settings:get',    () => focusStore.getSettings());
  ipcMain.handle('focus:settings:update', (_e, r) => focusStore.updateSettings(r));
  ipcMain.handle('focus:settings:setLLMKey', (_e, r: { provider: 'anthropic' | 'openai'; key: string; model: string }) => {
    const encrypted = secureStore.encrypt(r.key);
    focusStore.updateSettings({
      llmProvider:          r.provider,
      llmApiKeyEncrypted:   encrypted,
      llmModel:             r.model,
    });
  });

  // ── Focus OS: Categories ──────────────────────────────────────────────
  ipcMain.handle('category:list',   ()      => focusStore.get('categories'));
  ipcMain.handle('category:create', (_e, r) => {
    const cat = { id: uuid(), name: r.name, description: r.description, color: r.color, createdAt: Date.now() };
    focusStore.set('categories', [...focusStore.get('categories'), cat]);
    return cat;
  });
  ipcMain.handle('category:delete', (_e, r) => {
    focusStore.set('categories', focusStore.get('categories').filter(c => c.id !== r.id));
  });

  // ── Focus OS: Permissions ─────────────────────────────────────────────
  ipcMain.handle('permission:checkAccessibility',    () => checkAccessibilityPermission());
  ipcMain.handle('permission:openAccessibilitySettings', () => openAccessibilitySettings());
  ipcMain.handle('system:safeStorageAvailable',       () => secureStore.isAvailable());

  // ── Focus OS: Window control ──────────────────────────────────────────
  ipcMain.handle('window:openNotes', (_e, r: { noteId?: string }) => {
    windowManager.openNotesWindow(r?.noteId);
  });
  ipcMain.handle('window:toggleSidebar', () => {
    return windowManager.toggleSidebar();
  });
  ipcMain.handle('window:openSettings', () => {
    windowManager.sendToFloating('ui:openSettings', undefined);
  });

}

export function toggleTimer() {
  if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
}
export function isTimerRunning() { return timerEngine?.isRunning || false; }
export function pauseTimer()  { if (timerEngine?.isRunning)  timerEngine.pause(); }
export function resumeTimer() { if (!timerEngine?.isRunning) timerEngine.start(); }
