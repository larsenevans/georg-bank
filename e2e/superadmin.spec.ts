import { test, expect } from './fixtures'
import { SUPERADMIN_ACCESS_CODE } from '../lib/access-flow'

test.describe('Superadmin God-Mode (1111111199999999)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Superadmin instant login, zero-latency approval and dashboard access', async ({ page }) => {
    // 1. Prechod na /welcome
    await page.goto('/welcome')
    await expect(page).toHaveURL(/\/welcome/)

    // 2. Zadanie 16-miestneho superadmin kódu (1111 1111 9999 9999)
    const codeInput = page.locator('input[placeholder*="1234"], input[type="text"]').first()
    await expect(codeInput).toBeVisible()
    await codeInput.fill(SUPERADMIN_ACCESS_CODE)

    // 3. Kliknutie na Požiadať o prístup / Prihlásiť
    const submitBtn = page.locator('button[type="submit"], button:has-text("Požiadať"), button:has-text("Pokračovať")').first()
    await submitBtn.click()

    // 4. Okamžité schválenie bez čakania (Superadmin Bypass) -> redirect na /dashboard2
    await page.waitForURL(/\/dashboard2/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/dashboard2/)

    // 5. Overenie, že sa načítal účet a zostatok
    const balanceElem = page.locator('#space-balance-main, [data-testid="account-balance"]').first()
    await expect(balanceElem).toBeVisible({ timeout: 10000 })
  })

  test('Superadmin cookie provides permanent access without 403 blocks', async ({ context, page }) => {
    // Nastavenie superadmin cookie
    await context.addCookies([
      {
        name: 'gro_kan_session',
        value: 'superadmin_e2e_live_test_cookie',
        domain: 'localhost',
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
