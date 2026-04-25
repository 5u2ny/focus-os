import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../renderer/shared/types';
import type { AppSettings } from '../renderer/shared/types';

contextBridge.exposeInMainWorld('focusAPI', {
  // ── Timer ──────────────────────────────────────────────────────────────
  startTimer:   () => ipcRenderer.invoke(IPC.TIMER_START),
  pauseTimer:   () => ipcRenderer.invoke(IPC.TIMER_PAUSE),
  resetTimer:   () => ipcRenderer.invoke(IPC.TIMER_RESET),
  skipPhase:    () => ipcRenderer.invoke(IPC.TIMER_SKIP_PHASE),
  toggleTimer:  () => ipcRenderer.invoke('timer:toggle'),
  setTask:      (task: string) => ipcRenderer.invoke(IPC.TASK_SET, task),
  getSettings:  () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (s: AppSettings) => ipcRenderer.invoke(IPC.SETTINGS_SET, s),
  getState:     () => ipcRenderer.invoke(IPC.STATE_GET),
  resizeWindow: (height: number, width?: number, isIsland?: boolean) =>
    ipcRenderer.invoke(IPC.WINDOW_RESIZE, height, width, isIsland),

  // ── Timer push ─────────────────────────────────────────────────────────
  onTimerTick:        (cb: (d: any) => void) => ipcRenderer.on(IPC.TIMER_TICK,         (_e, d) => cb(d)),
  onPhaseChanged:     (cb: (d: any) => void) => ipcRenderer.on(IPC.TIMER_PHASE_CHANGED,(_e, d) => cb(d)),
  onFreezeEnter:      (cb: (d: any) => void) => ipcRenderer.on(IPC.FREEZE_ENTER,       (_e, d) => cb(d)),
  onFreezeTick:       (cb: (d: any) => void) => ipcRenderer.on(IPC.FREEZE_TICK,        (_e, d) => cb(d)),
  onFreezeExit:       (cb: () => void)        => ipcRenderer.on(IPC.FREEZE_EXIT,        () => cb()),
  onStateUpdated:     (cb: (d: any) => void) => ipcRenderer.on(IPC.STATE_UPDATED,      (_e, d) => cb(d)),
  removeAllListeners: (channel: string)       => ipcRenderer.removeAllListeners(channel),

});

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, req?: any) => ipcRenderer.invoke(channel, req),
  on:     (channel: string, cb: (data: any) => void) => {
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  off: (channel: string) => ipcRenderer.removeAllListeners(channel),
});
