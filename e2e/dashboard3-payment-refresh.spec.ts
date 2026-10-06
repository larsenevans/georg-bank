import { test, expect } from './fixtures'
import { loginWithPinLight } from './helpers/dashboard2'
import { E2E_APP_PIN } from './helpers/app'

async function readApiBalance(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/transactions', { cache: 'no-store' })
    const data = await res.json()
    return {
      ok: Boolean(data.success),
      cents: data.accounts?.[0]?.balance as number | undefined,
      accountNumber: data.accounts?.[0]?.accountNumber as string | undefined,
      latestAfter:
        typeof data.transactions?.[0]?.balanceAfter === 'number'
          ? Math.round(data.transactions[0].balanceAfter * 100)
          : undefined,
    }
  })
}

test.describe('dashboard3 – platba ostane odpísaná po refreshi', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('GET/POST používajú rovnaký Business účet a refresh nevráti sumu', async ({ page }) => {
    await loginWithPinLight(page)
    await expect(page).toHaveURL(/\/dashboard3/)
    await expect(page.getByTestId('space-balance')).toBeVisible({ timeout: 15000 })

    const before = await readApiBalance(page)
    expect(before.ok).toBe(true)
    expect(before.cents).toBeGreaterThan(200)

    const amountEur = 1.23
    const amountCents = 123
    const pay = await page.evaluate(async (amount) => {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: 'wur q',
          amount,
          note: 'e2e refresh d3',
          type: 'outgoing',
          iban: 'SK8090000000001234567890',
        }),
      })
      return res.json()
    }, amountEur)

    expect(pay.success, pay.error || 'POST failed').toBe(true)
    const afterPayCents = Math.round(Number(pay.transaction.balanceAfter) * 100)
    expect(afterPayCents).toBe((before.cents as number) - amountCents)

    await page.reload({ waitUntil: 'domcontentloaded' })
    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i)
    if (await pinHeading.isVisible().catch(() => false)) {
      for (const digit of E2E_APP_PIN) {
        await page.getByRole('button', { name: digit, exact: true }).click()
      }
    }
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(page.getByTestId('space-balance')).toBeVisible({ timeout: 15000 })

    const afterRefresh = await readApiBalance(page)
    expect(afterRefresh.ok).toBe(true)
    expect(afterRefresh.cents).toBe(afterPayCents)
    expect(afterRefresh.accountNumber).toBe(before.accountNumber)
    if (afterRefresh.latestAfter != null) {
      expect(afterRefresh.latestAfter).toBe(afterPayCents)
    }
  })
})
