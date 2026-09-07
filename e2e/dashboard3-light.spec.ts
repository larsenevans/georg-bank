import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'

test.describe('dashboard3 – svetlý dashboard, vklad a PDF', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('PIN odomkne Prehľad so svetlým Business účtom', async ({ page }) => {
    await loginWithPin(page, undefined, { path: '/dashboard3' })
    await expect(page).toHaveURL(/\/dashboard3/)
    await expect(page.getByTestId('george-dashboard')).toHaveAttribute('data-variant', 'light')
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Business účet' })).toBeVisible()
    await expect(page.getByTestId('space-balance')).toBeVisible()
    await expect(page.getByTestId('add-money-open')).toBeVisible()
    await expect(page.getByRole('button', { name: /Nová platba/i })).toBeVisible()

    const bg = await page.getByTestId('george-dashboard').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })
    expect(bg).toMatch(/244,\s*246,\s*250|255,\s*255,\s*255/)
  })

  test('Pridať peniaze pripíše vklad na Business účet', async ({ page }) => {
    await loginWithPin(page, undefined, { path: '/dashboard3' })
    await expect(page.getByTestId('space-balance')).toBeVisible({ timeout: 15000 })

    const before = await page.evaluate(async () => {
      const res = await fetch('/api/transactions', { cache: 'no-store' })
      const data = await res.json()
      return data.accounts?.[0]?.balance as number
    })
    expect(before).toBeGreaterThan(0)

    await page.getByTestId('add-money-open').click()
    await expect(page.getByTestId('add-money-sheet-panel')).toBeVisible()
    await page.getByTestId('add-money-amount').fill('12.50')
    await page.getByTestId('add-money-submit').click()

    await expect(page.getByText(/Úspešne pripísaná platba/i).first()).toBeVisible({
      timeout: 15000,
    })

    await expect
      .poll(
        async () => {
          return page.evaluate(async () => {
            const res = await fetch('/api/transactions', { cache: 'no-store' })
            const data = await res.json()
            return data.accounts?.[0]?.balance as number
          })
        },
        { timeout: 15000 }
      )
      .toBe(before + 1250)

    await expect(page.getByText('Vklad na "Business účet"').first()).toBeVisible()
  })

  test('Nová platba vygeneruje PDF/HTML doklad', async ({ page }) => {
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

    await loginWithPin(page, undefined, { path: '/dashboard3' })
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({ timeout: 10000 })

    await page.locator('#pay-recipient').fill('wur q')
    await page.locator('#pay-iban').fill('SK8090000000001234567890')
    await page.locator('#pay-amount').fill('0.15')
    await page.locator('#pay-vs').fill('33001122')
    await page.locator('#pay-note').fill('dashboard3 pdf')

    const downloadPromise = page.waitForEvent('download', { timeout: 45000 })
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    await expect(page.getByTestId('pdf-generate-overlay')).toBeVisible({ timeout: 20000 })
    const download = await downloadPromise
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)

    const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-d3-${ext}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)
    expect(fs.statSync(tempPath).size).toBeGreaterThan(500)
    if (ext === 'pdf') {
      expect(fs.readFileSync(tempPath).subarray(0, 4).toString('utf8')).toBe('%PDF')
    }
    fs.unlinkSync(tempPath)
  })
})
