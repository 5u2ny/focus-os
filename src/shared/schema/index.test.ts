import { describe, test, expect } from 'vitest'
import { DEFAULT_SETTINGS, STORE_SCHEMA, type Settings } from './index'

describe('DEFAULT_SETTINGS', () => {
  test('satisfies the Settings interface (compile-time + runtime shape)', () => {
    // Compile-time assertion: assigning to Settings will fail typecheck if a
    // required field is missing.
    const s: Settings = DEFAULT_SETTINGS
    expect(s).toBeDefined()
  })

  test('has all required (non-optional) Settings fields with correct types', () => {
    expect(typeof DEFAULT_SETTINGS.hasCompletedOnboarding).toBe('boolean')
    expect(typeof DEFAULT_SETTINGS.hasGrantedAccessibility).toBe('boolean')
    expect(typeof DEFAULT_SETTINGS.captureShortcut).toBe('string')
    expect(typeof DEFAULT_SETTINGS.captureSilent).toBe('boolean')
    expect(typeof DEFAULT_SETTINGS.gmailEnabled).toBe('boolean')
    expect(typeof DEFAULT_SETTINGS.gmailFetchIntervalMin).toBe('number')
    expect(typeof DEFAULT_SETTINGS.gmailMaxResultsPerFetch).toBe('number')
    expect(typeof DEFAULT_SETTINGS.sidebarWidth).toBe('number')
    expect(typeof DEFAULT_SETTINGS.llmTelemetryConsent).toBe('boolean')
    expect(['top', 'left', 'right', 'bottom']).toContain(DEFAULT_SETTINGS.pillEdge)
    expect(DEFAULT_SETTINGS.pillPosition).toEqual({ x: 100, y: 40 })
    expect(typeof DEFAULT_SETTINGS.pillPosition.x).toBe('number')
    expect(typeof DEFAULT_SETTINGS.pillPosition.y).toBe('number')
  })

  test('does NOT include optional fields by default (avoids leaking undefined keys)', () => {
    expect('llmApiKeyEncrypted' in DEFAULT_SETTINGS).toBe(false)
    expect('gmailEmail' in DEFAULT_SETTINGS).toBe(false)
    expect('gmailOauthRefreshTokenEncrypted' in DEFAULT_SETTINGS).toBe(false)
  })

  test('captureShortcut uses CommandOrControl prefix (cross-platform)', () => {
    expect(DEFAULT_SETTINGS.captureShortcut).toMatch(/^CommandOrControl\+/)
  })

  test('gmail fetch interval is sane (>= 1 minute, <= 1 hour)', () => {
    expect(DEFAULT_SETTINGS.gmailFetchIntervalMin).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_SETTINGS.gmailFetchIntervalMin).toBeLessThanOrEqual(60)
  })
})

describe('STORE_SCHEMA', () => {
  test('declares all entity buckets as arrays defaulting to []', () => {
    for (const key of ['captures', 'notes', 'todos', 'calendarEvents', 'emails', 'categories'] as const) {
      const entry = (STORE_SCHEMA as any)[key]
      expect(entry).toBeDefined()
      expect(entry.type).toBe('array')
      expect(entry.default).toEqual([])
    }
  })

  test('settings bucket is an object defaulting to DEFAULT_SETTINGS', () => {
    expect(STORE_SCHEMA.settings.type).toBe('object')
    expect(STORE_SCHEMA.settings.default).toBe(DEFAULT_SETTINGS)
  })
})
