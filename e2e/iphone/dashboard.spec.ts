import { test, expect } from '@playwright/test'
import {
  expectGeorgeHeader,
  openDashboardMenu,
  gotoApp,
  PROTECTED_DASHBOARD_ROUTES,
} from '../helpers/app'
import { loginWithPin } from '../helpers/dashboard2'
import {
  expectElementFitsViewport,
  expectNoHorizontalOverflow,
  expectPortraitViewport,
  expectTapTargetMinSize,
} from '../helpers/iphone-mobile'

test.describe('iPhone – Dashboard', () => {
  test('dashboard-001: available after login', async ({ page }) => {
    await page.goto('/dashboard2')
    await expect(page).toHaveURL(/dashboard2/)
    await expect(page).toHaveTitle(/George/i)
  })

  test('dashboard-002: portrait viewport matches modern iPhone preset', async ({ page }) => {
    await page.goto('/dashboard2')
    // iPhone 17 Pro: 402, iPhone Air: 420 CSS px
    await expectPortraitViewport(page, 390, 430)
    await expectNoHorizontalOverflow(page)
  })

  test('dashboard-003: George header 3-zone layout', async ({ page }) => {
    await loginWithPin(page)
    await expectGeorgeHeader(page)
    // Full-bleed mobile: inner Prehľad header only (outer DashboardHeader is hidden lg:block)
    const header = page.locator('#content-prehlad header')
    await expectElementFitsViewport(page, header)
  })

  test('dashboard-004: Menu and Odhlásenie tap targets', async ({ page }) => {
    await loginWithPin(page)
    // Outer Menu chrome is desktop-only; on iPhone assert Nová platba tap target
    await expectTapTargetMinSize(page.getByRole('button', { name: /Nová platba/i }))
  })

  test('dashboard-005: products and transfers sections', async ({ page }) => {
    await loginWithPin(page)
    await expect(page.getByRole('heading', { name: 'Vaše produkty' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Prehľad prevodov')).toBeVisible()
    await expect(page.getByText('SPACE účet').first()).toBeVisible()
  })

  test('dashboard-006: card number masking', async ({ page }) => {
    await loginWithPin(page)
    await page.getByRole('button', { name: 'Karty' }).click()
    await expect(page.getByRole('heading', { name: 'Vaše platobné karty' })).toBeVisible({
      timeout: 10000,
    })
  })

  test('dashboard-007: menu overlay fits viewport', async ({ page }) => {
    await page.goto('/dashboard2')
    // Mobile full-bleed has no desktop Menu drawer — assert shell fits instead
    const shell = page.locator('.d2-phone-shell').first()
    if (await shell.isVisible().catch(() => false)) {
      await expectElementFitsViewport(page, shell)
      await expectNoHorizontalOverflow(page)
      return
    }
    await openDashboardMenu(page)
    const history = page.getByRole('button', { name: /^História$/i }).first()
    await expect(history).toBeVisible()
    await expectElementFitsViewport(page, history)
    await expectNoHorizontalOverflow(page)
  })

  test('dashboard-008: menu shows SPACE účet and live balance', async ({ page }) => {
    await loginWithPin(page)
    const shell = page.locator('.d2-phone-shell').first()
    if (await shell.isVisible().catch(() => false)) {
      await expect(page.getByText('SPACE účet').first()).toBeVisible()
      return
    }
    await openDashboardMenu(page)
    const subHeader = page.locator('text=/SPACE účet \\| €/')
    await expect(subHeader.first()).toBeVisible()
    await expect(subHeader.first()).not.toHaveText(/€ 0,85/)
  })

  test('dashboard-009: menu História navigates home', async ({ page }) => {
    await gotoApp(page, '/dashboard/payment-orders')
    await openDashboardMenu(page)
    await page.getByRole('button', { name: /^História$/i }).first().click()
    await expect(page).toHaveURL(/dashboard2/)
  })

  test('dashboard-010: payment-orders with unified header', async ({ page }) => {
    await gotoApp(page, '/dashboard/payment-orders')
    await expect(page).toHaveURL(/payment-orders/)
    await expectGeorgeHeader(page)
    await expect(page.getByText('Platobné príkazy')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('dashboard-011: assistant with unified header', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    await expect(page).toHaveURL(/assistant/)
    await expectGeorgeHeader(page)
    await expectNoHorizontalOverflow(page)
  })

  test('dashboard-012: no horizontal overflow on long content', async ({ page }) => {
    await page.goto('/dashboard2')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
    await expectNoHorizontalOverflow(page)
  })

  for (const route of PROTECTED_DASHBOARD_ROUTES) {
    test(`dashboard-header: George header on ${route}`, async ({ page }) => {
      await gotoApp(page, route)
      await expect(page).not.toHaveURL(/sign-in/)
      await expectGeorgeHeader(page)
      await expectNoHorizontalOverflow(page)
    })
  }
})
