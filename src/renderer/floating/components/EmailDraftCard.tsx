import React, { useState } from 'react'
import type { EmailDigestItem } from '@schema'
import { ipc } from '@shared/ipc-client'

interface Props { email: EmailDigestItem; onClose: () => void }

export function EmailDraftCard({ email, onClose }: Props) {
  const [draft, setDraft]       = useState(email.draftReply ?? '')
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(false)

  async function handleGenerateDraft() {
    setLoading(true)
    try {
      const text = await ipc.invoke<string>('gmail:generateReply', { id: email.id })
      setDraft(text)
    } catch (e: any) {
      setDraft(`(AI unavailable: ${e.message})`)
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="email-draft-card">
      <div className="email-draft-header">
        <span>Reply draft</span>
        <button className="sidebar-mini-btn" onClick={onClose}>×</button>
      </div>
      {!draft && !loading && (
        <button className="sidebar-btn" onClick={handleGenerateDraft}>Generate AI draft</button>
      )}
      {loading && <p className="sidebar-empty">Generating…</p>}
      {draft && (
        <>
          <textarea className="email-draft-area" value={draft} onChange={e => setDraft(e.target.value)} rows={4} />
          <button className="sidebar-btn" onClick={handleCopy}>{copied ? 'Copied ✓' : 'Copy to clipboard'}</button>
        </>
      )}
    </div>
  )
}
