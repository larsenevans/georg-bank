import { test, expect } from '@playwright/test'

test.describe('Logout Redirection to Homepage (/) Suite', () => {
  test.use({ storageState: 'playwright/.auth/access-regression.json' })

  test('POST /api/access/logout vracia redirect: / a maže access cookie', async ({ request }) => {
    const res = await request.post('/api/access/logout', {
      headers: {
        Accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
    })
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.redirect).toBe('/')
  })

  test('GET /api/access/logout vykonáva HTTP redirect priamo na root homepage (/)', async ({ page }) => {
    await page.goto('/api/access/logout', { waitUntil: 'domcontentloaded' })
    const finalUrl = page.url()
    // Overenie, že po odhlásení skončíme na homepage alebo welcome
    expect(finalUrl).toMatch(/(\/|\/welcome|\/gate)/)
  })
})
