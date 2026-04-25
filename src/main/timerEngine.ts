import { EventEmitter } from 'events'
import type { TimerPhase, AppSettings } from '../renderer/shared/types'

export class TimerEngine extends EventEmitter {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private phaseStartTime = 0
  private phaseDuration = 0

  phase: TimerPhase = 'focus'
  cycleCount = 0
  isRunning = false
  remainingSeconds = 0
  totalSeconds = 0

  constructor(private settings: AppSettings) {
    super()
    this.phaseDuration = settings.focusDuration
    this.remainingSeconds = settings.focusDuration
    this.totalSeconds = settings.focusDuration
  }

  updateSettings(settings: AppSettings) {
    const elapsed = this.phaseDuration - this.remainingSeconds
    this.settings = settings
    this.phaseDuration = this.getPhaseDuration(this.phase)
    
    // Maintain already-elapsed time, just update the goalpost
    this.remainingSeconds = Math.max(0, this.phaseDuration - elapsed)
    
    // If running, tick() will pick up the new phaseDuration on next cycle
    this.emit('stateChanged')
  }

  start() {
    if (this.isRunning) return
    this.isRunning = true
    this.phaseStartTime = Date.now() - (this.phaseDuration - this.remainingSeconds) * 1000
    this.intervalId = setInterval(() => this.tick(), 1000)
    this.emit('stateChanged')
  }

  pause() {
    if (!this.isRunning) return
    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.emit('stateChanged')
  }

  reset() {
    this.pause()
    this.remainingSeconds = this.phaseDuration
    this.emit('stateChanged')
  }

  skipPhase() {
    this.pause()
    this.advancePhase(true)
  }

  advancePhase(skipFreeze = false) {
    const prevPhase = this.phase

    if (prevPhase === 'focus') {
      this.cycleCount++
      if (this.cycleCount >= this.settings.cyclesBeforeLongBreak) {
        this.phase = 'longBreak'
        this.cycleCount = 0
      } else {
        this.phase = 'break'
      }
    } else {
      this.phase = 'focus'
    }

    this.phaseDuration = this.getPhaseDuration(this.phase)
    this.remainingSeconds = this.phaseDuration
    this.totalSeconds = this.phaseDuration

    if (!skipFreeze) {
      this.emit('phaseComplete', { completedPhase: prevPhase, newPhase: this.phase })
    } else {
      this.emit('phaseSkipped', { newPhase: this.phase })
      const autoStart = this.phase === 'focus'
        ? this.settings.autoStartFocus
        : this.settings.autoStartBreaks
      if (autoStart) this.start()
    }
    this.emit('stateChanged')
  }

  private tick() {
    const elapsed = Math.floor((Date.now() - this.phaseStartTime) / 1000)
    this.remainingSeconds = Math.max(0, this.phaseDuration - elapsed)

    this.emit('tick', {
      remainingSeconds: this.remainingSeconds,
      phase: this.phase,
      isRunning: this.isRunning,
    })

    if (this.remainingSeconds <= 0) {
      this.pause()
      this.advancePhase()
    }
  }

  private getPhaseDuration(phase: TimerPhase): number {
    switch (phase) {
      case 'focus':     return this.settings.focusDuration
      case 'break':     return this.settings.breakDuration
      case 'longBreak': return this.settings.longBreakDuration
      case 'rest':      return 60 // Usually 60s, but we'll hand-off to FreezeController explicitly
      default:          return this.settings.focusDuration
    }
  }

  /** Set timer to a specific phase, paused, full duration. No auto-start. */
  resetToPhase(phase: TimerPhase) {
    this.pause()
    this.phase = phase
    this.phaseDuration = this.getPhaseDuration(phase)
    this.remainingSeconds = this.phaseDuration
    this.totalSeconds = this.phaseDuration
    this.isRunning = false
    this.emit('stateChanged')
  }
}
