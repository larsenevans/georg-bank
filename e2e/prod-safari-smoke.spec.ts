import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { gotoAbsolute } from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'
import { DEMO_ACCOUNT_NUMBER, LEGACY_FAKE_SENDER_IBAN } from '../lib/demo-user'

const GEORGE_URL = (
  process.env.GEORGE_URL ?? 'https://george-dev-viandmos-projects.vercel.app'
).replace(/\/$/, '')
const POHYBY_URL = (
  process.env.POHYBY_URL ?? 'https://george-dev-viandmos-projects.vercel.app'
).replace(/\/$/, '')

const GEORGE_HOST = new URL(GEORGE_URL).host
const POHYBY_HOST = new URL(POHYBY_URL).host

const IBAN = 'SK8090000000001234567890'
const AMOUNT = '0.11'

type PaymentFixture = {
  recipient: string
  iban: string
  amount: string
  vs: string
  note: string
  runId: string
}

/** Shared across serial tests — filled in beforeAll so each file run is unique. */
let payment: PaymentFixture

async function disableWebShare(page: Page) {
  await page.addInitScript(() => {
    const nav = navigator as Navigator & {
      canShare?: (d?: ShareData) => boolean
      share?: () => Promise<void>
    }
    nav.canShare = () => false
    nav.share = async () => {
      throw new Error('share disabled in e2e')
    }
    // Assertable sender IBAN in downloaded HTML (PDF binary is opaque).
    ;(window as Window & { __GEORGE_FORCE_HTML_RECEIPT__?: boolean }).__GEORGE_FORCE_HTML_RECEIPT__ =
      true
  })
}

