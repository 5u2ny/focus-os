import React, { useState, useEffect } from 'react'
import type { EmailDigestItem } from '@schema'
import { ipc } from '@shared/ipc-client'
import { EmailDraftCard } from './EmailDraftCard'

export function EmailDigest() {
  const [emails, setEmails]         = useState<EmailDigestItem[]>([])
  const [loading, setLoading]       = useState(false)
  const [selected, setSelected]     = useState<EmailDigestItem | null>(null)

  useEffect(() => {
    ipc.invoke<EmailDigestItem[]>('gmail:list').then(setEmails).catch(() => {})
    ipc.on('gmail:newEmails', (items: EmailDigestItem[]) => {
      setEmails(prev => {
        const map = new Map(prev.map(e => [e.id, e]))
        items.forEach(i => map.set(i.id, i))
        return Array.from(map.values()).sort((a, b) => b.receivedAt - a.receivedAt)
      })
    })
    return () => ipc.off('gmail:newEmails')
  }, [])

  async function handleFetch() {
    setLoading(true)
    try { await ipc.invoke('gmail:fetchNow') } finally { setLoading(false) }
  }

  async function handleArchive(e: EmailDigestItem) {
    await ipc.invoke('gmail:archive', { id: e.id })
    setEmails(prev => prev.filter(x => x.id !== e.id))
    if (selected?.id === e.id) setSelected(null)
  }

  const shown = emails.slice(0, 10)

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header">
        <span>Email ({shown.length})</span>
        <button className="sidebar-mini-btn" onClick={handleFetch} disabled={loading}>{loading ? '…' : '↻'}</button>
      </div>
      {shown.length === 0 && <p className="sidebar-empty">No emails — click ↻ to fetch</p>}
      <div className="email-list">
        {shown.map(e => (
          <div key={e.id} className={`email-item importance-${e.importance} ${selected?.id === e.id ? 'email-selected' : ''}`}
            onClick={() => setSelected(s => s?.id === e.id ? null : e)}>
            <div className="email-row">
              <span className="email-from">{e.from.split('<')[0].trim().slice(0, 24)}</span>
              <span className={`email-badge badge-${e.importance}`}>{e.importance}</span>
              <button className="sidebar-mini-btn email-archive-btn" onClick={ev => { ev.stopPropagation(); handleArchive(e) }}>×</button>
            </div>
            <p className="email-subject">{e.subject.slice(0, 50)}</p>
            {e.summary && <p className="email-summary">{e.summary}</p>}
          </div>
        ))}
      </div>
      {selected && <EmailDraftCard email={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
