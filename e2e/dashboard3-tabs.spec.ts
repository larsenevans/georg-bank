import { test, expect } from './fixtures'
import { loginWithPinLight } from './helpers/dashboard2'

test.describe('dashboard3 – záložky', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Invest / Objavujte / Kontakty prepínajú content panely', async ({ page }) => {
    await loginWithPinLight(page)

    await expect(page.locator('#content-prehlad')).toBeVisible()
    await expect(page.locator('#content-invest')).toBeHidden()
    await expect(page.locator('#content-objavujte')).toBeHidden()
    await expect(page.locator('#content-kontakty')).toBeHidden()

    await page.locator('#tab-invest').click()
    await expect(page.locator('#content-invest')).toBeVisible()
    await expect(page.locator('#content-prehlad')).toBeHidden()

    await page.locator('#tab-objavujte').click()
    await expect(page.locator('#content-objavujte')).toBeVisible()
    await expect(page.locator('#content-invest')).toBeHidden()

    await page.locator('#tab-kontakty').click()
    await expect(page.locator('#content-kontakty')).toBeVisible()
    await expect(page.locator('#content-objavujte')).toBeHidden()

    await page.locator('#tab-prehlad').click()
    await expect(page.locator('#content-prehlad')).toBeVisible()
    await expect(page.locator('#content-kontakty')).toBeHidden()
  })
})