test.describe.serial('Safari prod smoke – platba + pohyby', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    // #pay-note has maxlength=20 on production UI
    const note = `smk ${runId}`.slice(0, 20)
    payment = {
      runId,
      recipient: `SafariSmoke ${runId}`,
      iban: IBAN,
      amount: AMOUNT,
      vs: String(Date.now()).slice(-8),
      note,
    }
  })

  test('george: PIN → platba → PDF/HTML potvrdenie + IBAN + história + DB POST', async ({
    page,
  }) => {
    await disableWebShare(page)

    // Prove we hit production, not localhost
    const gateOrApp = page.waitForResponse(
      (r) =>
        r.url().startsWith(GEORGE_URL) &&
        (r.url().includes('/dashboard2') ||
          r.url().includes('/api/auth/guest') ||
          r.url().includes('/gate')),
      { timeout: 45000 }
    )
    await loginWithPin(page, '666666', { origin: GEORGE_URL })
    const bootRes = await gateOrApp
    expect(bootRes.url()).toContain(GEORGE_HOST)

    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible()
    await expect(page.locator('#payment-history')).toBeVisible({ timeout: 15000 })

    const scrollBefore = await page.evaluate(() => window.scrollY)
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({
      timeout: 15000,
    })
    const panel = page.getByTestId('payment-sheet-panel')
    await expect
      .poll(async () => (await panel.boundingBox())?.y ?? 999, {
        timeout: 5000,
        intervals: [50, 100, 150],
      })
      .toBeLessThan(8)
    const headingBox = await page.getByRole('heading', { name: 'Nová platba' }).boundingBox()
    const vp = page.viewportSize()
    expect(headingBox).toBeTruthy()
    expect(vp).toBeTruthy()
    expect(headingBox!.y).toBeGreaterThanOrEqual(0)
    expect(headingBox!.y).toBeLessThan(vp!.height)
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

    await page.locator('#pay-recipient').fill(payment.recipient)
    await page.locator('#pay-iban').fill(payment.iban)
    await page.locator('#pay-amount').fill(payment.amount)
    await page.locator('#pay-vs').fill(payment.vs)
    await page.locator('#pay-note').fill(payment.note)

    await expect(page.locator('#pay-recipient')).toHaveValue(payment.recipient)
    await expect(page.locator('#pay-iban')).toHaveValue(payment.iban)
    await expect(page.locator('#pay-amount')).toHaveValue(payment.amount)
    await expect(page.locator('#pay-vs')).toHaveValue(payment.vs)
    await expect(page.locator('#pay-note')).toHaveValue(payment.note)

    // Client PDF/HTML download + background Supabase POST — wait for both
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 })
    const persistPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/transactions') &&
        r.request().method() === 'POST' &&
        r.status() < 500,
      { timeout: 45000 }
    )

    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()

    await expect(page.getByTestId('pdf-generate-overlay')).toBeVisible({ timeout: 20000 })

    const [download, persistRes] = await Promise.all([downloadPromise, persistPromise])
    expect(persistRes.ok(), `POST /api/transactions → ${persistRes.status()}`).toBe(true)
    const persistBody = (await persistRes.json().catch(() => null)) as {
      success?: boolean
      transaction?: { id?: string }
    } | null
    expect(persistBody?.success).toBe(true)
    expect(persistBody?.transaction?.id).toBeTruthy()
    const txnId = persistBody!.transaction!.id!

    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^potvrdenie-.*\.(pdf|html)$/i)
    expect(filename).toContain(payment.vs)

    const isPdf = filename.toLowerCase().endsWith('.pdf')
    const tempPath = path.join(
      __dirname,
      '..',
      `tmp-safari-smoke-${payment.runId}.${isPdf ? 'pdf' : 'html'}`
    )
    await download.saveAs(tempPath)
    expect(fs.existsSync(tempPath)).toBe(true)
    const size = fs.statSync(tempPath).size
    expect(size).toBeGreaterThan(500)

    if (isPdf) {
      const magic = fs.readFileSync(tempPath).subarray(0, 4).toString('utf8')
      expect(magic).toBe('%PDF')
    } else {
      const html = fs.readFileSync(tempPath, 'utf8')
      const compact = html.replace(/\s+/g, '')
      expect(html).toMatch(/<!DOCTYPE html>/i)
      expect(html).toMatch(/Výpis z Účtu|Potvrdenie o platbe/i)
      expect(html).toMatch(/Business účet L/i)
      expect(html).toContain(payment.recipient)
      expect(html).toMatch(/0[,.]11/)
      expect(compact).toMatch(/SK8090000000001234567890/i)
      expect(compact).toMatch(/SK310900000000501234567[89]/)
      expect(compact).not.toContain(LEGACY_FAKE_SENDER_IBAN)
      expect(html).toContain(payment.note)
      expect(html).toMatch(/George kľúč|mToken/i)
      expect(html.length).toBeGreaterThan(3000)
    }
    fs.unlinkSync(tempPath)

    // Client receipt is the source of truth for sender IBAN (API confirmation is
    // Drizzle-only and 404s when movements live in Supabase).
    // Unique toast — recipient is unique per run
    await expect(
      page.getByText(new RegExp(`Platba 0[,.]11.*${payment.recipient}|úspešne odoslaná`, 'i')).first()
    ).toBeVisible({ timeout: 15000 })

    const history = page.locator('#payment-history')
    await expect(history.getByText(payment.recipient, { exact: true })).toBeVisible({
      timeout: 15000,
    })
    await expect(history.getByText(/0[,.]11/).first()).toBeVisible()

    await history.getByText(payment.recipient, { exact: true }).click()
    const detail = page.locator('#txn-detail-modal')
    await expect(detail.getByText('Detail prevodu')).toBeVisible()
    await expect(detail.getByText(payment.note)).toBeVisible()
    await expect(detail.getByText(/SK80|1234567890/i)).toBeVisible()
    await expect(detail.getByText(payment.vs)).toBeVisible()

     
    console.log(
      `[safari-smoke] george OK runId=${payment.runId} vs=${payment.vs} bytes=${size} txn=${txnId} pdf=${isPdf}`
    )
  })

  test('pohyby: live list + denný limit obsahuje tú istú platbu', async ({ page }) => {
    const apiPromise = page.waitForResponse(
      (r) =>
        r.url().startsWith(POHYBY_URL) &&
        r.url().includes('/api/transactions') &&
        r.request().method() === 'GET' &&
        r.ok(),
      { timeout: 45000 }
    )

    await gotoAbsolute(page, `${POHYBY_URL}/pohyby`)
    expect(page.url()).toContain(POHYBY_HOST)

    await expect(page.getByRole('heading', { name: 'Pohyby na účte' })).toBeVisible({
      timeout: 20000,
    })
    await expect(page.getByTestId('pohyby-daily-limit')).toBeVisible()
    await expect(page.getByText(/Denný limit platieb/i)).toBeVisible()
    await expect(page.getByText(/zostáva z/i)).toBeVisible()

    const firstApi = await apiPromise
    const firstJson = (await firstApi.json()) as {
      success?: boolean
      transactions?: Array<{ recipient?: string }>
    }
    expect(firstJson.success).toBe(true)

    const list = page.getByTestId('pohyby-list')
    await expect
      .poll(
        async () => {
          await page.getByTestId('pohyby-refresh').click()
          // DB description: "Name (note) IBAN: … VS: …"
          const byRecipient = await list.getByText(payment.recipient).first().isVisible()
          const byVs = await list.getByText(new RegExp(`VS:\\s*${payment.vs}`)).first().isVisible()
          const byNote = await list.getByText(payment.note).first().isVisible()
          return byRecipient && byVs && byNote
        },
        { timeout: 45000, intervals: [1500, 2000, 3000] }
      )
      .toBe(true)

    const row = list.locator('li').filter({ hasText: payment.recipient }).first()
    await expect(row).toBeVisible()
    await expect(row.getByText(new RegExp(`VS:\\s*${payment.vs}`))).toBeVisible()
    await expect(row.getByText(payment.note)).toBeVisible()
    await expect(row.getByText(/−\s*0[,.]11\s*€/)).toBeVisible()

     
    console.log(
      `[safari-smoke] pohyby OK runId=${payment.runId} vs=${payment.vs} row="${(await row.innerText()).replace(/\s+/g, ' ').slice(0, 160)}"`
    )
  })
})
