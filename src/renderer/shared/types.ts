// ── Core timer types ────────────────────────────────────────────────────────
export type TimerPhase = 'focus' | 'break' | 'longBreak' | 'rest';

export interface AppSettings {
  focusDuration:         number;
  breakDuration:         number;
  longBreakDuration:     number;
  cyclesBeforeLongBreak: number;
  autoStartBreaks:       boolean;
  autoStartFocus:        boolean;
  freezeDuration:        number;
  desktopNotifications:  boolean;
  soundAlerts:           boolean;
  volume:                number;
}

export interface AppState {
  phase:                  TimerPhase;
  isRunning:              boolean;
  remainingSeconds:       number;
  totalSeconds:           number;
  cycleCount:             number;
  currentTask:            string;
  isFrozen:               boolean;
  freezeRemainingSeconds: number;
  settings:               AppSettings;
}

// ── IPC channel enum ────────────────────────────────────────────────────────
export enum IPC {
  TIMER_START        = 'timer:start',
  TIMER_PAUSE        = 'timer:pause',
  TIMER_RESET        = 'timer:reset',
  TIMER_SKIP_PHASE   = 'timer:skipPhase',
  TASK_SET           = 'task:set',
  SETTINGS_GET       = 'settings:get',
  SETTINGS_SET       = 'settings:set',
  STATE_GET          = 'state:get',
  WINDOW_RESIZE      = 'window:resize',

  TIMER_TICK          = 'timer:tick',
  TIMER_PHASE_CHANGED = 'timer:phaseChanged',
  FREEZE_ENTER        = 'freeze:enter',
  FREEZE_TICK         = 'freeze:tick',
  FREEZE_EXIT         = 'freeze:exit',
  STATE_UPDATED       = 'state:updated',

}

// ── FocusAPI (exposed via contextBridge) ───────────────────────────────────
export interface FocusAPI {
  startTimer:   () => Promise<void>;
  pauseTimer:   () => Promise<void>;
  resetTimer:   () => Promise<void>;
  skipPhase:    () => Promise<void>;
  toggleTimer:  () => Promise<void>;
  setTask:      (task: string) => Promise<void>;
  getSettings:  () => Promise<AppSettings>;
  saveSettings: (s: AppSettings) => Promise<void>;
  getState:     () => Promise<AppState>;
  resizeWindow: (h: number, w?: number, isIsland?: boolean) => Promise<void>;

  onTimerTick:        (cb: (d: any) => void) => void;
  onPhaseChanged:     (cb: (d: any) => void) => void;
  onFreezeEnter:      (cb: (d: any) => void) => void;
  onFreezeTick:       (cb: (d: any) => void) => void;
  onFreezeExit:       (cb: () => void) => void;
  onStateUpdated:     (cb: (state: AppState) => void) => void;
  removeAllListeners: (channel: string) => void;

}

declare global {
  interface Window {
    focusAPI: FocusAPI;
    electron: {
      invoke: (channel: string, req?: any) => Promise<any>;
      on: (channel: string, cb: (data: any) => void) => void;
      off: (channel: string) => void;
    };
  }
}
