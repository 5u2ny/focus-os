import React, { useState, useEffect } from 'react'
import type { AppSettings } from '@shared/types'
import type { Settings, UserCategory } from '@schema'
import { ipc } from '@shared/ipc-client'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/ui/tabs'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { cn } from '@shared/lib/utils'
import {
  X, Timer, Bookmark, Cpu, Mail, Tag, Check, AlertCircle, ExternalLink, Plus, Trash2,
} from 'lucide-react'

interface Props {
  settings: AppSettings
  focusSettings: Settings | null
  onSave: (s: AppSettings) => Promise<void>
  onClose: () => void
}

type Tab = 'timer' | 'capture' | 'ai' | 'gmail' | 'categories'

export function SettingsPanel({ settings, focusSettings, onSave, onClose }: Props) {
  const [s, setS]               = useState(settings)
  const [fs, setFs]             = useState<Partial<Settings>>(focusSettings ?? {})
  const [saving, setSaving]     = useState(false)
  const [tab, setTab]           = useState<Tab>('timer')

  // Categories
  const [categories, setCategories]   = useState<UserCategory[]>([])
  const [newCatName, setNewCatName]   = useState('')
  const [newCatDesc, setNewCatDesc]   = useState('')
  const [newCatColor, setNewCatColor] = useState('#6ee08c')

  // Gmail
  const [gmailEmail, setGmailEmail]   = useState(focusSettings?.gmailEmail ?? '')
  const [gmailPass, setGmailPass]     = useState('')
  const [gmailStatus, setGmailStatus] = useState<'idle' | 'connecting' | 'ok' | 'error'>('idle')
  const [gmailError, setGmailError]   = useState('')

  // AI
  const [llmProvider, setLlmProvider] = useState<'anthropic' | 'openai' | ''>(focusSettings?.llmProvider ?? '')
  const [llmKey, setLlmKey]           = useState('')
  const [llmModel, setLlmModel]       = useState(focusSettings?.llmModel ?? '')
  const [llmSaved, setLlmSaved]       = useState(false)

  // Accessibility
  const [axGranted, setAxGranted] = useState<boolean | null>(null)
  // Native macOS Keychain availability (false ⇒ stored as base64 — warn user)
  const [keychainOk, setKeychainOk] = useState<boolean | null>(null)

  useEffect(() => {
    ipc.invoke<UserCategory[]>('category:list').then(setCategories).catch(() => {})
    ipc.invoke<boolean>('permission:checkAccessibility').then(setAxGranted).catch(() => {})
    ipc.invoke<boolean>('system:safeStorageAvailable').then(setKeychainOk).catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(s)
      if (Object.keys(fs).length) await ipc.invoke('focus:settings:update', fs)
    } finally {
      setSaving(false)
      onClose()
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    const cat = await ipc.invoke<UserCategory>('category:create', {
      name: newCatName.trim(), description: newCatDesc.trim(), color: newCatColor,
    })
    setCategories(prev => [...prev, cat])
    setNewCatName(''); setNewCatDesc(''); setNewCatColor('#6ee08c')
  }

  async function handleConnectGmail() {
    setGmailStatus('connecting'); setGmailError('')
    try {
      const res = await ipc.invoke<{ ok: boolean; error?: string }>('gmail:connect', {
        email: gmailEmail, appPassword: gmailPass,
      })
      setGmailStatus(res.ok ? 'ok' : 'error')
      if (!res.ok) setGmailError(res.error ?? 'Connection failed')
      else setFs(prev => ({ ...prev, gmailEmail, gmailEnabled: true }))
    } catch (err: any) {
      setGmailStatus('error')
      setGmailError(err?.message ?? 'Connection failed')
    }
  }

  async function handleSaveLLMKey() {
    if (!llmProvider || !llmKey) return
    await ipc.invoke('focus:settings:setLLMKey', {
      provider: llmProvider, key: llmKey,
      model: llmModel || (llmProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini'),
    })
    setLlmKey(''); setLlmSaved(true)
    setTimeout(() => setLlmSaved(false), 2000)
  }

  async function openAxSettings() {
    await ipc.invoke('permission:openAccessibilitySettings')
  }

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">Settings</span>
          <span className="text-[10px] uppercase tracking-wider text-white/30">Esc to close</span>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-white/[0.08] transition">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="flex-1 flex flex-col min-h-0">
        <div className="px-4 pt-3 flex-shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="timer"      className="flex-1"><Timer size={12} /> Timer</TabsTrigger>
            <TabsTrigger value="capture"    className="flex-1"><Bookmark size={12} /> Capture</TabsTrigger>
            <TabsTrigger value="ai"         className="flex-1"><Cpu size={12} /> AI</TabsTrigger>
            <TabsTrigger value="gmail"      className="flex-1"><Mail size={12} /> Gmail</TabsTrigger>
            <TabsTrigger value="categories" className="flex-1"><Tag size={12} /> Tags</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto pretty-scroll px-5 py-4 min-h-0">
          {/* TIMER */}
          <TabsContent value="timer" className="space-y-4 m-0">
            <Section title="Timer Durations">
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Focus" min={1} max={120} value={Math.round(s.focusDuration/60)}
                  onChange={v => setS(p => ({ ...p, focusDuration: v*60 }))} suffix="min" />
                <NumberField label="Short break" min={1} max={60} value={Math.round(s.breakDuration/60)}
                  onChange={v => setS(p => ({ ...p, breakDuration: v*60 }))} suffix="min" />
                <NumberField label="Long break" min={5} max={120} value={Math.round(s.longBreakDuration/60)}
                  onChange={v => setS(p => ({ ...p, longBreakDuration: v*60 }))} suffix="min" />
                <NumberField label="Cycles before long break" min={1} max={10} value={s.cyclesBeforeLongBreak}
                  onChange={v => setS(p => ({ ...p, cyclesBeforeLongBreak: v }))} />
              </div>
            </Section>

            <Section title="Behavior">
              <div className="space-y-2">
                <Toggle label="Auto-start breaks" checked={s.autoStartBreaks}
                  onChange={v => setS(p => ({ ...p, autoStartBreaks: v }))} />
                <Toggle label="Auto-start focus after break" checked={s.autoStartFocus}
                  onChange={v => setS(p => ({ ...p, autoStartFocus: v }))} />
                <Toggle label="Sound alerts" checked={s.soundAlerts}
                  onChange={v => setS(p => ({ ...p, soundAlerts: v }))} />
              </div>
            </Section>
          </TabsContent>

          {/* CAPTURE */}
          <TabsContent value="capture" className="space-y-4 m-0">
            {/* Accessibility permission status */}
            {axGranted === false && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-200">Accessibility permission required</p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Auto-capture reads selected text via the macOS Accessibility API. Without permission, highlights won't be saved.
                  </p>
                  <Button variant="default" size="sm" onClick={openAxSettings} className="mt-2">
                    Open System Settings <ExternalLink size={12} />
                  </Button>
                </div>
              </div>
            )}
            {axGranted === true && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm text-emerald-200">
                <Check size={14} /> Accessibility permission granted — auto-capture is active
              </div>
            )}

            <Section title="Manual Shortcut">
              <Field label="Capture shortcut" hint="System hotkey to capture the current selection on demand">
                <Input value={fs.captureShortcut ?? 'CommandOrControl+Shift+C'}
                  onChange={e => setFs(p => ({ ...p, captureShortcut: e.target.value }))} />
              </Field>
              <Toggle label="Silent capture (no toast)" checked={fs.captureSilent ?? false}
                onChange={v => setFs(p => ({ ...p, captureSilent: v }))} />
            </Section>
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="space-y-4 m-0">
            <p className="text-xs text-white/50 leading-relaxed">
              API keys are encrypted via macOS Keychain (safeStorage). They never leave your device except to your chosen provider.
            </p>
            <Section title="Provider">
              <Field label="LLM provider">
                <select value={llmProvider} onChange={e => setLlmProvider(e.target.value as any)}
                  className="flex h-9 w-full rounded-md bg-white/[0.04] border border-white/[0.08] px-3 text-sm text-white outline-none focus:border-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.50)]">
                  <option value="">None</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
              </Field>
              {llmProvider && (
                <>
                  <Field label="API key">
                    <Input type="password" value={llmKey} onChange={e => setLlmKey(e.target.value)}
                      placeholder={focusSettings?.llmApiKeyEncrypted ? '(saved — enter new to update)' : 'sk-...'} />
                  </Field>
                  <Field label="Model">
                    <Input value={llmModel} onChange={e => setLlmModel(e.target.value)}
                      placeholder={llmProvider === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini'} />
                  </Field>
                  <Button variant="phase" size="default" onClick={handleSaveLLMKey} disabled={!llmKey}>
                    {llmSaved ? <><Check size={13} /> Saved</> : 'Save API key'}
                  </Button>
                </>
              )}
            </Section>
          </TabsContent>

          {/* GMAIL */}
          <TabsContent value="gmail" className="space-y-4 m-0">
            {keychainOk === false && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-200">macOS Keychain unavailable</p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Without Keychain, your app password would be stored as plain base64 — not secure. Sign in to your Mac, then reopen the app to enable encrypted storage.
                  </p>
                </div>
              </div>
            )}
            {focusSettings?.gmailEnabled && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm text-emerald-200">
                <Check size={14} /> Connected as <strong>{focusSettings.gmailEmail}</strong>
              </div>
            )}

            {/* Step-by-step setup so users don't paste their regular password */}
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.08] p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-white/45 mb-3">
                Setup (one time, ~60 seconds)
              </p>
              <ol className="space-y-2.5 text-xs text-white/75">
                <li className="flex gap-2">
                  <span className="phase-text font-bold flex-shrink-0">1.</span>
                  <span>Turn ON 2-step verification at{' '}
                    <a className="text-sky-400 hover:underline" target="_blank" rel="noreferrer"
                      href="https://myaccount.google.com/signinoptions/two-step-verification">
                      myaccount.google.com/signinoptions/two-step-verification
                    </a>
                    {' '}(required — App Passwords don't exist without it).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="phase-text font-bold flex-shrink-0">2.</span>
                  <span>Generate an App Password at{' '}
                    <a className="text-sky-400 hover:underline" target="_blank" rel="noreferrer"
                      href="https://myaccount.google.com/apppasswords">
                      myaccount.google.com/apppasswords
                    </a>
                    {' '}— 16 characters like <code className="px-1 py-0.5 rounded bg-white/[0.06] font-mono text-[10px]">abcd efgh ijkl mnop</code>.
                    <strong className="text-amber-200"> Do NOT use your regular Gmail password — it will fail.</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="phase-text font-bold flex-shrink-0">3.</span>
                  <span>Enable IMAP at{' '}
                    <a className="text-sky-400 hover:underline" target="_blank" rel="noreferrer"
                      href="https://mail.google.com/mail/u/0/#settings/fwdandpop">
                      Gmail → Settings → Forwarding and POP/IMAP
                    </a>
                    {' '}(scroll down, click "Enable IMAP", Save).
                  </span>
                </li>
              </ol>
            </div>

            {keychainOk === false && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-200">macOS Keychain unavailable</p>
                  <p className="text-xs text-amber-200/70 mt-1">
                    Without Keychain, your app password would be stored as plain base64 — not secure. Sign in to your Mac, then reopen the app to enable encrypted storage.
                  </p>
                </div>
              </div>
            )}

            <Section title="Connection">
              <Field label="Gmail address">
                <Input type="email" value={gmailEmail} onChange={e => setGmailEmail(e.target.value)}
                  placeholder="you@gmail.com" />
              </Field>
              <Field label="App password (16 chars from step 2 above)"
                hint="Spaces are fine — they'll be stripped automatically.">
                <Input type="password" value={gmailPass} onChange={e => setGmailPass(e.target.value)}
                  placeholder="abcd efgh ijkl mnop" />
              </Field>

              {/* Live char count so the user can SEE if they entered the wrong password */}
              {gmailPass && (
                <p className={cn(
                  'text-[11px] -mt-1',
                  gmailPass.replace(/\s+/g, '').length === 16 ? 'text-emerald-400' : 'text-amber-300'
                )}>
                  {gmailPass.replace(/\s+/g, '').length === 16
                    ? '✓ Looks like an App Password (16 chars)'
                    : `⚠ App Passwords are exactly 16 chars. You entered ${gmailPass.replace(/\s+/g, '').length}. (Your regular Gmail password is longer/shorter and will be rejected.)`
                  }
                </p>
              )}

              <div className="flex flex-col gap-2 mt-2">
                <Button variant="phase" onClick={handleConnectGmail}
                  disabled={gmailStatus === 'connecting' || !gmailEmail || !gmailPass || keychainOk === false}>
                  {gmailStatus === 'connecting' ? 'Connecting to imap.gmail.com…'
                    : gmailStatus === 'ok' ? <><Check size={13} /> Connected</>
                    : 'Connect Gmail'}
                </Button>
                {gmailError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <span>{gmailError}</span>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Fetch Schedule">
              <NumberField label="Fetch interval" min={5} max={60} suffix="min"
                value={fs.gmailFetchIntervalMin ?? 15}
                onChange={v => setFs(p => ({ ...p, gmailFetchIntervalMin: v }))} />
            </Section>
          </TabsContent>

          {/* CATEGORIES */}
          <TabsContent value="categories" className="space-y-4 m-0">
            <p className="text-xs text-white/50 leading-relaxed">
              Categories help auto-tag captures. The local AI model uses your category names and descriptions.
            </p>

            <div className="space-y-2">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span className="text-sm font-semibold text-white">{cat.name}</span>
                  <span className="text-xs text-white/45 truncate flex-1">{cat.description}</span>
                  <button onClick={async () => {
                    await ipc.invoke('category:delete', { id: cat.id })
                    setCategories(prev => prev.filter(c => c.id !== cat.id))
                  }} className="text-white/30 hover:text-red-400 transition">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-xs text-center text-white/30 py-4 italic">No categories yet</p>
              )}
            </div>

            <Section title="Add Category">
              <Field label="Name">
                <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Research" />
              </Field>
              <Field label="Description" hint="Used by AI to match captures">
                <Input value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)}
                  placeholder="Articles & papers about my work" />
              </Field>
              <div className="flex items-center gap-3">
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                  className="w-9 h-9 rounded-md cursor-pointer bg-transparent border border-white/[0.10]" />
                <Button variant="phase" onClick={handleAddCategory} disabled={!newCatName.trim()}>
                  <Plus size={14} /> Add category
                </Button>
              </div>
            </Section>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 h-14 border-t border-white/[0.06] flex-shrink-0 bg-black/20">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="phase" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-white/70 mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-[10px] text-white/35 mt-1">{hint}</p>}
    </label>
  )
}

function NumberField({ label, value, min, max, suffix, onChange }:
  { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }
) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-white/70 mb-1.5">{label}</div>
      <div className="relative">
        <Input type="number" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className={cn(suffix && 'pr-12')} />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40 pointer-events-none">{suffix}</span>}
      </div>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-[rgba(var(--phase-r),var(--phase-g),var(--phase-b),0.85)]' : 'bg-white/[0.10]'
        )}
      >
        <span className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-4'
        )} />
      </button>
      <span className="text-sm text-white/80 group-hover:text-white transition">{label}</span>
    </label>
  )
}
