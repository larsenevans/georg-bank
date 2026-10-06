import { test as base, type Browser } from '@playwright/test'
import { grantAccessSession } from './helpers/access-session'

export * from '@playwright/test'

/**
 * Drop-in replacement for `@playwright/test` in app specs.
 *
 * The welcome access gate (proxy.ts + /dashboard2) requires an approved access session
 * cookie; without it every page bounces to /welcome. Sessions are single-use
 * (1 transaction + 1 PDF, then auto-logout after 60 s), so each test gets its own
 * freshly approved session via the real API flow (see helpers/access-session.ts):
 * - the default `context` (also when a spec uses an empty storageState), and
 * - any context the test creates itself via `browser.newContext(...)`.
 *
 * Specs that must stay without an access session should import from '@playwright/test'.
 */
export const test = base.extend<{ accessSession: string | null }>({
  accessSession: [
    async ({ browser, context, baseURL }, use) => {
      const origin = baseURL ?? 'http://localhost:3030'
      const token = await grantAccessSession(context, origin)

      const originalNewContext = browser.newContext.bind(browser)
      const patched: Browser['newContext'] = async (options) => {
        const created = await originalNewContext(options)
        await grantAccessSession(created, origin)
        return created
      }
      browser.newContext = patched
      try {
        await use(token)
      } finally {
        browser.newContext = originalNewContext
      }
    },
    { auto: true },
  ],
})