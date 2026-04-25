import { Notification } from 'electron'
import type { TimerPhase, AppSettings } from '../renderer/shared/types'
import { PHASE_NOTIFICATION_TITLES, PHASE_NOTIFICATION_BODIES } from '../renderer/shared/constants'

export function showPhaseNotification(phase: TimerPhase, settings: AppSettings) {
  if (!settings.desktopNotifications) return

  const title = PHASE_NOTIFICATION_TITLES[phase] ?? 'Focus Timer'
  const body = PHASE_NOTIFICATION_BODIES[phase] ?? 'Timer phase changed.'

  const notification = new Notification({ title, body, silent: true })
  notification.show()
}
