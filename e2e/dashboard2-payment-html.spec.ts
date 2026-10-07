import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { loginWithPin } from './helpers/dashboard2'
import { DEMO_ACCOUNT_NUMBER, LEGACY_FAKE_SENDER_IBAN } from '../lib/demo-user'

/** Masked random sender IBAN in format SK31 0900 xxxx xxxx xxxx for privacy/security. */
const MASKED_SENDER_IBAN_RE = /^SK310900\d{12}$/

/**
 * E2E: vyplnenie platby na /dashboard2 → Autorizovať cez George kľúč
 * → PDF potvrdenie (+ sandbox doklady).
 */
const PAYMENT = {
  recipient: 'Mária Nováková',
  iban: 'SK8090000000001234567890',
  amount: '0.25',
  vs: '20260717',
  note: 'Test HTML',
} as const

test.describe('dashboard2 – vyplnenie platby + PDF potvrdenie', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Nová platba sheet je hneď vo viewporte (100dvh, bez scrollu)', async ({ page }) => {
    await loginWithPin(page)
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible()

    const scrollBefore = await page.evaluate(() => window.scrollY)
    await page.getByRole('button', { name: /Nová platba/i }).click()

    const sheet = page.getByTestId('payment-sheet')
    const panel = page.getByTestId('payment-sheet-panel')
    const heading = page.getByRole('heading', { name: 'Nová platba' })

    await expect(sheet).toBeVisible({ timeout: 10000 })
    await expect(heading).toBeVisible()

    const vp = page.viewportSize()
    expect(vp).toBeTruthy()

    // Wait for slide-up transition to finish (panel flush with viewport top).
    await expect
      .poll(async () => (await panel.boundingBox())?.y ?? 999, {
        timeout: 5000,
        intervals: [50, 100, 150],
      })
      .toBeLessThan(8)

    const headingBox = await heading.boundingBox()
    const panelBox = await panel.boundingBox()
    expect(headingBox).toBeTruthy()
    expect(panelBox).toBeTruthy()
    expect(headingBox!.y).toBeGreaterThanOrEqual(0)
    expect(headingBox!.y).toBeLessThan(vp!.height)
    expect(panelBox!.height).toBeGreaterThan(vp!.height * 0.9)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  })

  test('vyplní platbu, autorizuje George kľúčom a overí PDF download + IBAN', async ({ page }) => {
    // Force <a download> (bez Web Share sheetu v headless)
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

    await expect(page.getByTestId('receipts-sandbox')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('#pay-recipient')).toBeVisible()

    await page.locator('#pay-recipient').fill(PAYMENT.recipient)
    await page.locator('#pay-iban').fill(PAYMENT.iban)
    await page.locator('#pay-amount').fill(PAYMENT.amount)
    await page.locator('#pay-vs').fill(PAYMENT.vs)
    await page.locator('#pay-note').fill(PAYMENT.note)

    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    await expect(page.getByText(/Platba 0[,.]25|zapísaná/i).first()).toBeVisible({
      timeout: 10000,
    })

    await expect(page.locator('text=' + PAYMENT.recipient).first()).toBeVisible({ timeout: 15000 })
    await page.locator('text=' + PAYMENT.recipient).first().click()
    await expect(page.getByRole('button', { name: 'Stiahnuť doklad' })).toBeVisible()

    const downloadPromise = page.waitForEvent('download', { timeout: 45000 })
    await page.getByRole('button', { name: 'Stiahnuť doklad' }).click()

    // Overlay appear right after click
    await expect(page.getByTestId('pdf-generate-overlay')).toBeVisible({ timeout: 20000 })

    const download = await downloadPromise
    const filename = download.suggestedFilename()
    // Prefer PDF; HTML fallback is still acceptable if canvas fails in CI.
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)
    expect(filename).toContain(PAYMENT.vs)

    const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html'
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-payment-${ext}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)
    const size = fs.statSync(tempPath).size
    expect(size).toBeGreaterThan(500)

    if (ext === 'pdf') {
      const magic = fs.readFileSync(tempPath).subarray(0, 4).toString('utf8')
      expect(magic).toBe('%PDF')
    } else {
      const html = fs.readFileSync(tempPath, 'utf8')
      const compact = html.replace(/\s+/g, '')
      expect(html).toMatch(/<!DOCTYPE html>/i)
      expect(html).toMatch(/Mária Nováková|Maria Novakova/i)
      expect(html).toMatch(/0[,.]25/)
      expect(compact).toMatch(/SK310900\d{12}/)
      expect(compact).not.toContain(DEMO_ACCOUNT_NUMBER)
      expect(compact).not.toContain(LEGACY_FAKE_SENDER_IBAN)
      expect(compact).toContain(PAYMENT.iban)
    }

    fs.unlinkSync(tempPath)

    await expect(page.getByTestId('pdf-generate-overlay')).toBeHidden({ timeout: 15000 })

    await expect(
      page.getByTestId('receipts-sandbox-list').getByText(PAYMENT.recipient).first()
    ).toBeVisible({ timeout: 15000 })
  })

  test('HTML receipt obsahuje reálny sender IBAN (nie fake SK90…)', async ({ page }) => {
    await page.addInitScript(() => {
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean
        share?: () => Promise<void>
      }
      nav.canShare = () => false
      nav.share = async () => {
        throw new Error('share disabled in e2e')
      }
      ;(window as Window & { __GEORGE_FORCE_HTML_RECEIPT__?: boolean }).__GEORGE_FORCE_HTML_RECEIPT__ =
        true
    })

    await loginWithPin(page)

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({ timeout: 10000 })

    // Tiny amount — survives prior suite drains of the demo balance.
    await page.locator('#pay-recipient').fill('IBAN Check')
    await page.locator('#pay-iban').fill(PAYMENT.iban)
    await page.locator('#pay-amount').fill('0.01')
    await page.locator('#pay-vs').fill('99001122')
    await page.locator('#pay-note').fill('iban chk')

    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()
    
    await expect(page.locator('text=IBAN Check').first()).toBeVisible({ timeout: 15000 })
    await page.locator('text=IBAN Check').first().click()
    await expect(page.getByRole('button', { name: 'Stiahnuť doklad' })).toBeVisible()
    
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 })
    await page.getByRole('button', { name: 'Stiahnuť doklad' }).click()

    const download = await downloadPromise
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/\.html$/i)

    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-iban-check-${Date.now()}-${Math.random().toString(36).slice(2)}.html`
    )
    await download.saveAs(tempPath)
    const html = fs.readFileSync(tempPath, 'utf8')
    const compact = html.replace(/\s+/g, '')
    const senderMatch = compact.match(/SK310900\d{12}/)
    expect(senderMatch, 'sender IBAN must be masked random SK31 0900 ...').toBeTruthy()
    expect(MASKED_SENDER_IBAN_RE.test(senderMatch![0])).toBe(true)
    expect(compact).not.toContain(DEMO_ACCOUNT_NUMBER)
    expect(compact).not.toContain('SK3109000000005012345679')
    expect(compact).not.toContain(LEGACY_FAKE_SENDER_IBAN)
    expect(compact).not.toMatch(/SK90.*98765432/)
    expect(compact).toContain(PAYMENT.iban)
    expect(html).toMatch(/IBAN Check/i)
    fs.unlinkSync(tempPath)
  })

  test('prázdny formulár nespustí download', async ({ page }) => {
    await page.addInitScript(() => {
      const nav = navigator as Navigator & { canShare?: () => boolean }
      nav.canShare = () => false
    })

    await loginWithPin(page)

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    await expect(page.getByText(/vyplňte správne|Prosím/i).first()).toBeVisible({ timeout: 10000 })
  })
})
