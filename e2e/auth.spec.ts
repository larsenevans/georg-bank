import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'

/**
 * Auth flow (PIN-only):
 * - Guest auto-login via proxy → /api/auth/guest for protected routes
 * - User-facing entry: 6-digit PIN on /dashboard2 (no sign-in/sign-up)
 */
test.describe('Autentifikácia', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Sign-in presmeruje na dashboard2 s PIN obrazovkou', async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard2/)
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 15000 })
  })

  test('Sign-up presmeruje na dashboard2 s PIN obrazovkou', async ({ page }) => {
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard2/)
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 15000 })
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
