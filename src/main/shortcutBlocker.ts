import { globalShortcut } from 'electron'

const BLOCKED_SHORTCUTS = [
  'CommandOrControl+Tab',
  'CommandOrControl+W',
  'CommandOrControl+Q',
  'CommandOrControl+H',
  'CommandOrControl+M',
  'Command+Control+F',
  'CommandOrControl+N',
  'CommandOrControl+T',
]

export function blockShortcuts() {
  for (const shortcut of BLOCKED_SHORTCUTS) {
    try {
      globalShortcut.register(shortcut, () => {
        // no-op: consume the shortcut during freeze
      })
    } catch {
      // some shortcuts may fail to register — ignore
    }
  }
}

export function unblockShortcuts() {
  globalShortcut.unregisterAll()
}
