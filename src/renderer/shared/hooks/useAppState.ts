import { useState, useEffect } from 'react'
import type { AppState } from '../types'
import { IPC } from '../types'

export function useAppState() {
  const [state, setState] = useState<AppState | null>(null)

  useEffect(() => {
    let mounted = true

    async function hydrate() {
      try {
        const s = await window.focusAPI.getState()
        if (mounted) setState(s)
      } catch (err) {
        console.error('Failed to get state:', err)
        // Retry once after a short delay
        setTimeout(async () => {
          try {
            const s = await window.focusAPI.getState()
            if (mounted) setState(s)
          } catch {
            // give up silently
          }
        }, 500)
      }
    }

    hydrate()
    window.focusAPI.onStateUpdated((s) => {
      if (mounted) setState(s)
    })

    window.focusAPI.onTimerTick((data) => {
      if (mounted) {
        setState(prev => prev ? { 
          ...prev, 
          remainingSeconds: data.remainingSeconds,
          phase: data.phase,
          isRunning: data.isRunning 
        } : null)
      }
    })

    return () => {
      mounted = false
      window.focusAPI.removeAllListeners(IPC.STATE_UPDATED)
      window.focusAPI.removeAllListeners(IPC.TIMER_TICK)
    }
  }, [])

  return state
}
