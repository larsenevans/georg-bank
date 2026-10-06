import { test, expect } from './fixtures'
import { gotoApp, expectGeorgeHeader } from './helpers/app'

test.describe('Dashboard Payment overview', () => {
  test('stránka /dashboardpayment je dostupná so zjednoteným headerom', async ({ page }) => {
    await gotoApp(page, '/dashboardpayment')
    await expect(page).toHaveURL(/dashboardpayment/, { timeout: 20000 })
    await expectGeorgeHeader(page)
    await expect(page.getByText(/Platby –/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/transakcií|Žiadne transakcie/i).first()).toBeVisible()
  })

  test('export tlačidlo volá API s month parametrom', async ({ page }) => {
    await gotoApp(page, '/dashboardpayment')
    await expect(page).toHaveURL(/dashboardpayment/, { timeout: 20000 })
    await page.waitForLoadState('networkidle')

    const exportBtn = page.getByRole('button', { name: /Exportovať výpis za/i })
    const hasTransactions = await exportBtn.isVisible().catch(() => false)

    if (!hasTransactions) {
      await expect(page.getByText(/Žiadne transakcie/i)).toBeVisible({ timeout: 10000 })
      return
    }

    const apiRequest = page.waitForRequest(
      (req) => req.url().includes('/api/export/pdf') && req.url().includes('month=2026-04'),
      { timeout: 20000 }
    )

    await exportBtn.click()
    const request = await apiRequest
    expect(request.url()).toContain('accountId=')
    expect(request.url()).toContain('month=2026-04')
  })
})
