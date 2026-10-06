import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'

/**
 * Overenie: po „Autorizovať cez George kľúč“ sa vygeneruje potvrdenie (PDF alebo HTML fallback)
 * a dá sa stiahnuť v browseri (download event).
 */
test.describe('dashboard2 – Autorizovať cez George kľúč → HTML', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  async function loginAndOpenPayment(page: import('@playwright/test').Page) {
    // E2E: force classic <a download> path (share sheet is interactive / no download event)
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
  }

  test('generuje a stiahne HTML potvrdenie po autorizácii (browser)', async ({ page }) => {
    await loginAndOpenPayment(page)

    // Default spaceBalance on dashboard2 is 0.53 € – keep amount under balance
    await page.locator('#pay-recipient').fill('Ján Testovací')
    await page.locator('#pay-iban').fill('SK8090000000001234567890')
    await page.locator('#pay-amount').fill('0.10')
    await page.locator('#pay-vs').fill('20260717')
    await page.locator('#pay-note').fill('Test PWA')

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    const download = await downloadPromise
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)
    expect(filename.toLowerCase()).toContain('potvrdenie')

    const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-george-key-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)

    if (ext === 'html') {
      const html = fs.readFileSync(tempPath, 'utf8')
      expect(html).toMatch(/<!DOCTYPE html>/i)
      expect(html.length).toBeGreaterThan(500)
      expect(html).toMatch(/Ján Testovací|Jan Testovaci/i)
      expect(html).toMatch(/0[,.]10|0\.10/)
      expect(html).toMatch(/SK80|SK 80|1234567890/i)
    } else {
      expect(fs.readFileSync(tempPath).subarray(0, 4).toString('utf8')).toBe('%PDF')
      expect(fs.statSync(tempPath).size).toBeGreaterThan(500)
    }

    fs.unlinkSync(tempPath)

    // Toast o úspešnej platbe
    await expect(page.getByText(/úspešne odoslaná|Platba/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('PWA standalone: autorizácia stále spúšťa HTML download', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()

    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window)
      window.matchMedia = ((query: string) => {
        if (query.includes('display-mode: standalone') || query.includes('display-mode: minimal-ui')) {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as MediaQueryList
        }
        return originalMatchMedia(query)
      }) as typeof window.matchMedia
    })

    await loginWithPin(page)

    const swOk = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return true
      try {
        await navigator.serviceWorker.register('/service-worker.js')
        return true
      } catch {
        return false
      }
    })
    expect(swOk).toBe(true)

    await page.addInitScript(() => {
      const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
      nav.canShare = () => false
    })

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await page.locator('#pay-recipient').fill('PWA User')
    await page.locator('#pay-iban').fill('SK9009000000000054321098')
    await page.locator('#pay-amount').fill('0.05')

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()
    const download = await downloadPromise
    const name = download.suggestedFilename()
    expect(name).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)

    const ext = name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const p = path.join(__dirname, '..', `tmp-pwa-${Date.now()}.${ext}`)
    await download.saveAs(p)
    expect(fs.statSync(p).size).toBeGreaterThan(100)
    if (ext === 'html') {
      const html = fs.readFileSync(p, 'utf8')
      expect(html).toMatch(/<!DOCTYPE html>/i)
      expect(html).toMatch(/PWA User/)
    } else {
      expect(fs.readFileSync(p).subarray(0, 4).toString('utf8')).toBe('%PDF')
    }
    fs.unlinkSync(p)

    await context.close()
  })
})
