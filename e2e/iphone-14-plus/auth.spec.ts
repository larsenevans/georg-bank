import { test, expect } from '../fixtures'
import { gotoApp, passSiteGate } from '../helpers/app'
import { expectPinOnlyScreen, loginWithPin } from '../helpers/dashboard2'
import {
  expectNoHorizontalOverflow,
  expectPortraitViewport,
  expectTapTargetMinSize,
  expectViewportMeta,
} from '../helpers/iphone-mobile'

test.describe('iPhone 14 Plus – Auth', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('auth-001: portrait viewport is 14 Plus width', async ({ page }) => {
    // Playwright iPhone 14 Plus: 428 CSS px wide
    await expectPortraitViewport(page, 420, 430)
  })

  test('auth-002: site gate unlocks app on mobile', async ({ page }) => {
    await page.goto('/dashboard2')
    // Gate may be disabled locally (SITE_GATE_ENABLED=false) – then we land via guest auth.
    if (page.url().includes('/gate')) {
      await expectViewportMeta(page)
      await expectNoHorizontalOverflow(page)
      const submit = page.locator('form button[type="submit"]')
      await expect(submit).toBeVisible({ timeout: 15000 })
      await expectTapTargetMinSize(submit)
      await passSiteGate(page)
    }
    await page.waitForURL(/dashboard2/, { timeout: 30000 })
  })

  test('auth-003: guest auto-login lands on dashboard2', async ({ page }) => {
    await loginWithPin(page)
    await expect(page).toHaveURL(/dashboard2/)
    await expect(page.getByText('Business účet').first()).toBeVisible({ timeout: 15000 })
    await expectNoHorizontalOverflow(page)
  })

  test('auth-004: sign-in route redirects to PIN screen', async ({ page }) => {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard2/)
    await expectPinOnlyScreen(page)
  })

  test('auth-005: sign-up route redirects to PIN screen', async ({ page }) => {
    await page.goto('/sign-up', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard2/)
    await expectPinOnlyScreen(page)
  })

  test('auth-006: dashboard2 after cold navigation has session', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expect(page).toHaveURL(/dashboard2/)
    await expectPinOnlyScreen(page)
  })

  test('auth-007: logout returns to PIN screen', async ({ page }) => {
    await gotoApp(page, '/dashboard/payment-orders')
    await page.locator('header').getByRole('button', { name: /Odhlás/i }).click()
    await page.waitForURL(/dashboard2/, { timeout: 20000 })
    await expectPinOnlyScreen(page)
  })

  test('auth-008: no horizontal overflow on entry', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expectPinOnlyScreen(page)
    await expectNoHorizontalOverflow(page)
  })

  test('auth-009: viewport meta is mobile-friendly', async ({ page }) => {
    await page.goto('/gate')
    if (page.url().includes('/gate')) {
      await expectViewportMeta(page)
    } else {
      await gotoApp(page, '/dashboard2')
      await expectViewportMeta(page)
    }
  })

  test('auth-010: protected payment-orders reachable after guest session', async ({ page }) => {
    await gotoApp(page, '/dashboard/payment-orders')
    await expect(page).toHaveURL(/payment-orders/)
    await expect(page.getByText('Platobné príkazy')).toBeVisible({ timeout: 15000 })
    await expectNoHorizontalOverflow(page)
  })
})
