import { test, expect, type Locator, type Page } from '@playwright/test'
import { enterPin, loginWithPinLight } from './helpers/dashboard2'
import { E2E_APP_PIN } from './helpers/app'

function historyRow(page: Page, recipient: string): Locator {
  return page
    .locator('#payment-history')
    .locator('[data-testid^="txn-row-"]')
    .filter({ hasText: recipient })
    .first()
}

test.describe('dashboard3 – história platieb po autorizácii', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const nav = navigator as Navigator & { canShare?: () => boolean; share?: () => Promise<void> }
      nav.canShare = () => false
      nav.share = async () => {
        throw new Error('share disabled in e2e')
      }
    })
  })

  test('platba sa objaví v histórii a v detaile má note/iban/vs', async ({ page }) => {
    await loginWithPinLight(page)

    await expect(page.locator('#payment-history')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prehľad prevodov' })).toBeVisible()

    const recipient = `História ${Date.now().toString(36)}`
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await page.locator('#pay-recipient').fill(recipient)
    await page.locator('#pay-iban').fill('SK8090000000001234567890')
    await page.locator('#pay-amount').fill('0.15')
    await page.locator('#pay-vs').fill('998877')
    await page.locator('#pay-note').fill('Poznámka hist')

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()
    await downloadPromise

    const row = historyRow(page, recipient)
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByText(/0[,.]15/)).toBeVisible()

    await page.getByRole('button', { name: 'Odoslané', exact: true }).click()
    await expect(row).toBeVisible()

    await row.click()
    const detail = page.locator('#txn-detail-modal')
    await expect(detail.getByText('Detail prevodu')).toBeVisible()
    await expect(detail.getByText('Poznámka hist')).toBeVisible()
    await expect(detail.getByText(/SK80|1234567890/i)).toBeVisible()
    await expect(detail.getByText('998877')).toBeVisible()
    await expect(detail.getByTestId('txn-download-receipt')).toBeVisible()
  })

  test('história prežije reload (localStorage / DB)', async ({ page }) => {
    const recipient = `Persist ${Date.now().toString(36)}`

    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('e2e_keep_george_state', '1')
      } catch {
        /* ignore */
      }
    })

    await page.goto('/dashboard3', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => {
      localStorage.removeItem('george_pwa_state')
      sessionStorage.setItem('e2e_keep_george_state', '1')
    })

    await loginWithPinLight(page)

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await page.locator('#pay-recipient').fill(recipient)
    await page.locator('#pay-iban').fill('SK9009000000000054321098')
    await page.locator('#pay-amount').fill('0.08')

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
    const postPromise = page
      .waitForResponse(
        (res) =>
          res.url().includes('/api/transactions') &&
          res.request().method() === 'POST' &&
          res.ok(),
        { timeout: 15000 }
      )
      .catch(() => null)

    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()
    await downloadPromise
    await postPromise
    await expect(historyRow(page, recipient)).toBeVisible({ timeout: 10000 })

    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('george_pwa_state')), {
        timeout: 5000,
      })
      .toContain(recipient)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 15000 })
    await enterPin(page, E2E_APP_PIN)

    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(historyRow(page, recipient)).toBeVisible({ timeout: 15000 })
  })
})
