import React, { useState, useEffect } from 'react'
import type { Capture, Todo } from '@schema'
import { ipc } from '@shared/ipc-client'
import { TodoList } from './TodoList'
import { EmailDigest } from './EmailDigest'

interface Props {
  inSession: boolean
  activeTodo: Todo | null
  onActiveTodoChange: (t: Todo | null) => void
  latestCapture: Capture | null
  phaseColor: string
  cyclePos: number
  cycleTotal: number
  currentTask: string
  onOpenNotes: () => void
}

type Tab = 'focus' | 'saves' | 'tasks' | 'inbox'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'focus', label: 'Focus',   icon: '🎯' },
  { id: 'saves', label: 'Saves',   icon: '📎' },
  { id: 'tasks', label: 'Tasks',   icon: '✅' },
  { id: 'inbox', label: 'Inbox',   icon: '📬' },
]

function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60)  return `${d}s ago`
  if (d < 3600) return `${Math.floor(d/60)}m ago`
  return `${Math.floor(d/3600)}h ago`
}

export function Sidebar({ inSession, activeTodo, onActiveTodoChange, latestCapture, phaseColor, cyclePos, cycleTotal, currentTask, onOpenNotes }: Props) {
  const [tab, setTab]             = useState<Tab>('focus')
  const [captures, setCaptures]   = useState<Capture[]>([])
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')

  // Switch to saves tab on new capture
  useEffect(() => {
    if (latestCapture) {
      setCaptures(prev => {
        const exists = prev.find(c => c.id === latestCapture.id)
        return exists ? prev : [latestCapture, ...prev]
      })
      setTab('saves')
    }
  }, [latestCapture?.id])

  // Load captures on mount
  useEffect(() => {
    ipc.invoke<Capture[]>('capture:list', { limit: 50 }).then(setCaptures).catch(() => {})
  }, [])

  async function handleQuickTask() {
    if (!newTaskText.trim()) return
    const created = await ipc.invoke<Todo>('todo:create', { text: newTaskText.trim() })
    await ipc.invoke('todo:setActive', { id: created.id })
    onActiveTodoChange({ ...created, isActive: true })
    setNewTaskText('')
    setAddingTask(false)
  }

  async function deleteCapture(id: string) {
    await ipc.invoke('capture:delete', { id })
    setCaptures(prev => prev.filter(c => c.id !== id))
  }

  return (
    <aside className="sidebar">
      {/* ── Tab bar ── */}
      <div className="sidebar-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`sidebar-tab ${tab === t.id ? 'sidebar-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="sidebar-tab-icon">{t.icon}</span>
            <span className="sidebar-tab-label">{t.label}</span>
            {t.id === 'saves' && captures.length > 0 && (
              <span className="sidebar-tab-badge">{captures.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="sidebar-content">

        {/* FOCUS TAB */}
        {tab === 'focus' && (
          <div className="sidebar-panel">
            {/* Active task */}
            <div className="focus-block">
              <p className="focus-block-label">WORKING ON</p>
              {currentTask ? (
                <p className="focus-task-text">{currentTask}</p>
              ) : (
                <p className="focus-task-empty">Type your task in the pill ↖</p>
              )}
            </div>

            {/* Cycle progress */}
            <div className="focus-block">
              <p className="focus-block-label">SESSION PROGRESS</p>
              <div className="focus-cycles">
                {Array.from({ length: cycleTotal }).map((_, i) => (
                  <div key={i} className={`focus-cycle-seg ${i < cyclePos ? 'focus-cycle-seg--done' : i === cyclePos ? 'focus-cycle-seg--current' : ''}`}
                    style={i < cyclePos ? { background: phaseColor } : i === cyclePos ? { background: phaseColor, opacity: 0.5 } : undefined} />
                ))}
              </div>
              <p className="focus-cycle-caption">
                {cyclePos} of {cycleTotal} cycles done
                {cyclePos < cycleTotal ? ` · long break after ${cycleTotal - cyclePos} more` : ' · long break next'}
              </p>
            </div>

            {/* Quick-add task */}
            {!inSession && (
              <div className="focus-block">
                <p className="focus-block-label">QUICK TASK</p>
                {!addingTask ? (
                  <button className="sidebar-add-btn" onClick={() => setAddingTask(true)}>+ Add to task list</button>
                ) : (
                  <div className="sidebar-quick-add">
                    <input className="sidebar-input" autoFocus value={newTaskText}
                      onChange={e => setNewTaskText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleQuickTask(); if (e.key === 'Escape') setAddingTask(false) }}
                      placeholder="Task name…" />
                    <div className="sidebar-quick-add-actions">
                      <button className="sidebar-mini-btn sidebar-mini-btn--primary" onClick={handleQuickTask}>Add</button>
                      <button className="sidebar-mini-btn" onClick={() => setAddingTask(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {inSession && (
              <div className="focus-lock-banner">
                <span>🔒</span>
                <span>Focus session active — stay in the zone</span>
              </div>
            )}

            <button className="sidebar-notes-link" onClick={onOpenNotes}>
              Open Notes window ↗
            </button>
          </div>
        )}

        {/* SAVES TAB */}
        {tab === 'saves' && (
          <div className="sidebar-panel">
            <div className="saves-header">
              <p className="saves-count">{captures.length} captured highlight{captures.length !== 1 ? 's' : ''}</p>
              <button className="sidebar-mini-btn" onClick={onOpenNotes}>Open Notes ↗</button>
            </div>
            {captures.length === 0 ? (
              <div className="saves-empty">
                <p className="saves-empty-icon">📎</p>
                <p className="saves-empty-title">No captures yet</p>
                <p className="saves-empty-body">Highlight any text in any app and it auto-saves here. Try selecting some text now.</p>
              </div>
            ) : (
              <div className="saves-list">
                {captures.map(c => (
                  <div key={c.id} className="save-card">
                    <p className="save-card-text">{c.text.slice(0, 180)}{c.text.length > 180 ? '…' : ''}</p>
                    <div className="save-card-meta">
                      {c.sourceApp && <span className="save-card-source">from {c.sourceApp}</span>}
                      {c.category && <span className="save-card-category">{c.category}</span>}
                      <span className="save-card-time">{timeAgo(c.createdAt)}</span>
                      <button className="save-card-delete" onClick={() => deleteCapture(c.id)} title="Delete">×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TASKS TAB */}
        {tab === 'tasks' && (
          <div className="sidebar-panel">
            <TodoList onActivate={onActiveTodoChange} />
          </div>
        )}

        {/* INBOX TAB */}
        {tab === 'inbox' && (
          <div className="sidebar-panel">
            {inSession ? (
              <div className="focus-lock-banner">
                <span>🔒</span>
                <span>Email hidden during focus — check it on your break</span>
              </div>
            ) : (
              <EmailDigest />
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
