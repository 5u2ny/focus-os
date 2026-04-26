import { describe, test, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ── Why source-level assertions ─────────────────────────────────────────────
// captureService.ts imports `electron`, `uiohook-napi` (a native module), and
// `active-win` at module top. Loading it in vitest under plain Node would
// require either: (a) vi.mock for every module + a heavy CommonJS shim for the
// native uIOhook constructor, or (b) a full Electron test harness. Both add
// fragile machinery for a file whose critical paths are guarded by *private*
// fields (`captureInFlight`, `lastMouseupCaptureAt`) that can't be exercised
// without a running mouse hook anyway.
//
// Instead we lock the invariants the captureFromMouseUp comment block already
// documents — the threshold + cooldown constants, and the mouseup-handler
// guard that the in-flight flag is checked UPSTREAM. Source-level assertions
// catch the realistic regression: someone tweaks the cooldown to 80ms and
// re-introduces the "app freezes when dragging windows" bug.

const SRC = fs.readFileSync(
  path.join(__dirname, 'captureService.ts'),
  'utf-8',
)

describe('captureService — guard invariants', () => {
  test('DRAG_THRESHOLD_PX constant equals 12px', () => {
    const m = SRC.match(/DRAG_THRESHOLD_PX\s*=\s*(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(12)
  })

  test('MOUSEUP_COOLDOWN_MS constant equals 800ms', () => {
    const m = SRC.match(/MOUSEUP_COOLDOWN_MS\s*=\s*(\d+)/)
    expect(m).not.toBeNull()
    expect(Number(m![1])).toBe(800)
  })

  test('mouseup handler short-circuits when captureInFlight is true (UPSTREAM guard)', () => {
    // The mouseup arrow callback must contain `if (this.captureInFlight) return;`
    // before invoking captureFromMouseUp — concurrent invocations race the
    // clipboard restoration and corrupt user data.
    expect(SRC).toMatch(/if\s*\(\s*this\.captureInFlight\s*\)\s*return/)
  })

  test('mouseup handler enforces cooldown before firing', () => {
    expect(SRC).toMatch(
      /now\s*-\s*this\.lastMouseupCaptureAt\s*<\s*CaptureService\.MOUSEUP_COOLDOWN_MS/,
    )
  })

  test('drag-distance gate uses dx + dy < threshold (Manhattan distance)', () => {
    expect(SRC).toMatch(/dx\s*\+\s*dy\s*<\s*CaptureService\.DRAG_THRESHOLD_PX/)
  })

  test('captureFromMouseUp restores original clipboard contents', () => {
    // Critical UX invariant: never permanently overwrite the user's clipboard.
    expect(SRC).toMatch(/clipboard\.writeImage\(originalImage\)/)
    expect(SRC).toMatch(/clipboard\.writeText\(originalText\)/)
  })
})
