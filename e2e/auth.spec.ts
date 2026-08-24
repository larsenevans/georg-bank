import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'

/**
 * Auth flow (current product):
 * - Guest auto-login via proxy → /api/auth/guest for protected routes
 * - /sign-in and /sign-up stay reachable (manual login, no guest redirect loop)
 */
test.describe('Autentifikácia', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Sign-in zobrazí prihlasovací formulár', async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByLabel(/e-mail|email/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /pokračovať|prihlásiť|continue/i })).toBeVisible()
  })

  test('Sign-up zobrazí registračný formulár', async ({ page }) => {
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/sign-up/)
    await expect(page.getByLabel(/e-mail|email/i)).toBeVisible({ timeout: 15000 })
  })

  test('Root (/) presmeruje na dashboard2', async ({ page }) => {
    await gotoApp(page, '/')
    await expect(page).toHaveURL(/dashboard2/)
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({
      timeout: 15000,
    })
  })

  test('Guest session sprístupní klasický /dashboard2', async ({ page }) => {
    await loginWithPin(page)
    await expect(page).toHaveURL(/dashboard2/)
    await expect(page.getByText('SPACE účet').first()).toBeVisible({ timeout: 15000 })
  })
})
