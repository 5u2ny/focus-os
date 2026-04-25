import React, { useEffect, useState } from 'react'
import type { Capture } from '@schema'

interface Props { latestCapture: Capture | null }

export function CapturePulse({ latestCapture }: Props) {
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    if (!latestCapture) return
    setPulsing(true)
    const t = setTimeout(() => setPulsing(false), 700)
    return () => clearTimeout(t)
  }, [latestCapture?.id])

  if (!latestCapture) return null

  return (
    <div className={`capture-pulse-card ${pulsing ? 'capture-pulse' : ''}`}>
      <div className="capture-pulse-dot" />
      <p className="capture-pulse-text">{latestCapture.text.slice(0, 80)}{latestCapture.text.length > 80 ? '…' : ''}</p>
      {latestCapture.sourceApp && <span className="capture-pulse-source">{latestCapture.sourceApp}</span>}
    </div>
  )
}
