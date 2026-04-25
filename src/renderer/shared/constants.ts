import type { AppSettings } from './types'

export const DEFAULT_SETTINGS: AppSettings = {
  focusDuration: 25 * 60,
  breakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  freezeDuration: 0,
  desktopNotifications: true,
  soundAlerts: true,
  volume: 80,
}

export const PHASE_LABELS: Record<string, string> = {
  focus: 'FOCUS',
  break: 'BREAK',
  longBreak: 'LONG BREAK',
  rest: 'REST',
}

export const PHASE_MESSAGES: Record<string, string> = {
  focus: 'Time to focus.',
  break: 'Step away. Breathe. Rest.',
  longBreak: 'Great work. Take a long break.',
  rest: 'Give it a rest. Take a breather.',
}

export const PHASE_COLORS: Record<string, string> = {
  focus: '#ef4444',
  break: '#22c55e',
  longBreak: '#3b82f6',
  rest: '#8b5cf6',
}

export const PHASE_NOTIFICATION_TITLES: Record<string, string> = {
  focus: 'Focus Time',
  break: 'Short Break',
  longBreak: 'Long Break',
  rest: 'Eye Strain Warning',
}

export const PHASE_NOTIFICATION_BODIES: Record<string, string> = {
  focus: 'Break over -- time to focus!',
  break: 'Work session complete! Take a short break.',
  longBreak: 'Great work! You earned a long break.',
  rest: 'You have been on the same app/window for 2 hours. Take a 1-minute break!',
}
