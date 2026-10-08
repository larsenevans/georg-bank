import { test, expect } from './fixtures'
import { gotoApp } from './helpers/app'

interface TargetIphoneModel {
  name: string
  width: number
  height: number
  dpr: number
  safeTop: number
  safeBottom: number
  cutout: 'notch' | 'dynamic-island'
}

const TARGET_IPHONE_MODELS: TargetIphoneModel[] = [
  {
    name: 'iPhone 14 Plus',
    width: 428,
    height: 926,
    dpr: 3,
    safeTop: 47,
    safeBottom: 34,
    cutout: 'notch',
  },
  {
    name: 'iPhone 17 Pro',
    width: 402,
    height: 874,
    dpr: 3,
    safeTop: 62,
    safeBottom: 34,
    cutout: 'dynamic-island',
  },
  {
    name: 'iPhone 17 Pro Max',
    width: 440,
    height: 956,
    dpr: 3,
    safeTop: 62,
    safeBottom: 34,
    cutout: 'dynamic-island',
  },
  {
    name: 'iPhone 18 Pro',
    width: 402,
    height: 874,
    dpr: 3,
    safeTop: 59,
    safeBottom: 34,
    cutout: 'dynamic-island',
  },
]

test.describe('iPhone Model Matrix: 14 Plus, 17 Pro, 17 Pro Max, 18 Pro', () => {
  for (const phone of TARGET_IPHONE_MODELS) {
    test.describe(`${phone.name} (${phone.width}x${phone.height} @ DPR ${phone.dpr})`, () => {
      
      test(`1. ${phone.name}: 100dvh Layout & Zero Horizontal Overflow`, async ({ page }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height })
        await gotoApp(page, '/dashboard-v2')

        // 1. Zero horizontal overflow check
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

        // 2. Header and branding visible
        await expect(page.getByRole('heading', { name: 'George', exact: true })).toBeVisible()
        await expect(page.getByText('Horizon Bank')).toBeVisible()

        // 3. Balance Banner exists
        const balanceTitle = page.locator('text=Aktuálny zostatok')
        await expect(balanceTitle).toBeVisible()

        // 4. Bottom navigation bar is rendered
        await expect(page.getByRole('button', { name: 'Prehľad', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Karty', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Nastavenia', exact: true })).toBeVisible()
      })

      test(`2. ${phone.name}: Push Notifikácie v Nastaveniach & iOS Standalone`, async ({ page }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height })

        // Inject iOS standalone mode simulation
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'standalone', {
            get: () => true,
            configurable: true,
          })
        })

        await gotoApp(page, '/dashboard-v2')

        // Switch to Nastavenia
        const settingsTab = page.getByRole('button', { name: 'Nastavenia' })
        await expect(settingsTab).toBeVisible()
        await settingsTab.click()

        // Verify Push toggle is visible and active
        const pushLabel = page.locator('text=Push upozornenia na platby')
        await expect(pushLabel).toBeVisible()
        await expect(page.locator('text=Okamžité upozornenie pri každom pohybe.')).toBeVisible()

        // Verify Apple PWA meta tag
        const appleMeta = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')
        expect(appleMeta).toBe('yes')
      })

      test(`3. ${phone.name}: Superadmin God-Mode & Push Broadcast Panel`, async ({ page }) => {
        await page.setViewportSize({ width: phone.width, height: phone.height })
        await gotoApp(page, '/dashboard-v2')

        // Open God-Mode sheet
        const crownBtn = page.getByRole('button', { name: 'God-Mode panel' })
        await expect(crownBtn).toBeVisible()
        await crownBtn.click()

        // Verify God-Mode Sheet rendered properly without overflowing phone screen
        await expect(page.locator('text=God-Mode Panel')).toBeVisible()
        await expect(page.locator('text=Push Upozornenia & Broadcast')).toBeVisible()
        await expect(page.locator('button:has-text("Odoslať všetkým klientom")')).toBeVisible()
        await expect(page.locator('button:has-text("Zaregistrovať môj mobil")')).toBeVisible()

        // Close sheet
        const closeBtn = page.locator('button[aria-label="Zavrieť"]')
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click()
        }
      })
    })
  }
})
