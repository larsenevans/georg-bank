import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'

test.describe('Payment confirmation – HTML obsah a API', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Odoslanie platby s unikátnymi údajmi a verifikácia potvrdenia', async ({ page }) => {
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

    const uniqueNote = `U${Date.now().toString().slice(-8)}`
    const testRecipient = 'Juraj Janosik'
    const testIban = 'SK9909000000000012345678'
    const testAmount = '0.15'

    await page.locator('#pay-recipient').fill(testRecipient)
    await page.locator('#pay-iban').fill(testIban)
    await page.locator('#pay-amount').fill(testAmount)
    await page.locator('#pay-note').fill(uniqueNote)

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    const download = await downloadPromise
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)

    const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-special-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)
    expect(fs.statSync(tempPath).size).toBeGreaterThan(100)

    if (ext === 'html') {
      const normalizedText = fs.readFileSync(tempPath, 'utf8').replace(/\s+/g, ' ')
      expect(normalizedText).toMatch(/Juraj Janosik/i)
      expect(normalizedText).toContain(uniqueNote)
    } else {
      expect(fs.readFileSync(tempPath).subarray(0, 4).toString('utf8')).toBe('%PDF')
    }

    await expect(page.getByText(/úspešne odoslaná|Platba/i).first()).toBeVisible({ timeout: 10000 })
    fs.unlinkSync(tempPath)
  })
})
