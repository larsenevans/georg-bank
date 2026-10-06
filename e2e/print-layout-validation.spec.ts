import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'

test.describe('Print Layout Validation', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Payment confirmation download is valid PDF or printable HTML', async ({ page }) => {
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
    await page.locator('#pay-recipient').fill('Test Layout')
    await page.locator('#pay-iban').fill('SK9909000000000012345678')
    await page.locator('#pay-amount').fill('0.10')

    const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    const download = await downloadPromise
    const name = download.suggestedFilename()
    expect(name).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)

    const ext = name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(__dirname, '..', `tmp-layout-test-${Date.now()}.${ext}`)
    await download.saveAs(tempPath)
    const bytes = fs.readFileSync(tempPath)
    fs.unlinkSync(tempPath)

    if (ext === 'pdf') {
      expect(bytes.subarray(0, 4).toString('utf8')).toBe('%PDF')
      expect(bytes.length).toBeGreaterThan(500)
      return
    }

    const htmlText = bytes.toString('utf8')
    await page.setContent(htmlText)
    await page.setViewportSize({ width: 1200, height: 1600 })
    await page.emulateMedia({ media: 'print' })

    const pageContainer = page.locator('.page')
    const box = await pageContainer.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(Math.round(box.width)).toBe(794)
      expect(Math.round(box.height)).toBe(1123)
    }
  })
})
