import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { AppState, AppSettings, TimerPhase } from '../renderer/shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  focusDuration: 25 * 60,
  breakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  freezeDuration: 0,
  desktopNotifications: true,
  soundAlerts: true,
  volume: 80,
}

function defaultState(settings: AppSettings): AppState {
  return {
    phase: 'focus' as TimerPhase,
    isRunning: false,
    remainingSeconds: settings.focusDuration,
    totalSeconds: settings.focusDuration,
    cycleCount: 0,
    currentTask: '',
    isFrozen: false,
    freezeRemainingSeconds: 0,
    settings,
  }
}

class StateStore extends EventEmitter {
  private state: AppState
  private settingsPath: string

  constructor() {
    super()
    this.settingsPath = path.join(app.getPath('userData'), 'settings.json')
    const settings = this.loadSettings()
    this.state = defaultState(settings)
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = fs.readFileSync(this.settingsPath, 'utf-8')
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      }
    } catch {
      // ignore, use defaults
    }
    return { ...DEFAULT_SETTINGS }
  }

  saveSettings(settings: AppSettings): void {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch {
      // ignore
    }
  }

  update(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
    this.emit('changed', this.state)
  }

  updateSilent(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
  }

  getSnapshot(): AppState {
    return { ...this.state }
  }
}

export const stateStore = new StateStore()
