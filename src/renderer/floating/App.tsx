import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAppState } from '@shared/hooks/useAppState'
import { PHASE_LABELS, PHASE_COLORS } from '@shared/constants'
import type { TimerPhase } from '@shared/types'
import { ipc } from '@shared/ipc-client'
import type { Capture, Todo, Settings, CalendarEvent, EmailDigestItem } from '@schema'
import { OnboardingScreen } from './components/OnboardingScreen'
import { SettingsPanel } from './components/SettingsPanel'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/ui/tabs'
import { Button } from '@shared/ui/button'
import { Input } from '@shared/ui/input'
import { cn } from '@shared/lib/utils'
import {
  Play, Pause, RotateCcw, ChevronUp, Settings as SettingsIcon,
  Target, Bookmark, ListTodo, Inbox, Trash2, Plus, FileText, Check, Minus,
  AlertCircle, ExternalLink, Calendar as CalendarIcon, Clock, Mail, Archive,
  RefreshCw, Sparkles,
} from 'lucide-react'

const PHASE_RGB: Record<TimerPhase, [number, number, number]> = {
  focus:     [255, 77, 77],
  break:     [48, 209, 88],
  longBreak: [10, 132, 255],
  rest:      [148, 163, 184],
}

// Window dimensions account for outer p-3 (24px) so the visible spotlight
// surface is `width - 24` × `height - 24`. The drop-shadow lives inside the
// padding so it never bleeds past the window edge.
const COLLAPSED = { w: 728, h: 72 }
const EXPANDED  = { w: 728, h: 460 }
const ISLAND    = { w: 280, h: 52 }
const ONBOARD   = { w: 480, h: 520 }
const SETTINGS  = { w: 560, h: 640 }   // wider so the Gmail OAuth stepper has room

type Tab = 'focus' | 'saves' | 'tasks' | 'calendar' | 'inbox'

