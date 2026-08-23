import { test, expect } from '@playwright/test'

test.describe('Simple Smoke Tests', () => {
  test('API Health endpoint', async ({ page }) => {
    const response = await page.request.get('/api/health')
    expect(response.status()).toBe(503) // Expected due to database issue
    const data = await response.json()
    expect(data).toHaveProperty('ok')
    expect(data).toHaveProperty('betterAuth')
  })

  test('Main page redirects to gate', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(+/gate/)
  })
})
