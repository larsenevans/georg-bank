import { test, expect } from '@playwright/test'
import { loginWithPinLight } from './helpers/dashboard2'

function rgbIsLight(rgb: string) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return false
  const r = Number(match[1])
  const g = Number(match[2])
  const b = Number(match[3])
  return (r + g + b) / 3 > 200
}

test.describe('dashboard3 – platobný sheet', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Nová platba sheet je hneď vo viewporte (100dvh, bez scrollu)', async ({ page }) => {
    await loginWithPinLight(page)
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

  test('inputy platby majú svetlý podklad', async ({ page }) => {
    await loginWithPinLight(page)
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.locator('#pay-recipient')).toBeVisible({ timeout: 10000 })

    const bg = await page.locator('#pay-recipient').evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor
    })
    expect(rgbIsLight(bg), `expected light input bg, got ${bg}`).toBe(true)
  })

  test('prázdny formulár nespustí download', async ({ page }) => {
    await page.addInitScript(() => {
      const nav = navigator as Navigator & { canShare?: () => boolean }
      nav.canShare = () => false
    })

    await loginWithPinLight(page)
    await page.getByRole('button', { name: /Nová platba/i }).click()
    await page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).click()
    await expect(page.getByText(/vyplňte správne|Prosím/i).first()).toBeVisible({ timeout: 10000 })
  })
})
