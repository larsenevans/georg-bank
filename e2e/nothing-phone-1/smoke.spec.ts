import { test, expect } from '../fixtures'
import { loginWithPin } from '../helpers/dashboard2'
import {
  expectNoHorizontalOverflow,
  expectTapTargetMinSize,
  expectViewportMeta,
} from '../helpers/iphone-mobile'
import { NOTHING_PHONE_1_VIEWPORT } from '../devices/nothing-phone-1'

/**
 * Rýchly smoke pre Nothing Phone (1) viewport (Android Chromium emulation).
 */
test.describe('Nothing Phone 1 – smoke', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('viewport matches Nothing Phone 1 CSS size', async ({ page }) => {
    const vp = page.viewportSize()
    expect(vp?.width).toBe(NOTHING_PHONE_1_VIEWPORT.width)
    expect(vp?.height).toBe(NOTHING_PHONE_1_VIEWPORT.height)
  })

  test('legacy /dashboard redirects to /dashboard2', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard2/, { timeout: 20000 })
    await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible({ timeout: 20000 })
  })

  test('dashboard2 PIN → Prehľad full-bleed, no nested phone chrome', async ({ page }) => {
    await loginWithPin(page, '661723')

    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible()
    await expectViewportMeta(page)
    await expectNoHorizontalOverflow(page)

    // Native shell: no outer Menu / Domov desktop chrome on mobile
    await expect(page.getByRole('button', { name: /^Menu$/i })).toHaveCount(0)
    await expect(page.locator('.d2-desktop-chrome').first()).toBeHidden()
    await expect(page.getByText('Domov', { exact: true })).toBeHidden()

    const shell = page.locator('.d2-phone-shell')
    await expect(shell).toBeVisible()
    const box = await shell.boundingBox()
    const vp = page.viewportSize()
    expect(box).toBeTruthy()
    expect(vp).toBeTruthy()
    if (box && vp) {
      expect(box.width).toBeGreaterThanOrEqual(vp.width - 2)
      expect(box.x).toBeLessThanOrEqual(1)
      // No letterboxed phone frame shorter than the viewport
      expect(box.height).toBeGreaterThanOrEqual(vp.height - 4)
    }

    await expect(page.getByRole('button', { name: /Nová platba/i })).toBeVisible()
    await expectTapTargetMinSize(page.getByRole('button', { name: /Nová platba/i }), 44)
    await expect(page.locator('#payment-history')).toBeVisible()
  })

  test('Nová platba sheet opens in visible viewport (no long scroll)', async ({ page }) => {
    await loginWithPin(page, '661723')

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible({
      timeout: 10000,
    })
    // Wait for slide-up to settle
    await expect
      .poll(async () => {
        const b = await page.getByRole('heading', { name: 'Nová platba' }).boundingBox()
        return b?.y ?? 9999
      })
      .toBeLessThan(700)

    const recipient = page.locator('#pay-recipient')
    await expect(recipient).toBeVisible()
    const box = await recipient.boundingBox()
    const headingBox = await page.getByRole('heading', { name: 'Nová platba' }).boundingBox()
    const vp = page.viewportSize()
    expect(box).toBeTruthy()
    expect(headingBox).toBeTruthy()
    expect(vp).toBeTruthy()
    if (box && headingBox && vp) {
      expect(box.width).toBeLessThanOrEqual(vp.width + 1)
      expect(box.x).toBeGreaterThanOrEqual(-1)
      expect(headingBox.y).toBeGreaterThanOrEqual(0)
      expect(headingBox.y).toBeLessThan(vp.height * 0.75)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeLessThan(vp.height)
    }
    const position = await page.locator('#payment-sheet').evaluate((el) => getComputedStyle(el).position)
    expect(position).toBe('fixed')
    const sheetTop = await page.locator('#payment-sheet').evaluate((el) => el.getBoundingClientRect().y)
    expect(sheetTop).toBeLessThanOrEqual(2)
    await expectNoHorizontalOverflow(page)
  })
})
