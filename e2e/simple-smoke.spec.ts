import { test, expect } from '@playwright/test'

test.describe('Simple Smoke Tests', () => {
  test('API Health endpoint', async ({ page }) => {
    const response = await page.request.get('/api/health')
    const status = response.status()
    // CI has Postgres → 200 when fully configured; local without DB may return 503
    expect([200, 503]).toContain(status)
    const data = await response.json()
    expect(data).toHaveProperty('ok')
    expect(data).toHaveProperty('betterAuth')
    if (status === 200) {
      expect(data.ok).toBe(true)
      expect(data.database).toBe('ok')
    }
  })

  test('Main page loads (gate when enabled)', async ({ page }) => {
    await page.goto('/')
    const gateEnabled = process.env.SITE_GATE_ENABLED !== 'false'
    if (gateEnabled) {
      await expect(page).toHaveURL(/\/gate/)
    } else {
      // CI disables site gate — app redirects to dashboard2 or sign-in
      await expect(page).toHaveURL(/\/(dashboard2|sign-in|gate)/)
    }
  })
})
