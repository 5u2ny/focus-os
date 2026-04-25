import { shell } from 'electron'
import type { AppSettings } from '../renderer/shared/types'

export function playAlertSound(settings: AppSettings) {
  if (!settings.soundAlerts || settings.volume === 0) return

  // Use macOS system sound via afplay with volume control
  const vol = Math.max(0, Math.min(1, settings.volume / 100))
  try {
    const { execFile } = require('child_process')
    // Glass.aiff is a pleasant macOS system sound
    execFile('afplay', ['/System/Library/Sounds/Glass.aiff', '-v', String(vol)])
  } catch {
    // Fallback: trigger system beep
    shell.beep()
  }
}