function fmt(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = (sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60)   return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

export default function App() {
  const state = useAppState()
  const [tab, setTab] = useState<Tab>('focus')
  const [expanded, setExpanded] = useState(false)
  const [isIsland, setIsIsland] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [focusSettings, setFocusSettings] = useState<Settings | null>(null)
  const [taskInput, setTaskInput] = useState('')
  const [captures, setCaptures] = useState<Capture[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTodo, setNewTodo] = useState('')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventTime, setNewEventTime] = useState('') // HH:MM today
  const [emails, setEmails] = useState<EmailDigestItem[]>([])
  const [emailsRefreshing, setEmailsRefreshing] = useState(false)
  const [generatingReplyFor, setGeneratingReplyFor] = useState<string | null>(null)
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({})
  const [captureFlash, setCaptureFlash] = useState(false)
  const [axGranted, setAxGranted] = useState<boolean | null>(null)
  const hasAutoCollapsed = useRef(false)

  // ── Accessibility permission check (re-poll until granted so the banner
  //    disappears the moment the user enables it in System Settings) ──────
  useEffect(() => {
    let mounted = true
    const check = () => ipc.invoke<boolean>('permission:checkAccessibility')
      .then(ok => { if (mounted) setAxGranted(ok) }).catch(() => {})
    check()
    const t = setInterval(() => { if (axGranted !== true) check() }, 4000)
    return () => { mounted = false; clearInterval(t) }
  }, [axGranted])

  // ── Settings load ───────────────────────────────────────────────────────
  useEffect(() => {
    ipc.invoke<Settings>('focus:settings:get').then(s => {
      setFocusSettings(s)
      if (s && !s.hasCompletedOnboarding) {
        window.focusAPI.resizeWindow(ONBOARD.h, ONBOARD.w)
      }
    }).catch(() => {})
  }, [])

  // ── Sync task input ─────────────────────────────────────────────────────
  useEffect(() => {
    if (state?.currentTask && state.currentTask !== taskInput) setTaskInput(state.currentTask)
  }, [state?.currentTask])

  // ── Initial data load ───────────────────────────────────────────────────
  useEffect(() => {
    ipc.invoke<Capture[]>('capture:list', { limit: 50 }).then(setCaptures).catch(() => {})
    ipc.invoke<Todo[]>('todo:list').then(setTodos).catch(() => {})
    // Calendar: today's events
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    const endOfDay   = new Date(); endOfDay.setHours(23, 59, 59, 999)
    ipc.invoke<CalendarEvent[]>('calendar:list', { from: startOfDay.getTime(), to: endOfDay.getTime() })
      .then(setEvents).catch(() => {})
    // Email digest — populated on connect/boot via gmail:newEmails IPC, but also
    // load whatever's already in the store for instant render.
    ipc.invoke<EmailDigestItem[]>('gmail:list').then(setEmails).catch(() => {})
  }, [])

  // Live updates when the main process pushes a fresh fetch
  useEffect(() => {
    ipc.on('gmail:newEmails', (items: EmailDigestItem[]) => {
      setEmails(items.filter(e => !e.archived))
    })
    return () => { ipc.off('gmail:newEmails') }
  }, [])

  // ── IPC listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    ipc.on('capture:new', (capture: Capture) => {
      setCaptures(prev => prev.find(c => c.id === capture.id) ? prev : [capture, ...prev])
      setCaptureFlash(true)
      setTimeout(() => setCaptureFlash(false), 1400)
      // Auto-switch to saves tab + open if collapsed
      setTab('saves')
      if (!expanded && !isIsland) {
        setExpanded(true)
        window.focusAPI.resizeWindow(EXPANDED.h, EXPANDED.w)
      }
    })
    ipc.on('ui:openSettings', () => setShowSettings(true))
    return () => { ipc.off('capture:new'); ipc.off('ui:openSettings') }
  }, [expanded, isIsland])

  // ── Phase CSS variables ─────────────────────────────────────────────────
  useEffect(() => {
    if (!state) return
    const [r, g, b] = PHASE_RGB[state.phase] ?? PHASE_RGB.focus
    const root = document.documentElement
    root.style.setProperty('--phase-r', String(r))
    root.style.setProperty('--phase-g', String(g))
    root.style.setProperty('--phase-b', String(b))
  }, [state?.phase])

  // ── Auto-collapse to island after running 8s ────────────────────────────
  useEffect(() => {
    if (!state?.isRunning || isIsland || expanded || hasAutoCollapsed.current) return
    const t = setTimeout(() => {
      hasAutoCollapsed.current = true
      setIsIsland(true)
      window.focusAPI.resizeWindow(ISLAND.h, ISLAND.w, true)
    }, 8000)
    return () => clearTimeout(t)
  }, [state?.isRunning, isIsland, expanded])

  useEffect(() => { if (!state?.isRunning) hasAutoCollapsed.current = false }, [state?.isRunning])

  // ── Auto-expand from island on break ────────────────────────────────────
  useEffect(() => {
    if ((state?.phase === 'break' || state?.phase === 'longBreak') && isIsland) {
      setIsIsland(false)
      window.focusAPI.resizeWindow(COLLAPSED.h, COLLAPSED.w, false)
    }
  }, [state?.phase, isIsland])

  // (keyboard shortcuts effect lives below the callbacks it references —
  // see the bottom of the hooks section. Splitting it here would create a
  // Temporal Dead Zone error because `closeSettings` is declared later.)

  // ── Handlers ────────────────────────────────────────────────────────────
  const expandFromIsland = useCallback(() => {
    setIsIsland(false)
    window.focusAPI.resizeWindow(COLLAPSED.h, COLLAPSED.w, false)
  }, [])

  const toggleExpanded = useCallback(() => {
    const next = !expanded
    setExpanded(next)
    window.focusAPI.resizeWindow(next ? EXPANDED.h : COLLAPSED.h, COLLAPSED.w)
  }, [expanded])

  const switchTab = useCallback((t: string) => {
    setTab(t as Tab)
    if (!expanded) {
      setExpanded(true)
      window.focusAPI.resizeWindow(EXPANDED.h, COLLAPSED.w)
    }
  }, [expanded])

  const handleStartPause = useCallback(async () => {
    if (!state) return
    if (taskInput.trim() && taskInput !== state.currentTask) {
      await window.focusAPI.setTask(taskInput.trim())
    }
    if (state.isRunning) await window.focusAPI.pauseTimer()
    else await window.focusAPI.startTimer()
  }, [state, taskInput])

  const handleReset = useCallback(async () => {
    await window.focusAPI.resetTimer()
    await window.focusAPI.setTask('')
    setTaskInput('')
  }, [])

  const handleTaskBlur = useCallback(() => {
    if (taskInput !== state?.currentTask) window.focusAPI.setTask(taskInput.trim())
  }, [taskInput, state?.currentTask])

  const addTodo = useCallback(async () => {
    if (!newTodo.trim()) return
    const t = await ipc.invoke<Todo>('todo:create', { text: newTodo.trim() })
    setTodos(prev => [t, ...prev])
    setNewTodo('')
  }, [newTodo])

  const toggleTodo = useCallback(async (todo: Todo) => {
    const updated = await ipc.invoke<Todo>('todo:update', {
      id: todo.id,
      patch: { completed: !todo.completed, completedAt: !todo.completed ? Date.now() : undefined },
    })
    setTodos(prev => prev.map(t => t.id === updated.id ? updated : t))
  }, [])

  const setActiveTodo = useCallback(async (todo: Todo) => {
    await ipc.invoke('todo:setActive', { id: todo.id })
    setTodos(prev => prev.map(t => ({ ...t, isActive: t.id === todo.id })))
    setTaskInput(todo.text)
    await window.focusAPI.setTask(todo.text)
  }, [])

  const deleteCapture = useCallback(async (id: string) => {
    await ipc.invoke('capture:delete', { id })
    setCaptures(prev => prev.filter(c => c.id !== id))
  }, [])

  // ── Calendar handlers ────────────────────────────────────────────────────
  const addEvent = useCallback(async () => {
    if (!newEventTitle.trim()) return
    // Parse "HH:MM" → today at that time. Empty → 1 hour from now.
    const start = new Date()
    if (/^\d{1,2}:\d{2}$/.test(newEventTime)) {
      const [h, m] = newEventTime.split(':').map(Number)
      start.setHours(h, m, 0, 0)
    } else {
      start.setHours(start.getHours() + 1, 0, 0, 0)
    }
    const end = new Date(start.getTime() + 30 * 60_000) // default 30 min
    const event = await ipc.invoke<CalendarEvent>('calendar:create', {
      title: newEventTitle.trim(), start: start.getTime(), end: end.getTime(),
    })
    setEvents(prev => [...prev, event].sort((a, b) => a.start - b.start))
    setNewEventTitle(''); setNewEventTime('')
  }, [newEventTitle, newEventTime])

  const deleteEvent = useCallback(async (id: string) => {
    await ipc.invoke('calendar:delete', { id })
    setEvents(prev => prev.filter(e => e.id !== id))
  }, [])

  // ── Inbox handlers ───────────────────────────────────────────────────────
  const refreshEmails = useCallback(async () => {
    setEmailsRefreshing(true)
    try {
      const items = await ipc.invoke<EmailDigestItem[]>('gmail:fetchNow')
      setEmails(items.filter(e => !e.archived))
    } catch (err) {
      console.error('Failed to refresh emails:', err)
    } finally {
      setEmailsRefreshing(false)
    }
  }, [])

  const archiveEmail = useCallback(async (id: string) => {
    await ipc.invoke('gmail:archive', { id })
    setEmails(prev => prev.filter(e => e.id !== id))
  }, [])

  const generateReply = useCallback(async (id: string) => {
    setGeneratingReplyFor(id)
    try {
      const draft = await ipc.invoke<string>('gmail:generateReply', { id })
      setDraftReplies(prev => ({ ...prev, [id]: draft }))
    } catch (err) {
      console.error('Failed to generate reply:', err)
      setDraftReplies(prev => ({ ...prev, [id]: '⚠ Failed to generate. Make sure an LLM provider is configured in Settings → AI.' }))
    } finally {
      setGeneratingReplyFor(null)
    }
  }, [])

  const openSettings = useCallback(() => {
    setShowSettings(true)
    window.focusAPI.resizeWindow(SETTINGS.h, SETTINGS.w)
  }, [])

  const closeSettings = useCallback(() => {
    setShowSettings(false)
    window.focusAPI.resizeWindow(expanded ? EXPANDED.h : COLLAPSED.h, COLLAPSED.w)
    ipc.invoke<Settings>('focus:settings:get').then(setFocusSettings).catch(() => {})
  }, [expanded])

  // ── Keyboard shortcuts (declared after deps are initialized) ────────────
  // Esc       — close settings → collapse panel → minimize to island
  //             (BUT: if the timer is running, never auto-hide — Sol's rule)
  // Cmd/Ctrl+K — focus the task input (Spotlight-style)
  // Cmd/Ctrl+1..4 — switch tabs (Focus / Saves / Tasks / Inbox)
  // Cmd/Ctrl+Enter — toggle start/pause from anywhere
  useEffect(() => {
    const TAB_BY_DIGIT: Record<string, Tab> = { '1': 'focus', '2': 'saves', '3': 'tasks', '4': 'calendar', '5': 'inbox' }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showSettings) { closeSettings(); return }
        if (expanded) {
          setExpanded(false)
          window.focusAPI.resizeWindow(COLLAPSED.h, COLLAPSED.w)
        } else if (!isIsland && !state?.isRunning) {
          // Don't auto-hide while a focus session is running
          setIsIsland(true)
          window.focusAPI.resizeWindow(ISLAND.h, ISLAND.w, true)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const inp = document.querySelector<HTMLInputElement>('input[placeholder*="working on"]')
        inp?.focus(); inp?.select()
      } else if ((e.metaKey || e.ctrlKey) && TAB_BY_DIGIT[e.key]) {
        e.preventDefault()
        switchTab(TAB_BY_DIGIT[e.key])
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleStartPause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, isIsland, showSettings, closeSettings, switchTab, handleStartPause, state?.isRunning])

  // ── Onboarding ──────────────────────────────────────────────────────────
  if (focusSettings && !focusSettings.hasCompletedOnboarding) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl p-6 overflow-auto pretty-scroll">
          <OnboardingScreen
            onComplete={() => {
              ipc.invoke('focus:settings:update', { hasCompletedOnboarding: true })
              setFocusSettings(s => s ? { ...s, hasCompletedOnboarding: true } : s)
              window.focusAPI.resizeWindow(COLLAPSED.h, COLLAPSED.w)
            }}
          />
        </div>
      </div>
    )
  }

  // ── Settings overlay ────────────────────────────────────────────────────
  if (showSettings && state) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl overflow-hidden">
          <SettingsPanel
            settings={state.settings}
            focusSettings={focusSettings}
            onSave={async (s) => { await window.focusAPI.saveSettings(s) }}
            onClose={closeSettings}
          />
        </div>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (!state) {
    return (
      <div className="h-full w-full p-3">
        <div className="spotlight-surface h-full w-full rounded-2xl flex items-center justify-center text-white/40 text-xs">
          Loading…
        </div>
      </div>
    )
  }

  const phaseColor = PHASE_COLORS[state.phase] ?? '#ff4d4d'
  const phaseLabel = PHASE_LABELS[state.phase]
  const total      = state.totalSeconds ?? state.settings.focusDuration
  const progress   = total > 0 ? state.remainingSeconds / total : 1
  const cyclePos   = state.cycleCount % state.settings.cyclesBeforeLongBreak
  const cycleTotal = state.settings.cyclesBeforeLongBreak
  const inSession  = !!state.isRunning

  // ── Dynamic Island ──────────────────────────────────────────────────────
  if (isIsland) {
    return (
      <div className="h-full w-full p-1">
        <div
          onClick={expandFromIsland}
          className={cn(
            'spotlight-surface rounded-full h-full w-full flex items-center justify-between px-4 cursor-pointer group transition-transform hover:scale-[1.02]',
            inSession && 'is-running',
            captureFlash && 'phase-glow'
          )}
          title="Click to expand · Esc to toggle"
        >
          {/* Left: status */}
          <div className="flex items-center gap-2 drag-region pointer-events-none">
            <span className="w-2 h-2 rounded-full" style={{ background: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }} />
            <span className="font-mono text-[15px] font-bold tabular-nums tracking-wide">{fmt(state.remainingSeconds)}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">{phaseLabel}</span>
          </div>
          {/* Right: hint or capture flash */}
          {captureFlash ? (
            <span className="text-[10px] phase-text font-semibold">✓ saved</span>
          ) : (
            <span className="text-[10px] text-white/35 group-hover:text-white/70 transition flex items-center gap-1">
              click to expand <ChevronUp size={10} className="rotate-180" />
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Spotlight bar (header — always visible) ─────────────────────────────
  // Parent is `drag-region` so empty space drags the window; every interactive
  // child overrides with `no-drag`. (Don't put both classes on the parent —
  // .no-drag would win and the bar would no longer be draggable.)
  const Header = (
    <div className="flex items-center gap-3 px-4 h-[60px] drag-region">
      {/* Timer pill */}
      <button
        onClick={handleStartPause}
        className={cn(
          'no-drag flex items-center gap-2 px-3 h-9 rounded-lg border transition-all',
          'phase-bg-soft phase-border phase-text font-bold',
          'hover:phase-glow'
        )}
        title={inSession ? 'Pause' : 'Start'}
      >
        {inSession ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
        <span className="font-mono text-[15px] tabular-nums tracking-wide">{fmt(state.remainingSeconds)}</span>
        <span className="text-[10px] uppercase tracking-wider opacity-70">{phaseLabel}</span>
        {/* mini progress bar */}
        <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden ml-1">
          <div className="h-full rounded-full transition-[width] duration-1000"
            style={{ width: `${(1 - progress) * 100}%`, background: phaseColor }} />
        </div>
      </button>

      {/* Task input — Cmd+K focuses this */}
      <Input
        className="no-drag flex-1 h-9"
        autoComplete="off"
        spellCheck={false}
        placeholder="What are you working on?"
        value={taskInput}
        onChange={e => setTaskInput(e.target.value)}
        onBlur={handleTaskBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { handleTaskBlur(); (e.target as HTMLInputElement).blur() }
        }}
        maxLength={120}
      />

      {/* Tab bar — must live INSIDE the same <Tabs> Root as TabsContent below.
          Two separate Roots cause Radix focus management to split. */}
      <TabsList className="no-drag">
        <TabsTrigger value="focus" title="Focus"><Target size={13} /><span className="hidden xl:inline">Focus</span></TabsTrigger>
        <TabsTrigger value="saves" title="Saves">
          <Bookmark size={13} /><span className="hidden xl:inline">Saves</span>
          {captures.length > 0 && <span className="ml-1 text-[9px] phase-text font-bold">{captures.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="tasks" title="Tasks"><ListTodo size={13} /><span className="hidden xl:inline">Tasks</span></TabsTrigger>
        <TabsTrigger value="calendar" title="Calendar">
          <CalendarIcon size={13} /><span className="hidden xl:inline">Calendar</span>
          {events.length > 0 && <span className="ml-1 text-[9px] phase-text font-bold">{events.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="inbox" title="Inbox">
          <Inbox size={13} /><span className="hidden xl:inline">Inbox</span>
          {emails.filter(e => !e.read).length > 0 && (
            <span className="ml-1 text-[9px] phase-text font-bold">{emails.filter(e => !e.read).length}</span>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Action buttons — Apple HIG: "Group items that perform similar actions
          or affect the same part of the interface." Two segments:
          (1) utility actions (Reset / Settings)
          (2) layout actions (Expand panel / Minimize to island)
          Each segment shares a subtle background; 4px gap between segments. */}
      <div className="no-drag flex items-center gap-1.5">
        <div className="toolbar-segment">
          <Button variant="icon" size="iconSm" onClick={handleReset} title="Reset timer">
            <RotateCcw size={13} />
          </Button>
          <Button variant="icon" size="iconSm" onClick={openSettings} title="Settings">
            <SettingsIcon size={13} />
          </Button>
        </div>
        <div className="toolbar-segment">
          <Button variant="icon" size="iconSm" onClick={toggleExpanded}
            title={expanded ? 'Collapse panel (Esc)' : 'Expand panel'}>
            <ChevronUp size={13} className={cn('transition-transform', expanded && 'rotate-180')} />
          </Button>
          <Button variant="icon" size="iconSm" onClick={() => {
            setIsIsland(true)
            window.focusAPI.resizeWindow(ISLAND.h, ISLAND.w, true)
          }} title="Minimize to island (Esc Esc)">
            <Minus size={13} />
          </Button>
        </div>
      </div>
    </div>
  )

  // ── Tab content panels ──────────────────────────────────────────────────
  // No `<Tabs>` wrapper here — Header and Content are siblings under the
  // single `<Tabs>` Root in the return statement below.
  const Content = (
    <div className="border-t border-white/5">
      {/* FOCUS — current state, cycle progress, quick actions */}
      <TabsContent value="focus" className="p-4 h-[336px] overflow-y-auto pretty-scroll scroll-edge-top space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Card title="Working on">
            {taskInput ? (
              <p className="text-base font-semibold text-white">{taskInput}</p>
            ) : (
              <p className="text-sm italic text-white/30">Type your task in the bar above</p>
            )}
          </Card>
          <Card title="Cycle progress">
            <div className="flex gap-1.5 mb-2">
              {Array.from({ length: cycleTotal }).map((_, i) => (
                <div key={i}
                  className={cn(
                    'flex-1 h-2 rounded-full transition-all',
                    i < cyclePos ? 'phase-glow' : i === cyclePos ? 'opacity-50' : ''
                  )}
                  style={{
                    background: i < cyclePos ? phaseColor : i === cyclePos ? phaseColor : 'rgba(255,255,255,0.10)',
                  }}
                />
              ))}
            </div>
            <p className="text-xs text-white/45">
              {cyclePos} of {cycleTotal} done
              {cyclePos < cycleTotal ? ` · long break in ${cycleTotal - cyclePos}` : ' · long break next'}
            </p>
          </Card>
        </div>

        <Card title="Stats today">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Sessions" value={state.cycleCount} />
            <Stat label="Captures" value={captures.length} />
            <Stat label="Tasks done" value={todos.filter(t => t.completed).length} />
          </div>
        </Card>

        <Card title="Quick actions">
          <div className="flex gap-2 flex-wrap">
            <Button variant="glassProminent" size="sm" onClick={handleStartPause}>
              {inSession ? <><Pause size={12} /> Pause</> : <><Play size={12} fill="currentColor" /> Start Focus</>}
            </Button>
            <Button variant="default" size="sm" onClick={() => ipc.invoke('window:openNotes', {})}>
              <FileText size={12} /> Open Notes
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw size={12} /> Reset
            </Button>
          </div>
        </Card>

        {/* First-launch helper: tell the user why captures aren't appearing */}
        {axGranted === false && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-200">Enable auto-capture</p>
              <p className="text-xs text-amber-200/70 mt-0.5">
                Grant Accessibility permission to auto-save text you highlight in any app.
              </p>
            </div>
            <Button variant="default" size="sm"
              onClick={() => ipc.invoke('permission:openAccessibilitySettings')}>
              Enable <ExternalLink size={11} />
            </Button>
          </div>
        )}
      </TabsContent>

      {/* SAVES — captures grid */}
      <TabsContent value="saves" className="p-4 h-[336px] overflow-y-auto pretty-scroll scroll-edge-top">
        {/* How-to banner — manual capture works on every install */}
        <div className="mb-3 rounded-lg border border-white/[0.10] bg-white/[0.03] p-3 flex items-start gap-3">
          <Bookmark size={16} className="phase-text flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/85">Capture any selection</p>
            <p className="text-xs text-white/55 mt-0.5">
              Highlight text in any app, then press <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-white/[0.10] border border-white/[0.10] text-[10px] font-mono">⌘⇧C</kbd> — it appears here instantly.
            </p>
          </div>
        </div>

        {/* Auto-capture status (requires manual whitelist of helper binary) */}
        {axGranted === false && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-200">Auto-capture (background) is off</p>
              <p className="text-xs text-amber-200/70 mt-0.5">
                Manual ⌘⇧C still works. To enable auto-capture (no shortcut needed), grant Accessibility permission to Focus OS.
              </p>
            </div>
            <Button variant="default" size="sm"
              onClick={() => ipc.invoke('permission:openAccessibilitySettings')}>
              Enable <ExternalLink size={11} />
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-white/55">
            {captures.length} highlight{captures.length !== 1 ? 's' : ''} captured
          </h3>
          <Button variant="ghost" size="sm" onClick={() => ipc.invoke('window:openNotes', {})}>
            <FileText size={12} /> Open Notes
          </Button>
        </div>
        {captures.length === 0 ? (
          <EmptyState icon={<Bookmark size={28} />} title="No captures yet"
            body={axGranted === false
              ? "Enable Accessibility above, then highlight text in any app — it will appear here."
              : "Highlight any text in any app and it auto-saves here. Try selecting some text now."} />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {captures.map(c => (
              <div key={c.id} className="group rounded-lg border border-white/[0.06] p-3 hover:bg-white/[0.05] hover:border-white/[0.14] transition">
                <p className="text-[13px] text-white/85 leading-snug line-clamp-3">{c.text}</p>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-white/40">
                  {c.sourceApp && <span className="truncate">📍 {c.sourceApp}</span>}
                  {c.category && <span className="px-1.5 py-0.5 rounded bg-white/[0.06]">{c.category}</span>}
                  <span className="ml-auto">{timeAgo(c.createdAt)}</span>
                  <button onClick={() => deleteCapture(c.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-white/80 transition">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* TASKS — full todo list */}
      <TabsContent value="tasks" className="p-4 h-[336px] overflow-y-auto pretty-scroll scroll-edge-top space-y-3">
        <div className="flex gap-2 sticky top-0 -mt-1 pt-1 pb-1 bg-gradient-to-b from-[rgba(14,14,18,0.98)] via-[rgba(14,14,18,0.95)] to-transparent z-10">
          <Input value={newTodo} onChange={e => setNewTodo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="Add a task…" />
          <Button variant="phase" size="default" onClick={addTodo} disabled={!newTodo.trim()}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {todos.length === 0 ? (
          <EmptyState icon={<ListTodo size={28} />} title="No tasks yet" body="Add your first task above." />
        ) : (
          <div className="space-y-1.5">
            {todos.filter(t => !t.completed).map(t => (
              <TodoRow key={t.id} todo={t} phaseColor={phaseColor}
                onToggle={() => toggleTodo(t)} onActivate={() => setActiveTodo(t)} />
            ))}
            {todos.some(t => t.completed) && (
              <div className="pt-3 mt-3 border-t border-white/5">
                <p className="text-[11px] font-semibold text-white/40 mb-2">Completed</p>
                {todos.filter(t => t.completed).map(t => (
                  <TodoRow key={t.id} todo={t} phaseColor={phaseColor}
                    onToggle={() => toggleTodo(t)} onActivate={() => setActiveTodo(t)} />
                ))}
              </div>
            )}
          </div>
        )}
      </TabsContent>

      {/* CALENDAR — today's events */}
      <TabsContent value="calendar" className="p-4 h-[336px] overflow-y-auto pretty-scroll scroll-edge-top space-y-3">
        <div className="flex gap-2">
          <Input value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEvent()}
            placeholder="Event title (e.g. Sync with Anna)" className="flex-1" />
          <Input value={newEventTime} onChange={e => setNewEventTime(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEvent()}
            placeholder="HH:MM" className="w-24" />
          <Button variant="phase" onClick={addEvent} disabled={!newEventTitle.trim()}>
            <Plus size={14} /> Add
          </Button>
        </div>

        <p className="text-[11px] font-semibold text-white/45 mt-2">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>

        {events.length === 0 ? (
          <EmptyState icon={<CalendarIcon size={28} />} title="No events today"
            body="Add a quick event above. Use HH:MM (24h) for the start time, or leave blank for next hour." />
        ) : (
          <div className="space-y-1.5">
            {events.map(ev => {
              const start = new Date(ev.start)
              const end   = new Date(ev.end)
              const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
              const isPast = ev.end < Date.now()
              return (
                <div key={ev.id} className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition',
                  isPast
                    ? 'bg-white/[0.02] border-white/[0.04] opacity-50'
                    : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07]'
                )}>
                  <div className="flex flex-col items-center justify-center text-center w-14 flex-shrink-0">
                    <Clock size={11} className="phase-text mb-0.5" />
                    <span className="text-xs font-mono font-bold tabular-nums text-white/85">{fmtTime(start)}</span>
                    <span className="text-[9px] text-white/40">→ {fmtTime(end)}</span>
                  </div>
                  <span className="flex-1 text-sm text-white/85">{ev.title}</span>
                  {ev.category && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/60">{ev.category}</span>
                  )}
                  <button onClick={() => deleteEvent(ev.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition">
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </TabsContent>

      {/* INBOX */}
      <TabsContent value="inbox" className="p-4 h-[336px] overflow-y-auto pretty-scroll scroll-edge-top">
        {inSession ? (
          <div className="flex items-center gap-2 text-sm text-white/60 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            🔒 Email is hidden during focus sessions. Check it on your break.
          </div>
        ) : !focusSettings?.gmailEnabled ? (
          <EmptyState icon={<Mail size={28} />} title="Connect Gmail"
            body="Open Settings → Gmail to sign in. Recent unread emails will appear here." />
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-white/55">
                  {emails.length} email{emails.length !== 1 ? 's' : ''}
                </h3>
                <span className="text-[10px] text-white/30">{focusSettings.gmailEmail}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={refreshEmails} disabled={emailsRefreshing}>
                <RefreshCw size={12} className={cn(emailsRefreshing && 'animate-spin')} />
                {emailsRefreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
            {emails.length === 0 ? (
              <EmptyState icon={<Mail size={28} />} title="Inbox is empty"
                body="No recent emails fetched. Click Refresh, or wait for the next 15-min poll." />
            ) : (
              <div className="space-y-2">
                {emails.map(e => (
                  <EmailCard key={e.id} email={e}
                    onArchive={() => archiveEmail(e.id)}
                    onDraft={() => generateReply(e.id)}
                    isGeneratingDraft={generatingReplyFor === e.id}
                    draft={draftReplies[e.id]}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </TabsContent>
    </div>
  )

  // Sol-style bottom hint bar — shows the relevant shortcuts for the current
  // surface state. Renders inside the expanded panel only.
  const HintBar = (
    <div className="flex items-center justify-end gap-3 px-4 h-7 border-t border-white/[0.05] text-[10px] text-white/35 flex-shrink-0">
      <KeyHint k="⌘1-5" label="switch tab" />
      <KeyHint k="⌘K" label="focus task" />
      <KeyHint k="⌘↩" label="start/pause" />
      <KeyHint k="Esc" label="collapse" />
    </div>
  )

  return (
    <div className="h-full w-full p-3">
      <div className={cn(
        'spotlight-surface rounded-3xl overflow-hidden h-full w-full',
        inSession && 'is-running'
      )}>
        {/* Single Radix Tabs Root wraps both Header and Content so trigger ↔ panel
            association is correct (was split across two roots before). */}
        <Tabs value={tab} onValueChange={switchTab} className="h-full flex flex-col">
          {Header}
          {expanded && Content}
          {expanded && HintBar}
        </Tabs>
      </div>
    </div>
  )
}

function KeyHint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.10] text-[9px] font-mono text-white/60">{k}</kbd>
      <span>{label}</span>
    </span>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  // Apple Liquid Glass: reduced custom backgrounds; let the parent material
  // show through. Border alone defines separation; no fill that fights the
  // vibrancy. Title-cased per Apple's "no ALL CAPS section headers" rule.
  return (
    <div className="rounded-xl border border-white/[0.06] p-4">
      <p className="text-[11px] font-semibold text-white/55 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-white/45">{label}</p>
    </div>
  )
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 gap-2 text-white/40">
      {icon}
      <p className="text-sm font-semibold text-white/70">{title}</p>
      <p className="text-xs max-w-sm">{body}</p>
    </div>
  )
}

function EmailCard({ email, onArchive, onDraft, isGeneratingDraft, draft }: {
  email: EmailDigestItem
  onArchive: () => void
  onDraft: () => void
  isGeneratingDraft: boolean
  draft?: string
}) {
  const importanceColor = email.importance === 'high'   ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : email.importance === 'low'    ? 'bg-white/[0.04] text-white/40 border-white/10'
                        : 'bg-white/[0.06] text-white/60 border-white/10'
  return (
    <div className={cn(
      'group rounded-lg border p-3.5 transition hover:bg-white/[0.04]',
      email.read ? 'border-white/[0.05] opacity-70' : 'border-white/[0.10]'
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border font-bold', importanceColor)}>
              {email.importance}
            </span>
            {!email.read && <span className="w-1.5 h-1.5 rounded-full phase-bg-soft" />}
            <span className="text-[10px] text-white/35 ml-auto">
              {timeAgo(email.receivedAt)}
            </span>
          </div>
          <p className="text-[12px] font-semibold text-white/90 truncate">{email.subject || '(no subject)'}</p>
          <p className="text-[11px] text-white/45 truncate mb-1">{email.from}</p>
          <p className="text-[11px] text-white/55 line-clamp-2 leading-snug">{email.preview}</p>
          {draft && (
            <div className="mt-2 p-2 rounded bg-white/[0.04] border border-white/[0.08] text-[11px] text-white/80 whitespace-pre-wrap">
              <p className="text-[9px] uppercase tracking-wider phase-text mb-1">AI draft</p>
              {draft}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onDraft} disabled={isGeneratingDraft}
            className="text-[10px] px-2 py-1 rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white flex items-center gap-1">
            <Sparkles size={10} className={cn(isGeneratingDraft && 'animate-pulse')} />
            {isGeneratingDraft ? '…' : 'Draft'}
          </button>
          <button onClick={onArchive}
            className="text-[10px] px-2 py-1 rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white flex items-center gap-1">
            <Archive size={10} /> Archive
          </button>
        </div>
      </div>
    </div>
  )
}

function TodoRow({ todo, phaseColor, onToggle, onActivate }:
  { todo: Todo; phaseColor: string; onToggle: () => void; onActivate: () => void }
) {
  return (
    <div className={cn(
      'group flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition',
      todo.isActive ? 'bg-white/[0.06] border border-white/[0.10]' : 'hover:bg-white/[0.04] border border-transparent'
    )}>
      <button onClick={onToggle} className="flex-shrink-0">
        {todo.completed
          ? <span className="w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background: phaseColor }}><Check size={11} /></span>
          : <span className="w-4 h-4 rounded-full border border-white/30 hover:border-white" />}
      </button>
      <span className={cn('flex-1 text-sm', todo.completed && 'line-through text-white/30')}>{todo.text}</span>
      {!todo.completed && (
        <button onClick={onActivate}
          className={cn(
            'opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition',
            todo.isActive ? 'phase-bg-soft phase-text opacity-100' : 'bg-white/[0.06] text-white/60 hover:bg-white/10'
          )}>
          {todo.isActive ? 'active' : 'set active'}
        </button>
      )}
    </div>
  )
}
