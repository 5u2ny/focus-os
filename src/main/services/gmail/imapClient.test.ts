import { describe, test, expect, vi } from 'vitest'

// imapClient.ts pulls in `imap` and `mailparser` at module top — both are
// pure-ish but `imap` does some net-related setup. Stub them to keep load fast.
vi.mock('imap', () => ({ default: class FakeImap {} }))
vi.mock('mailparser', () => ({ simpleParser: vi.fn() }))

import { buildXOAuth2 } from './imapClient'

describe('buildXOAuth2', () => {
  test('produces base64 of "user=<email>\\x01auth=Bearer <token>\\x01\\x01" — round-trip decode matches', () => {
    const email = 'alice@example.com'
    const token = 'ya29.A0ARrdaM_FAKE_TOKEN'
    const encoded = buildXOAuth2(email, token)

    // Should be a base64 string (no special control chars)
    expect(encoded).toMatch(/^[A-Za-z0-9+/=]+$/)

    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    expect(decoded).toBe(`user=${email}\x01auth=Bearer ${token}\x01\x01`)
  })

  test('handles unicode emails (rare but legal) without corruption', () => {
    const email = 'tëst@exämple.com'
    const token = 'tok'
    const decoded = Buffer.from(buildXOAuth2(email, token), 'base64').toString('utf-8')
    expect(decoded).toBe(`user=${email}\x01auth=Bearer ${token}\x01\x01`)
  })

  test('two \\x01 separators surround the auth field, third \\x01 terminates', () => {
    const decoded = Buffer.from(buildXOAuth2('a@b.c', 'X'), 'base64').toString('utf-8')
    const ctrlBytes = [...decoded].filter(c => c === '\x01').length
    expect(ctrlBytes).toBe(3)
  })
})
