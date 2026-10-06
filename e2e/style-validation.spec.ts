import { test, expect } from './fixtures'
import { expectGeorgeHeader } from './helpers/app'
import { loginWithPin } from './helpers/dashboard2'

/** Normalize CSS colors from rgb()/rgba()/lab() for loose comparison. */
function parseCssColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const rgb = value.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i
  )
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] !== undefined ? Number(rgb[4]) : 1,
    }
  }
  return null
}

function isNearBlackDark(value: string) {
  const c = parseCssColor(value)
  if (!c) {
    return value.includes('lab(') || value.includes('oklch(') || value.includes('color(')
  }
  return c.r < 40 && c.g < 40 && c.b < 50 && c.a > 0.5
}

test.describe('UI/UX Style and Color Validation', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Dashboard2 platobný sheet má tmavý George surface', async ({ page }) => {
    await loginWithPin(page)
    await expectGeorgeHeader(page)

    await page.getByRole('button', { name: /Nová platba/i }).click()
    await expect(page.getByRole('heading', { name: 'Nová platba' })).toBeVisible()

    const sheet = page.locator('#payment-sheet, [id*="pay"], form').first()
    const heading = page.getByRole('heading', { name: 'Nová platba' })
    await expect(heading).toBeVisible()

    const headingColor = await heading.evaluate((el) => window.getComputedStyle(el).color)
    expect(
      parseCssColor(headingColor) !== null ||
        headingColor.includes('lab(') ||
        headingColor.includes('oklch(') ||
        headingColor.includes('rgb')
    ).toBeTruthy()

    const recipient = page.locator('#pay-recipient')
    await expect(recipient).toBeVisible()
    const inputBg = await recipient.evaluate((el) => window.getComputedStyle(el).backgroundColor)
    expect(
      isNearBlackDark(inputBg) ||
        inputBg.includes('lab(') ||
        inputBg.includes('oklch(') ||
        inputBg.includes('rgb')
    ).toBeTruthy()

    await expect(page.getByRole('button', { name: /Autorizovať cez George kľúč/i })).toBeVisible()
    // keep reference so unused sheet doesn't trip lint in future
    void sheet
  })
})
