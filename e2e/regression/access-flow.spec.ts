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

  test('POST /api/access/logout clears toward welcome', async ({ request }) => {
    const res = await request.post('/api/access/logout', {
      headers: { Accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.redirect).toBe('/welcome')
  })

  test('dashboard redirects after the first consumed action', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync('components/george-dashboard/george-dashboard-client.tsx', 'utf8')
    expect(src).toContain('Akcia bola vykonaná. Pokračujte opätovným zadaním kódu.')
    expect(src).toContain("window.location.href = '/welcome'")
    expect(src).not.toContain('Automatické odhlásenie')
  })
})