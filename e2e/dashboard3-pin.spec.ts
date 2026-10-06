import { test, expect } from './fixtures'
import {
  enterPin,
  expectPinOnlyScreen,
  openPinScreen,
} from './helpers/dashboard2'
import { E2E_APP_PIN } from './helpers/app'

test.describe('dashboard3 – PIN', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('PIN-only obrazovka bez emailu a hesla', async ({ page }) => {
    await openPinScreen(page, { path: '/dashboard3' })
    await expect(page).toHaveURL(/\/dashboard3/)
    await expectPinOnlyScreen(page)
    await expect(page.getByTestId('pin-screen')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prihlásiť sa tvárou' })).toBeVisible()
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
  })

  test('Face ID overlay sa nespustí sám', async ({ page }) => {
    await openPinScreen(page, { path: '/dashboard3' })
    await expect(page.getByText(/George kľúč|bezpečnostný PIN|Zadajte/i).first()).toBeVisible()
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
  })

  test('zlý PIN ukáže chybu a ostane na klávesnici', async ({ page }) => {
    await openPinScreen(page, { path: '/dashboard3' })
    await enterPin(page, '000000')
    await expect(page.getByText(/Nesprávny PIN/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toHaveCount(0)
  })

  test('správny PIN odomkne Prehľad', async ({ page }) => {
    await openPinScreen(page, { path: '/dashboard3' })
    await enterPin(page, E2E_APP_PIN)
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({
      timeout: 15000,
    })
  })
})
