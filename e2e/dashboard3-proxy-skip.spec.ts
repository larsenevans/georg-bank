import { test, expect } from '@playwright/test'
import { expectPinOnlyScreen } from './helpers/dashboard2'
import { GUEST_BOOTSTRAP_SKIP_COOKIE } from '../lib/guest-auth'

test.describe('dashboard3 – proxy guest skip', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('guest_bootstrap_skip cookie otvorí PIN bez slučky /api/auth/guest', async ({
    page,
    context,
    baseURL,
  }) => {
    const origin = (baseURL ?? 'http://localhost:3030').replace(/\/$/, '')
    await context.addCookies([
      {
        name: GUEST_BOOTSTRAP_SKIP_COOKIE,
        value: '1',
        url: origin,
      },
    ])

    const guestHits: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/guest')) guestHits.push(req.url())
    })

    await page.goto('/dashboard3', { waitUntil: 'domcontentloaded', timeout: 45000 })
    await expect(page).toHaveURL(/\/dashboard3/, { timeout: 15000 })
    await expectPinOnlyScreen(page)
    expect(guestHits).toEqual([])
  })
})
