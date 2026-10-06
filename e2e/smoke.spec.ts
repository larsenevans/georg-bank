import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'

/**
 * Smoke: dashboard2 payment sheet → authorize → download confirmation (PDF or HTML).
 */
test.describe('George Smoke Test – platba a HTML potvrdenie', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Kompletný platobný flow a stiahnutie HTML potvrdenia', async ({ page }) => {
    await page.addInitScript(() => {
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean
        share?: () => Promise<void>
      }
      nav.canShare = () => false
      nav.share = async () => {
        throw new Error('share disabled in e2e')
      }
    })

    await loginWithPin(page)
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({ timeout: 10000 })

    await page.locator('#pay-recipient').fill('Smoke Test')
    await page.locator('#pay-iban').fill('SK8090000000001234567890')
    await page.locator('#pay-amount').fill('0.10')
    await page.locator('#pay-note').fill('Smoke')

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    const download = await downloadPromise
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)

    const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-smoke-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)
    expect(fs.statSync(tempPath).size).toBeGreaterThan(100)
    fs.unlinkSync(tempPath)
  })
})
