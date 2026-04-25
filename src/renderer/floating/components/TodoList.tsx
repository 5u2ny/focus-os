import React, { useState, useEffect } from 'react'
import type { Todo } from '@schema'
import { ipc } from '@shared/ipc-client'

interface Props {
  onActivate: (todo: Todo) => void
}

export function TodoList({ onActivate }: Props) {
  const [todos, setTodos]     = useState<Todo[]>([])
  const [newText, setNewText] = useState('')

  useEffect(() => {
    ipc.invoke<Todo[]>('todo:list').then(setTodos).catch(() => {})
  }, [])

  async function addTodo() {
    if (!newText.trim()) return
    const t = await ipc.invoke<Todo>('todo:create', { text: newText.trim() })
    setTodos(prev => [t, ...prev])
    setNewText('')
  }

  async function toggleDone(todo: Todo) {
    const updated = await ipc.invoke<Todo>('todo:update', { id: todo.id, patch: { completed: !todo.completed, completedAt: !todo.completed ? Date.now() : undefined } })
    setTodos(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function setActive(todo: Todo) {
    await ipc.invoke('todo:setActive', { id: todo.id })
    const updated = todos.map(t => ({ ...t, isActive: t.id === todo.id }))
    setTodos(updated)
    onActivate({ ...todo, isActive: true })
  }

  const open   = todos.filter(t => !t.completed)
  const done   = todos.filter(t => t.completed)

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header"><span>Todos</span></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input className="sidebar-input" value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="Add todo…" />
        <button className="sidebar-mini-btn" onClick={addTodo}>+</button>
      </div>
      <div className="todo-list">
        {open.map(t => (
          <div key={t.id} className={`todo-item ${t.isActive ? 'todo-active' : ''}`}>
            <button className="todo-check" onClick={() => toggleDone(t)}>○</button>
            <span className="todo-text" onClick={() => setActive(t)}>{t.text}</span>
            {t.isActive && <span className="todo-active-badge">active</span>}
          </div>
        ))}
        {open.length === 0 && <p className="sidebar-empty">All done! ✓</p>}
        {done.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary className="sidebar-empty" style={{ cursor: 'pointer' }}>{done.length} completed</summary>
            {done.map(t => (
              <div key={t.id} className="todo-item todo-done">
                <button className="todo-check" onClick={() => toggleDone(t)}>✓</button>
                <span className="todo-text">{t.text}</span>
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  )
}
