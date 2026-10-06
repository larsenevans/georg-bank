import { request as playwrightRequest, expect, type BrowserContext } from '@playwright/test'

/** Must match ACCESS_COOKIE in lib/access-flow.ts (contract is locked in scripts/access-flow.test.ts). */
export const E2E_ACCESS_COOKIE = 'access_granted'

/** Default admin secret for the local Playwright web server (never a production value). */
export const E2E_DEFAULT_ACCESS_ADMIN_SECRET = 'playwright-e2e-access-admin-secret'

/**
 * Secret used to approve test access requests via GET /api/access/decide.
 * E2E_ACCESS_ADMIN_SECRET wins (e.g. when targeting a remote BASE_URL), then ACCESS_ADMIN_SECRET.
 * Local Playwright runs fall back to the default test-only secret configured in playwright.config.ts.
 */
export function getE2eAccessAdminSecret(): string | null {
  return (
    process.env.E2E_ACCESS_ADMIN_SECRET?.trim() ||
    process.env.ACCESS_ADMIN_SECRET?.trim() ||
    (!process.env.BASE_URL ? E2E_DEFAULT_ACCESS_ADMIN_SECRET : null) ||
    null
  )
}

function randomAccessCode(): string {
  let code = ''
  for (let i = 0; i < 16; i += 1) code += Math.floor(Math.random() * 10).toString()
  return code
}

function extractCookieValue(setCookieHeaders: string[], name: string): string | null {
  for (const header of setCookieHeaders) {
    const first = header.split(';')[0] ?? ''
    const eq = first.indexOf('=')
    if (eq > 0 && first.slice(0, eq).trim() === name) {
      const value = first.slice(eq + 1).trim()
      if (value) return decodeURIComponent(value)
    }
  }
  return null
}

/**
 * Obtains an approved single-use access session through the real API flow
 * (POST /api/access/request -> admin GET /api/access/decide -> GET /api/access/status)
 * and stores the resulting `access_granted` cookie in the browser context.
 *
 * Returns null when the access flow is disabled on the server (ACCESS_FLOW_ENABLED=false).
 * Each call creates a fresh session; call it again for specs that consume the
 * session's single transaction / single PDF allowance.
 */
export async function grantAccessSession(
  context: BrowserContext,
  baseURL: string,
): Promise<string | null> {
  const api = await playwrightRequest.newContext({ baseURL })
  try {
    const probe = await api.get('/api/access/session')
    const probeBody = (await probe.json().catch(() => ({}))) as { disabled?: boolean }
    if (probe.status() === 200 && probeBody.disabled) {
      return null
    }

    const secret = getE2eAccessAdminSecret()
    if (!secret) {
      throw new Error(
        'Access flow is enabled but no admin secret is available. Set E2E_ACCESS_ADMIN_SECRET ' +
          '(or ACCESS_ADMIN_SECRET) to the server ACCESS_ADMIN_SECRET so e2e can approve a test session.',
      )
    }

    const created = await api.post('/api/access/request', {
      data: { code: randomAccessCode() },
    })
    expect(created.status(), 'POST /api/access/request').toBe(200)
    const { requestId } = (await created.json()) as { requestId: string }
    expect(requestId, 'requestId from /api/access/request').toBeTruthy()

    const decided = await api.get('/api/access/decide', {
      params: { token: secret, requestId, decision: 'approved' },
    })
    expect(
      decided.status(),
      'GET /api/access/decide (403: E2E_ACCESS_ADMIN_SECRET != server ACCESS_ADMIN_SECRET; 429: decide rate limit)',
    ).toBe(200)

    const status = await api.get('/api/access/status', { params: { requestId } })
    expect(status.status(), 'GET /api/access/status').toBe(200)
    const statusBody = (await status.json()) as { status?: string }
    expect(statusBody.status, 'access request status').toBe('approved')

    const setCookies = status
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
    const token = extractCookieValue(setCookies, E2E_ACCESS_COOKIE)
    if (!token) {
      throw new Error('Approved access request did not set the access_granted cookie.')
    }

    const url = new URL(baseURL)
    await context.addCookies([
      {
        name: E2E_ACCESS_COOKIE,
        value: token,
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
      },
    ])
    return token
  } finally {
    await api.dispose()
  }
}
