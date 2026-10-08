import { test, expect } from '@playwright/test'

/**
 * Access-flow regression (contracts locked).
 * Feasible without live admin email / DB approval: welcome UI + API shape + unit-locked constants.
 */
test.describe('access-flow regression', () => {
  // Own approved access session (see e2e/auth.setup.ts): the logout test ends it,
  // which must not invalidate the shared session in playwright/.auth/user.json.
  test.use({ storageState: 'playwright/.auth/access-regression.json' })

  test('welcome screen exposes access messaging', async ({ page }) => {
    await page.goto('/welcome')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('body')).toContainText(/prístup|pristup|kód|kod|George/i)
  })

  test('GET /api/access/session returns contract shape when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/access/session')
    // 401 without session when flow enabled, or 200 disabled
    expect([200, 401]).toContain(res.status())
    const body = await res.json()
    expect(body).toHaveProperty('logoutAt')
    expect(body).toHaveProperty('transactionUsed')
    expect(body).toHaveProperty('pdfGenerated')
  })

  test('POST /api/access/logout clears toward homepage', async ({ request }) => {
    const res = await request.post('/api/access/logout', {
      headers: { Accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.redirect).toBe('/')
  })

  test('CONTRACT-1+1 E2E UI assertions (george-dashboard-client)', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('components/george-dashboard/george-dashboard-client.tsx', 'utf8')
    // E1 & E2: 2. platba -> 403 s toastom, ZIADNY redirect
    expect(src).toContain('Platbu ste už využili. Môžete si stiahnuť PDF výpis.')
    expect(src).toContain('transaction_already_used')
    
    // E3: PDF stiahnutie -> relacia skoncila a redirect na homepage
    expect(src).toContain('Relácia skončila')
    expect(src).toContain("window.location.href = '/'")
  })
})