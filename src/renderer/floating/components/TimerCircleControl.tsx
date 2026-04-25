import React from 'react'

interface Props {
  remainingSeconds: number
  totalSeconds: number
  phaseColor: string
  isRunning: boolean
  onToggle: () => void
}

export function TimerCircleControl({ remainingSeconds, totalSeconds, phaseColor, isRunning, onToggle }: Props) {
  const size = 90, strokeW = 5, r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 1
  const dash = circ * progress
  const m = String(Math.floor(remainingSeconds / 60)).padStart(2, '0')
  const s = String(remainingSeconds % 60).padStart(2, '0')

  return (
    <div className="timer-circle-wrap" onClick={onToggle} style={{ cursor: 'pointer', position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={phaseColor} strokeWidth={strokeW}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.9s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{m}:{s}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{isRunning ? '▐▐' : '▶'}</span>
      </div>
    </div>
  )
}
