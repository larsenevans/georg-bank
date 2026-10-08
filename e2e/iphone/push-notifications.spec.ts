import { test, expect } from '../fixtures'
import { gotoApp } from '../helpers/app'

test.describe('iPhone Push Notifikácie & iOS PWA Kompatibilita', () => {

  test('iPhone: PWA Web Push štandardy (Apple meta tagy, ikona, manifest)', async ({ page }) => {
    await gotoApp(page, '/dashboard-v2')

    // 1. Apple web app capable
    const appleCapable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')
    expect(appleCapable).toBe('yes')

    // 2. Apple touch icon
    const touchIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href')
    expect(touchIcon).not.toBeNull()

    // 3. Manifest link
    const manifestLink = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(manifestLink).toContain('manifest.json')
  })

  test('iPhone: Nastavenia Push notifikácií a interakcia v rozhraní', async ({ page }) => {
    await gotoApp(page, '/dashboard-v2')

    // Click on Nastavenia
    const settingsBtn = page.getByRole('button', { name: 'Nastavenia' })
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()

    // Verify Push toggle is visible
    const pushRow = page.locator('text=Push upozornenia na platby')
    await expect(pushRow).toBeVisible()
    await expect(page.locator('text=Okamžité upozornenie pri každom pohybe.')).toBeVisible()
  })

  test('iPhone: Standalone PWA režim a pripravenosť push manažéra', async ({ page }) => {
    // Inject iOS standalone flag (installed on iPhone Home Screen)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', {
        get: () => true,
        configurable: true,
      })
    })

    await gotoApp(page, '/dashboard-v2')

    const isStandalone = await page.evaluate(() => {
      return Boolean((navigator as unknown as { standalone?: boolean }).standalone)
    })
    expect(isStandalone).toBe(true)

    // Open God-Mode and check Push broadcast section
    const godModeBtn = page.getByRole('button', { name: 'God-Mode panel' })
    await expect(godModeBtn).toBeVisible()
    await godModeBtn.click()

    await expect(page.locator('text=Push Upozornenia & Broadcast')).toBeVisible()
    await expect(page.locator('button:has-text("Odoslať všetkým klientom")')).toBeVisible()
  })
})
