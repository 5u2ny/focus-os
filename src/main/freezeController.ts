import type { TimerPhase } from '../renderer/shared/types'
import { windowManager } from './windowManager'
import { stateStore } from './stateStore'
import { IPC } from '../renderer/shared/types'
import { blockShortcuts, unblockShortcuts } from './shortcutBlocker'

type FreezeState = 'idle' | 'frozen'

export class FreezeController {
  private state: FreezeState = 'idle'
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private onExitCallback: (() => void) | null = null

  isFrozen() {
    return this.state === 'frozen'
  }

  enter(phase: TimerPhase, durationSeconds: number, onExit: () => void) {
    if (this.state === 'frozen') return

    this.state = 'frozen'
    this.onExitCallback = onExit

    stateStore.update({ isFrozen: true, freezeRemainingSeconds: durationSeconds })

    // Block shortcuts and show windows
    blockShortcuts()
    windowManager.showFreeze()

    // Send initial configuration to the HUD and Freeze windows
    const currentSnapshot = stateStore.getSnapshot()
    windowManager.sendToFreeze(IPC.FREEZE_ENTER, { phase, durationSeconds })
    windowManager.sendToFreeze(IPC.STATE_UPDATED, currentSnapshot)

    let remaining = durationSeconds

    this.countdownInterval = setInterval(() => {
      remaining--
      // Silent update to store for efficiency -- we send specific tick IPC instead
      stateStore.updateSilent({ freezeRemainingSeconds: remaining })
      windowManager.sendToFreeze(IPC.FREEZE_TICK, { remainingSeconds: remaining })

      if (remaining <= 0) {
        this.exit()
      }
    }, 1000)
  }

  exit() {
    if (this.state !== 'frozen') return

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval)
      this.countdownInterval = null
    }

    unblockShortcuts()
    windowManager.hideFreeze()
    windowManager.sendToAll(IPC.FREEZE_EXIT)
    stateStore.update({ isFrozen: false, freezeRemainingSeconds: 0 })

    this.state = 'idle'

    if (this.onExitCallback) {
      // Use setTimeout so the IPC finish message gets through before we potentially switch phases
      const callback = this.onExitCallback
      this.onExitCallback = null
      setTimeout(callback, 50)
    }
  }
}

export const freezeController = new FreezeController()
