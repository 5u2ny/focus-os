import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../renderer/shared/types'
import type { TimerPhase, AppSettings } from '../renderer/shared/types'

// Freeze window: exposes only what it needs
contextBridge.exposeInMainWorld('focusAPI', {
  startTimer:   () => Promise.resolve(),
  pauseTimer:   () => Promise.resolve(),
  resetTimer:   () => Promise.resolve(),
  skipPhase:    () => Promise.resolve(),
  toggleTimer:  () => Promise.resolve(),
  setTask:      (_task: string) => Promise.resolve(),
  getSettings:  () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  saveSettings: (_s: AppSettings) => Promise.resolve(),
  getState:     () => ipcRenderer.invoke(IPC.STATE_GET),
  resizeWindow: (_height: number) => Promise.resolve(),
  onTimerTick:        (_cb: (d: any) => void) => {},
  onPhaseChanged:     (_cb: (d: any) => void) => {},
  onFreezeEnter:      (cb: (d: any) => void) => { ipcRenderer.on(IPC.FREEZE_ENTER, (_e, d: { phase: TimerPhase; durationSeconds: number }) => cb(d)) },
  onFreezeTick:       (cb: (d: any) => void) => { ipcRenderer.on(IPC.FREEZE_TICK, (_e, d: { remainingSeconds: number }) => cb(d)) },
  onFreezeExit:       (cb: () => void) => { ipcRenderer.on(IPC.FREEZE_EXIT, () => cb()) },
  onStateUpdated:     (cb: (d: any) => void) => { ipcRenderer.on(IPC.STATE_UPDATED, (_e, d) => cb(d)) },
  removeAllListeners: (channel: string) => { ipcRenderer.removeAllListeners(channel) },
})
