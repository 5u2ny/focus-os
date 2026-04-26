import React, { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import type { Note, Capture } from '@schema'
import { parseContent } from './parseContent'
export { parseContent }

interface Props {
  note: Note
  captures: Capture[]
  onUpdate: (patch: Partial<Note>) => void
}

export function Editor({ note, captures, onUpdate }: Props) {
  const saveTimer = useRef<number>(0)
  const lastContent = useRef<string>(note.content)

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: parseContent(note.content),
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON())
      lastContent.current = json
      // Debounced save: 800ms after last keystroke
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        onUpdate({ content: json })
      }, 800)
    },
  })

  // Cleanup debounce on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ title: e.target.value })
  }, [onUpdate])

  function insertCapture(capture: Capture) {
    if (!editor) return
    editor.chain().focus().insertContent({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: capture.text }] }],
    }).run()
    onUpdate({ content: JSON.stringify(editor.getJSON()), capturedFromIds: [...(note.capturedFromIds ?? []), capture.id] })
  }

  return (
    <div className="notes-editor-wrap">
      <div className="notes-toolbar">
        <button className={`notes-tool-btn ${editor?.isActive('bold') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run() }}>B</button>
        <button className={`notes-tool-btn ${editor?.isActive('italic') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run() }}>I</button>
        <button className={`notes-tool-btn ${editor?.isActive('underline') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleUnderline().run() }}>U</button>
        <span className="notes-tool-sep" />
        <button className={`notes-tool-btn ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleHeading({ level: 2 }).run() }}>H2</button>
        <button className={`notes-tool-btn ${editor?.isActive('bulletList') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run() }}>• list</button>
        <button className={`notes-tool-btn ${editor?.isActive('blockquote') ? 'active' : ''}`}
          onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run() }}>"</button>
      </div>
      <input className="notes-title-input" value={note.title} onChange={handleTitleChange} placeholder="Note title…" />
      <EditorContent editor={editor} className="notes-content" />
      {captures.length > 0 && (
        <div className="notes-clips-panel">
          <p className="notes-clips-label">Captured clips — click to insert</p>
          <div className="notes-clips-list">
            {captures.slice(0, 12).map(c => (
              <div key={c.id} className="notes-clip-item" onClick={() => insertCapture(c)}>
                <span className="notes-clip-text">{c.text.slice(0, 80)}{c.text.length > 80 ? '…' : ''}</span>
                {c.sourceApp && <span className="notes-clip-source">{c.sourceApp}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
