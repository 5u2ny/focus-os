import React, { useState } from 'react'
import type { Note } from '@schema'

interface Props {
  notes: Note[]
  selected: Note | null
  onSelect: (note: Note) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export function NotesList({ notes, selected, onSelect, onCreate, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const filtered = search ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase())) : notes

  return (
    <div className="notes-sidebar">
      <div className="notes-sidebar-header">
        <span className="notes-app-title">Notes</span>
        <button className="notes-create-btn-sm" onClick={onCreate} title="New note">+</button>
      </div>
      <input className="notes-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes…" />
      <div className="notes-list">
        {filtered.map(note => (
          <div key={note.id}
            className={`notes-list-item ${selected?.id === note.id ? 'notes-selected' : ''}`}
            onClick={() => onSelect(note)}>
            <span className="notes-list-title">{note.title || 'Untitled'}</span>
            <span className="notes-list-date">{new Date(note.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
            <button className="notes-delete-btn" onClick={e => { e.stopPropagation(); onDelete(note.id) }} title="Delete">×</button>
          </div>
        ))}
        {filtered.length === 0 && <p className="notes-empty-hint">{search ? 'No matches' : 'No notes yet'}</p>}
      </div>
    </div>
  )
}
