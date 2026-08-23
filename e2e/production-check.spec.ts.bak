import { test, expect } from '@playwright/test'
import { gotoApp, login, passSiteGate, TEST_USER_EMAIL, TEST_USER_PASSWORD } from './helpers/app'

const isProductionTarget = !!process.env.BASE_URL?.includes('vercel.app')

test.describe('Production check – george-dev.vercel.app', () => {
  // Bez uloženej session – inak gate test skončí rovno na /dashboard.
  test.use({ storageState: { cookies: [], origins: [] } })
  test.skip(!isProductionTarget, 'Spúšťa sa len s BASE_URL=https://george-dev.vercel.app')

  test('site gate presmeruje a zablokuje prístup bez Tailscale', async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {} // no headers to simulate a normal public visitor
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).toHaveURL(/\/gate/, { timeout: 20000 })

    await expect(page.getByTestId('red-question-mark')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('input[type="password"]')).not.toBeVisible()

    await context.close()
  })

  test('site gate povolí prístup ak je užívateľ pripojený cez Tailscale', async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'X-Tailscale-User-Login': 'playwright-e2e'
      }
    })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page).not.toHaveURL(/\/gate/, { timeout: 20000 })
    await context.close()
  })

  test('sign-in stránka bez hydration chyby v konzole', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await gotoApp(page, '/sign-in')
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 20000 })

    const hydrationErrors = consoleErrors.filter((line) =>
      line.includes('Minified React error #418') || line.includes('Hydration')
    )
    expect(hydrationErrors).toEqual([])
  })

  test('prihlásenie a dashboard so zjednoteným headerom', async ({ page }) => {
    await login(page)

    await expect(page.getByText('SPACE účet').first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('header').getByRole('button', { name: /Odhlás/i })).toBeVisible()

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    await page.reload({ waitUntil: 'domcontentloaded' })

    const hydrationErrors = consoleErrors.filter((line) =>
      line.includes('Minified React error #418') || line.includes('Hydration')
    )
    expect(hydrationErrors).toEqual([])
    await expect(page.getByText('SPACE účet').first()).toBeVisible({ timeout: 20000 })
  })

  test('potvrdenie o platbe a overenie responzivity na mobile', async ({ page }) => {
    // 1. Prihlásenie
    await login(page)
    await page.waitForURL('**/dashboard2', { timeout: 45000 })

    // 2. Kliknutie na odchádzajúcu transakciu v histórii (vyberáme zo zoznamu .divide-y)
    const outgoingTxn = page.locator('section:has-text("História") .divide-y button').filter({ hasText: 'Odoslané' }).first()
    await expect(outgoingTxn).toBeVisible({ timeout: 15000 })
    await outgoingTxn.click()

    // 3. Získanie odkazu na doklad
    const receiptLink = page.getByRole('link', { name: /Zobraziť doklad/i }).first()
    await expect(receiptLink).toBeVisible({ timeout: 5000 })
    const receiptHref = await receiptLink.getAttribute('href')
    expect(receiptHref).toContain('/api/export/payment-confirmation')

    // 4. Prechod na doklad a nastavenie mobilného rozlíšenia
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(receiptHref!)

    // 5. Overenie responzivity .a4-document
    const container = page.locator('.a4-document')
    await expect(container).toBeVisible({ timeout: 15000 })

    // Overenie, že transform scale bol úspešne aplikovaný (scale < 1)
    const transform = await container.evaluate((el) => window.getComputedStyle(el).transform)
    expect(transform).toMatch(/matrix\(0\.\d+/)

    // Overenie, že body nemá scrollbary (overflow: hidden)
    const bodyOverflow = await page.locator('body').evaluate((el) => window.getComputedStyle(el).overflow)
    expect(bodyOverflow).toBe('hidden')
  })
})