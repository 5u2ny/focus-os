import React, { useState, useEffect, useRef } from 'react'
import { IPC } from '@shared/types'
import type { TimerPhase } from '@shared/types'
import { PHASE_LABELS, PHASE_MESSAGES, PHASE_COLORS } from '@shared/constants'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const LOCK_ICONS: Record<string, string> = {
  focus:     '🎯',
  break:     '☕',
  longBreak: '🌿',
}

const RING_R  = 80
const RING_C  = 2 * Math.PI * RING_R

export default function App() {
  const [phase, setPhase]         = useState<TimerPhase>('break')
  const [remaining, setRemaining] = useState(0)
  const [total, setTotal]         = useState(0)
  const [task, setTask]           = useState('')
  const [visible, setVisible]     = useState(false)
  const totalSetRef = useRef(false)

  useEffect(() => {
    // Immediately check state on mount — don't wait for poll cycle
    window.focusAPI.getState().then(s => {
      setTask(s.currentTask)
      if (s.isFrozen && s.freezeRemainingSeconds > 0) {
        setPhase(s.phase)
        setRemaining(s.freezeRemainingSeconds)
        setTotal(s.freezeRemainingSeconds)
        totalSetRef.current = true
        setVisible(true)
      }
    }).catch(() => {})

    // Aggressive polling — 150ms to catch freeze state FAST during fullscreen transitions
    const poll = setInterval(() => {
      window.focusAPI.getState().then(s => {
        setTask(s.currentTask)
        if (s.isFrozen && s.freezeRemainingSeconds > 0) {
          setPhase(s.phase)
          setRemaining(s.freezeRemainingSeconds)
          if (!totalSetRef.current) {
            setTotal(s.freezeRemainingSeconds)
            totalSetRef.current = true
          }
          setVisible(true)
        } else if (!s.isFrozen) {
          setVisible(false)
          totalSetRef.current = false
        }
      }).catch(() => {})
    }, 150)

    // Also listen for IPC events for faster response
    window.focusAPI.onFreezeEnter(({ phase: p, durationSeconds }) => {
      setPhase(p)
      setTotal(durationSeconds)
      totalSetRef.current = true
      setRemaining(durationSeconds)
      setVisible(true)
    })

    window.focusAPI.onFreezeTick(({ remainingSeconds }) => {
      setRemaining(remainingSeconds)
    })

    window.focusAPI.onFreezeExit(() => {
      setVisible(false)
      totalSetRef.current = false
    })

    // Also listen for state updates — backup for missed IPC
    window.focusAPI.onStateUpdated((s) => {
      setTask(s.currentTask)
      if (s.isFrozen && s.freezeRemainingSeconds > 0) {
        setPhase(s.phase)
        setRemaining(s.freezeRemainingSeconds)
        if (!totalSetRef.current) {
          setTotal(s.freezeRemainingSeconds)
          totalSetRef.current = true
        }
        setVisible(true)
      } else if (!s.isFrozen) {
        setVisible(false)
        totalSetRef.current = false
      }
    })

    return () => {
      clearInterval(poll)
      window.focusAPI.removeAllListeners(IPC.FREEZE_ENTER)
      window.focusAPI.removeAllListeners(IPC.FREEZE_TICK)
      window.focusAPI.removeAllListeners(IPC.FREEZE_EXIT)
      window.focusAPI.removeAllListeners(IPC.STATE_UPDATED)
    }
  }, [])

  const color    = PHASE_COLORS[phase] ?? '#ef4444'
  const progress = total > 0 ? remaining / total : 0
  const dashOffset = RING_C * (1 - progress)

  if (!visible) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a12',
        color: 'rgba(255,255,255,0.4)', fontSize: 16,
        flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: 'rgba(255,255,255,0.4)',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        Preparing break...
      </div>
    )
  }

  return (
    <div className="freeze-root" style={{ '--phase-color': color } as React.CSSProperties}>
      {/* Background glows */}
      <div className="freeze-bg">
        <div className="glow glow-1" />
        <div className="glow glow-2" />
      </div>

      <div className="freeze-content">
        {/* Icon + phase label */}
        <div className="phase-header">
          <div className="lock-icon">{LOCK_ICONS[phase] ?? '🔒'}</div>
          <div className="phase-label">{PHASE_LABELS[phase]}</div>
        </div>

        {/* Task */}
        {task && (
          <div className="task-display">
            <span className="task-prefix">You were working on</span>
            <span className="task-name">"{task}"</span>
          </div>
        )}

        {/* Countdown ring */}
        <div className="countdown-wrapper">
          <div className="ring-container">
            <svg className="ring-svg" viewBox="0 0 180 180">
              <circle className="ring-track"    cx="90" cy="90" r={RING_R} />
              <circle
                className="ring-progress"
                cx="90" cy="90" r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="countdown-time">
              <span className="countdown-number">{formatTime(remaining)}</span>
              <span className="countdown-label">until unlock</span>
            </div>
          </div>
        </div>

        {/* Message */}
        <p className="phase-message">
          {PHASE_MESSAGES[phase]}
        </p>
      </div>

      {/* Bottom notice */}
      <div className="lock-notice">
        <div className="lock-dot" />
        Screen locked until timer ends
      </div>
    </div>
  )
}
