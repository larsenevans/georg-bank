import { test, expect } from '@playwright/test'
import { ACCESS_COOKIE } from '../lib/access-flow'

test.describe('Superadmin God-Mode (1111111199999999)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Superadmin instant login, zero-latency approval and dashboard access', async ({ page }) => {
    // 1. Prechod na /welcome
    await page.goto('/welcome')
    await expect(page).toHaveURL(/\/welcome/)

    // 2. Zadanie 16-miestneho superadmin kódu (8x 1 + 8x 9)
    const key1 = page.locator('[data-testid="key-1"]')
    const key9 = page.locator('[data-testid="key-9"]')
    await expect(key1).toBeVisible({ timeout: 10000 })

    for (let i = 0; i < 8; i++) {
      await key1.click()
    }
    for (let i = 0; i < 8; i++) {
      await key9.click()
    }

    // 3. Kliknutie na Požiadať o prístup
    const submitBtn = page.locator('[data-testid="submit-code"]')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // 4. Okamžité schválenie bez čakania (Superadmin Bypass) -> redirect na /dashboard2
    await page.waitForURL(/\/dashboard2/, { timeout: 15000 })
    await expect(page).toHaveURL(/\/dashboard2/)

    // 5. Ak sa zobrazí obrazovka PIN kódu, zadáme PIN 1111
    const pin1Btn = page.getByRole('button', { name: '1', exact: true })
    if (await pin1Btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 0; i < 4; i++) {
        await pin1Btn.click()
      }
    }

    await expect(page.locator('body')).toBeVisible()
  })

  test('Superadmin cookie provides permanent access without 403 blocks', async ({ context, page, baseURL }) => {
    const origin = baseURL ?? 'http://localhost:3030'
    const urlObj = new URL(origin)
    // Nastavenie superadmin cookie
    await context.addCookies([
      {
        name: ACCESS_COOKIE,
        value: 'superadmin_e2e_live_test_cookie',
        domain: urlObj.hostname,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])

    // Priamy prístup na chránený dashboard2
    await page.goto('/dashboard2')
    await expect(page).toHaveURL(/\/dashboard2/)
  })
})
