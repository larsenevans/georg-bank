import { test, expect } from './fixtures'
import { expectGeorgeHeader } from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'

test.describe('PDF / HTML export – aktuálny flow', () => {
  test('Dashboard a payment-orders majú zjednotený header', async ({ page }) => {
    await page.goto('/dashboard2')
    await expectGeorgeHeader(page)

    await page.goto('/dashboard/payment-orders')
    await expect(page).toHaveURL(/payment-orders/)
    await expectGeorgeHeader(page)
  })

  test('Dashboard2 platobný sheet má autorizáciu cez George kľúč', async ({ page }) => {
    await loginWithPin(page)
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible()
    await expect(page.locator('#pay-recipient')).toBeVisible()
    await expect(page.locator('#pay-iban')).toBeVisible()
    await expect(page.locator('#pay-amount')).toBeVisible()
    await expect(page.getByRole('button', { name: /Autorizovať cez George kľúč/i })).toBeVisible()
  })
})
