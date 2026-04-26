import { describe, test, expect, beforeEach, vi } from 'vitest'

// ── Module mocks ────────────────────────────────────────────────────────────
// `oauth.ts` imports electron + focusStore + secureStore at module top. We mock
// them all so the module can load in plain Node without the Electron runtime.

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}))

const settingsRef: { current: Record<string, any> } = { current: {} }
const updateSettingsMock = vi.fn((patch: Record<string, any>) => {
  settingsRef.current = { ...settingsRef.current, ...patch }
})
vi.mock('../store', () => ({
  focusStore: {
    getSettings: () => settingsRef.current,
    updateSettings: (p: Record<string, any>) => updateSettingsMock(p),
  },
}))

vi.mock('../keychain/secureStore', () => ({
  secureStore: {
    encrypt: (s: string) => `enc(${s})`,
    decrypt: (s: string) => s.replace(/^enc\(/, '').replace(/\)$/, ''),
  },
}))

import { getValidAccessToken } from './oauth'

beforeEach(() => {
  settingsRef.current = {}
  updateSettingsMock.mockClear()
  vi.restoreAllMocks()
})

describe('getValidAccessToken', () => {
  test('throws helpful error when no refresh token is saved', async () => {
    settingsRef.current = {}
    await expect(getValidAccessToken()).rejects.toThrow(/Gmail OAuth not connected/i)
  })

  test('returns cached access token when not expired', async () => {
    settingsRef.current = {
      gmailEmail: 'me@example.com',
      gmailOauthClientId: 'cid',
      gmailOauthClientSecretEncrypted: 'enc(secret)',
      gmailOauthRefreshTokenEncrypted: 'enc(refresh)',
      gmailOauthAccessTokenEncrypted: 'enc(cached-access)',
      gmailOauthAccessTokenExpiresAt: Date.now() + 60_000, // valid for 60s
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as any)
    const result = await getValidAccessToken()
    expect(result).toEqual({ email: 'me@example.com', accessToken: 'cached-access' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(updateSettingsMock).not.toHaveBeenCalled()
  })

  test('refreshes access token via TOKEN_URL when expired and persists new token + expiry', async () => {
    settingsRef.current = {
      gmailEmail: 'me@example.com',
      gmailOauthClientId: 'cid',
      gmailOauthClientSecretEncrypted: 'enc(secret)',
      gmailOauthRefreshTokenEncrypted: 'enc(refresh)',
      gmailOauthAccessTokenEncrypted: 'enc(stale)',
      gmailOauthAccessTokenExpiresAt: Date.now() - 1_000, // expired
    }

    const fetchMock = vi.fn(async (url: any, init: any) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ access_token: 'NEW_ACCESS', expires_in: 3600, token_type: 'Bearer' }),
      text: async () => '',
    }))
    vi.stubGlobal('fetch', fetchMock)

    const before = Date.now()
    const result = await getValidAccessToken()
    const after = Date.now()

    expect(result.accessToken).toBe('NEW_ACCESS')
    expect(result.email).toBe('me@example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]
    expect(String(calledUrl)).toBe('https://oauth2.googleapis.com/token')
    expect(calledInit.method).toBe('POST')
    // Body should be a URLSearchParams containing grant_type=refresh_token
    const bodyStr = (calledInit.body as URLSearchParams).toString()
    expect(bodyStr).toContain('grant_type=refresh_token')
    expect(bodyStr).toContain('refresh_token=refresh')
    expect(bodyStr).toContain('client_id=cid')

    expect(updateSettingsMock).toHaveBeenCalledTimes(1)
    const patch = updateSettingsMock.mock.calls[0][0]
    expect(patch.gmailOauthAccessTokenEncrypted).toBe('enc(NEW_ACCESS)')
    // Expiry: roughly now + (3600 - 60)s, allow ± a couple of seconds
    const expectedMin = before + (3600 - 60) * 1000
    const expectedMax = after + (3600 - 60) * 1000
    expect(patch.gmailOauthAccessTokenExpiresAt).toBeGreaterThanOrEqual(expectedMin)
    expect(patch.gmailOauthAccessTokenExpiresAt).toBeLessThanOrEqual(expectedMax)
  })

  test('throws when token refresh response is not ok', async () => {
    settingsRef.current = {
      gmailEmail: 'me@example.com',
      gmailOauthClientId: 'cid',
      gmailOauthClientSecretEncrypted: 'enc(secret)',
      gmailOauthRefreshTokenEncrypted: 'enc(refresh)',
      gmailOauthAccessTokenExpiresAt: Date.now() - 1_000,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'invalid_grant' }),
      })),
    )
    await expect(getValidAccessToken()).rejects.toThrow(/Token refresh failed/i)
  })
})
