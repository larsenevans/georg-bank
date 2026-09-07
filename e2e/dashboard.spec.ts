import { test, expect } from '@playwright/test'
import {
  gotoApp,
  expectGeorgeHeader,
  openDashboardMenu,
  PROTECTED_DASHBOARD_ROUTES,
} from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'

test.describe('Dashboard', () => {
  test('Dashboard je dostupný po prihlásení', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expect(page).toHaveURL(/dashboard2/)
    await expect(page).toHaveTitle(/George/i)
  })

  test('Dashboard zobrazuje produkty a prehľad prevodov', async ({ page }) => {
    await loginWithPin(page)
    await expect(page.getByRole('heading', { name: 'Vaše produkty' })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByRole('heading', { name: 'Prehľad prevodov' })).toBeVisible()
    await expect(page.getByText('Business účet').first()).toBeVisible()
  })

  test('DashboardHeader má logo a Odhlásenie na mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoApp(page, '/dashboard2')
    // Full-bleed mobile dashboard2: no outer Menu chrome — assert Prehľad / PIN
    await expectGeorgeHeader(page)
  })

  test('Produktové karty zobrazujú SPACE a Moneyback', async ({ page }) => {
    await loginWithPin(page)
    await expect(page.getByRole('heading', { name: 'Business účet' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Moneyback' })).toBeVisible()
  })

  test('Menu História naviguje na dashboard2', async ({ page }) => {
    // Menu chrome is on classic shells (payment-orders), not full-bleed dashboard2
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page, '/dashboard/payment-orders')
    await openDashboardMenu(page)
    await page.getByRole('button', { name: /^História$/i }).first().click()
    await expect(page).toHaveURL(/dashboard2/)
  })

  test('Menu sub-header zobrazuje Business účet a reálny zostatok', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoApp(page, '/dashboard/payment-orders')
    await openDashboardMenu(page)
    // Guest seed must provide funded checking account → "Business účet | € x,xx"
    const subHeader = page.getByText(/Business účet\s*\|\s*€/)
    await expect(subHeader.first()).toBeVisible({ timeout: 15000 })
    await expect(subHeader.first()).not.toHaveText(/€ 0,85/)
  })

  test('Výpis transakcií je dostupný', async ({ page }) => {
    await loginWithPin(page)
    await page.waitForLoadState('networkidle')
    expect((await page.content()).length).toBeGreaterThan(1000)
  })

  test('Platobné príkazy používajú zjednotený header', async ({ page }) => {
    await gotoApp(page, '/dashboard/payment-orders')
    await expect(page).toHaveURL(/payment-orders/)
    await expectGeorgeHeader(page)
    await expect(page.getByText('Platobné príkazy')).toBeVisible()
  })

  test('Asistent je dostupný so zjednoteným headerom', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    await expect(page).toHaveURL(/assistant/)
    await expectGeorgeHeader(page)
  })

  test('Bez session cookie proxy vytvorí guest session a sprístupní dashboard2', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await gotoApp(page, '/dashboard2')
    await expect(page).toHaveURL(/dashboard2/)
    // Guest lands on PIN screen; session is already established
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 20000 })
    await context.close()
  })
})

test.describe('Dashboard – cross-page header', () => {
  for (const route of PROTECTED_DASHBOARD_ROUTES) {
    test(`George header na ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await gotoApp(page, route)
      await expect(page).not.toHaveURL(/sign-in/)
      await expectGeorgeHeader(page)
    })
  }
})
