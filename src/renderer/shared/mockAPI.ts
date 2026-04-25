import type { AppState, AppSettings, FocusAPI, TimerPhase } from './types'
import { DEFAULT_SETTINGS } from './constants'

export function installMockAPI() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}

  const state: AppState = {
    phase: 'focus',
    isRunning: false,
    remainingSeconds: 25 * 60,
    totalSeconds: 25 * 60,
    cycleCount: 0,
    currentTask: '',
    isFrozen: false,
    freezeRemainingSeconds: 0,
    settings: { ...DEFAULT_SETTINGS },
  }

  let timerInterval: ReturnType<typeof setInterval> | null = null
  let startTime = 0
  let phaseDuration = state.settings.focusDuration

  function emit(channel: string, data?: unknown) {
    listeners[channel]?.forEach(cb => cb(data))
  }

  function broadcast() {
    emit('state:updated', { ...state })
  }

  function getDuration(phase: TimerPhase): number {
    switch (phase) {
      case 'focus': return state.settings.focusDuration
      case 'break': return state.settings.breakDuration
      case 'longBreak': return state.settings.longBreakDuration
      case 'rest': return 60 // 1 minute mock rest break
      default: return state.settings.focusDuration
    }
  }

  function startFreeze(phase: TimerPhase) {
    const dur = getDuration(phase)
    state.isFrozen = true
    state.freezeRemainingSeconds = dur
    broadcast()
    emit('freeze:enter', { phase, durationSeconds: dur })

    let remaining = dur
    const freezeInt = setInterval(() => {
      remaining--
      state.freezeRemainingSeconds = remaining
      emit('freeze:tick', { remainingSeconds: remaining })
      if (remaining <= 0) {
        clearInterval(freezeInt)
        state.isFrozen = false
        state.freezeRemainingSeconds = 0
        emit('freeze:exit')
        broadcast()
      }
    }, 1000)
  }

  function advancePhase() {
    const prev = state.phase
    if (prev === 'focus') {
      state.cycleCount++
      state.phase = state.cycleCount >= state.settings.cyclesBeforeLongBreak ? 'longBreak' : 'break'
      if (state.phase === 'longBreak') state.cycleCount = 0
    } else {
      state.phase = 'focus'
    }
    phaseDuration = getDuration(state.phase)
    state.remainingSeconds = phaseDuration
    state.totalSeconds = phaseDuration
    state.isRunning = false

    emit('timer:phaseChanged', { newPhase: state.phase, cycleCount: state.cycleCount })
    broadcast()

    startFreeze(state.phase)
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
    state.isRunning = false
  }

  function startTimer() {
    if (state.isRunning) return
    state.isRunning = true
    startTime = Date.now() - (phaseDuration - state.remainingSeconds) * 1000
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      state.remainingSeconds = Math.max(0, phaseDuration - elapsed)
      emit('timer:tick', { remainingSeconds: state.remainingSeconds, phase: state.phase, isRunning: true })
      broadcast()
      if (state.remainingSeconds <= 0) {
        stopTimer()
        advancePhase()
      }
    }, 1000)
    broadcast()
  }

  const api: FocusAPI = {
    startTimer: () => { startTimer(); return Promise.resolve() },
    pauseTimer: () => { stopTimer(); broadcast(); return Promise.resolve() },
    resetTimer: () => { stopTimer(); state.remainingSeconds = phaseDuration; broadcast(); return Promise.resolve() },
    skipPhase:  () => { stopTimer(); advancePhase(); return Promise.resolve() },
    toggleTimer:() => { if (timerInterval) { stopTimer(); broadcast() } else { startTimer() } return Promise.resolve() },
    setTask:    (task: string) => { state.currentTask = task; broadcast(); return Promise.resolve() },
    getSettings: () => Promise.resolve({ ...state.settings }),
    saveSettings: (s: AppSettings) => { state.settings = { ...s }; phaseDuration = getDuration(state.phase); broadcast(); return Promise.resolve() },
    getState: () => Promise.resolve({ ...state }),
    resizeWindow: (_height: number, _width?: number, _isIsland?: boolean) => Promise.resolve(),
    onTimerTick:    (cb) => { (listeners['timer:tick'] ??= []).push(cb as (...a: unknown[]) => void) },
    onPhaseChanged: (cb) => { (listeners['timer:phaseChanged'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeEnter:  (cb) => { (listeners['freeze:enter'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeTick:   (cb) => { (listeners['freeze:tick'] ??= []).push(cb as (...a: unknown[]) => void) },
    onFreezeExit:   (cb) => { (listeners['freeze:exit'] ??= []).push(cb as (...a: unknown[]) => void) },
    onStateUpdated: (cb) => { (listeners['state:updated'] ??= []).push(cb as (...a: unknown[]) => void) },
    removeAllListeners: (ch) => { delete listeners[ch] },

  }

  ;(window as Window & { focusAPI: FocusAPI }).focusAPI = api
  
  // Expose for preview/testing
  ;(window as any).simulateRest = () => startFreeze('rest')
}
