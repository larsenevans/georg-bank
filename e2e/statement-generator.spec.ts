import { test, expect } from './fixtures'
import { gotoApp } from './helpers/app'

test.describe('Generátor výpisov', () => {
  test('vygeneruje 3 HTML výpisy s vlastným názvom účtu', async ({ page }) => {
    await gotoApp(page, '/dashboard/statements/generator')
    await expect(page).toHaveURL(/statements\/generator/, { timeout: 20000 })
    await expect(page.getByText('Generátor výpisov')).toBeVisible({ timeout: 20000 })

    const accountNameInput = page.locator('#account-display-name')
    await accountNameInput.fill('')
    await accountNameInput.fill('Test SPACE')
    await page.locator('input[type="range"]').fill('15')
    await page.getByLabel('Priemerný obrat / mesiac (EUR)').fill('4000')

    await page.getByRole('button', { name: 'Vygenerovať 3 výpisy' }).click()
    await expect(page.getByRole('heading', { name: 'Výsledky' })).toBeVisible({ timeout: 45000 })

    const popupPromise = page.waitForEvent('popup', { timeout: 20000 })
    await page.getByRole('button', { name: /Otvoriť výpis/ }).first().click()
    const popup = await popupPromise
    await popup.waitForLoadState('domcontentloaded')

    const html = await popup.content()
    expect(html).toContain('Test SPACE')
    expect((html.match(/transaction-row|Odoslaný|Prichádzajúci|Dobitie/gi) || []).length).toBeGreaterThanOrEqual(10)
  })
})
