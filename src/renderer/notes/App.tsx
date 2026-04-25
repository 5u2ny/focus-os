import React, { useState, useEffect } from 'react'
import type { Note, Capture } from '@schema'
import { NotesList } from './NotesList'
import { Editor } from './Editor'
import { ipc } from '@shared/ipc-client'

export default function App() {
  const [notes, setNotes]       = useState<Note[]>([])
  const [selected, setSelected] = useState<Note | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])

  useEffect(() => {
    ipc.invoke<Note[]>('notes:list').then(n => { setNotes(n); if (n.length > 0) setSelected(n[0]) }).catch(() => {})
    ipc.invoke<Capture[]>('capture:list', { limit: 30 }).then(setCaptures).catch(() => {})
    // Listen for open-note requests from main process
    ipc.on('notes:openNote', (noteId: string) => {
      setSelected(notes.find(n => n.id === noteId) ?? null)
    })
    // Live captures pushed from main when the user highlights text
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
    })
    return () => { ipc.off('notes:openNote'); ipc.off('capture:new') }
  }, [])

  async function handleCreate() {
    const note = await ipc.invoke<Note>('notes:create', { title: 'Untitled', content: '' })
    setNotes(prev => [note, ...prev])
    setSelected(note)
  }

  async function handleUpdate(id: string, patch: Partial<Note>) {
    const updated = await ipc.invoke<Note>('notes:update', { id, patch })
    setNotes(prev => prev.map(n => n.id === id ? updated : n))
    setSelected(updated)
  }

  async function handleDelete(id: string) {
    await ipc.invoke('notes:delete', { id })
    const remaining = notes.filter(n => n.id !== id)
    setNotes(remaining)
    setSelected(remaining[0] ?? null)
  }

  return (
    <div className="notes-app">
      <NotesList
        notes={notes}
        selected={selected}
        onSelect={setSelected}
        onCreate={handleCreate}
        onDelete={handleDelete}
      />
      <div className="notes-main">
        {selected ? (
          <Editor
            key={selected.id}
            note={selected}
            captures={captures}
            onUpdate={(patch) => handleUpdate(selected.id, patch)}
          />
        ) : (
          <div className="notes-empty">
            <p>No note selected</p>
            <button className="notes-create-btn" onClick={handleCreate}>+ New Note</button>
          </div>
        )}
      </div>
    </div>
  )
}
