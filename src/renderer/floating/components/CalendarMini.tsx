import React, { useState, useEffect } from 'react'
import type { CalendarEvent } from '@schema'
import { ipc } from '@shared/ipc-client'

export function CalendarMini() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [title, setTitle]   = useState('')

  const today    = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dayEnd   = dayStart + 7 * 24 * 60 * 60 * 1000 // next 7 days

  useEffect(() => {
    ipc.invoke<CalendarEvent[]>('calendar:list', { from: dayStart, to: dayEnd })
      .then(setEvents).catch(() => {})
  }, [])

  async function addEvent() {
    if (!title.trim()) return
    const now = Date.now()
    const e = await ipc.invoke<CalendarEvent>('calendar:create', {
      title: title.trim(), start: now, end: now + 3600_000,
    })
    setEvents(prev => [...prev, e])
    setTitle('')
  }

  const dayLabels = ['Today', 'Tomorrow', ...Array.from({ length: 5 }, (_, i) => {
    const d = new Date(dayStart + (i + 2) * 86400_000)
    return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
  })]

  const byDay: Record<number, CalendarEvent[]> = {}
  events.forEach(e => {
    const day = Math.floor((e.start - dayStart) / 86400_000)
    if (day >= 0 && day < 7) { byDay[day] = [...(byDay[day] ?? []), e] }
  })

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header"><span>Calendar (next 7 days)</span></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="sidebar-input" value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addEvent()} placeholder="Add event for today…" />
        <button className="sidebar-mini-btn" onClick={addEvent}>+</button>
      </div>
      <div className="cal-strip">
        {dayLabels.map((label, i) => (
          <div key={i} className={`cal-day ${i === 0 ? 'cal-today' : ''}`}>
            <span className="cal-day-label">{label}</span>
            {(byDay[i] ?? []).map(e => (
              <div key={e.id} className="cal-event">
                <span>{e.title}</span>
                <button className="sidebar-mini-btn" onClick={() => {
                  ipc.invoke('calendar:delete', { id: e.id })
                  setEvents(prev => prev.filter(x => x.id !== e.id))
                }}>×</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
