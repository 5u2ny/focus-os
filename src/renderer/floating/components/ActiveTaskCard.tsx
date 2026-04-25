import React, { useState } from 'react'
import type { Todo } from '@schema'
import { ipc } from '@shared/ipc-client'

interface Props {
  todo: Todo | null
  onChange: (todo: Todo | null) => void
}

export function ActiveTaskCard({ todo, onChange }: Props) {
  const [inputVal, setInputVal] = useState('')
  const [adding, setAdding]     = useState(false)

  async function handleAddQuick() {
    if (!inputVal.trim()) return
    const created = await ipc.invoke<Todo>('todo:create', { text: inputVal.trim() })
    await ipc.invoke('todo:setActive', { id: created.id })
    onChange({ ...created, isActive: true })
    setInputVal('')
    setAdding(false)
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span>Active Task</span>
        <button className="sidebar-mini-btn" onClick={() => setAdding(v => !v)}>+</button>
      </div>
      {todo ? (
        <div className="active-task-card">
          <span className="active-task-text">{todo.text}</span>
          <button className="sidebar-mini-btn" onClick={async () => {
            await ipc.invoke('todo:update', { id: todo.id, patch: { completed: true, completedAt: Date.now() } })
            await ipc.invoke('todo:setActive', { id: null })
            onChange(null)
          }}>✓</button>
        </div>
      ) : (
        <p className="sidebar-empty">No active task — pick one below or add one</p>
      )}
      {adding && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input className="sidebar-input" value={inputVal} onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddQuick()}
            placeholder="What are you working on?" autoFocus />
          <button className="sidebar-mini-btn" onClick={handleAddQuick}>→</button>
        </div>
      )}
    </div>
  )
}
