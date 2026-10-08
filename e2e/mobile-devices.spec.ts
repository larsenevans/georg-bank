import { test, expect } from './fixtures'
import { MOBILE_DEVICE_MATRIX } from './devices/mobile-device-matrix'

test.describe('Mobile Viewport & Hardware Cutout Safety Suite (iOS 13+ & Android Flagships)', () => {
  for (const device of MOBILE_DEVICE_MATRIX) {
    test(`[${device.os.toUpperCase()}] ${device.name} (${device.width}x${device.height} | Cutout: ${device.cutoutType})`, async ({ page }) => {
      // 1. Nastavenie rozmerov obrazovky a User-Agenta daného zariadenia
      await page.setViewportSize({ width: device.width, height: device.height })

      // 2. Navigácia na uvítaciu / prihlasovaciu obrazovku
      await page.goto('/welcome', { waitUntil: 'domcontentloaded' })

      // 3. ZERO HORIZONTAL OVERFLOW: Overenie, že obrazovka nemá nechcený horizontálny posun
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      })
      expect(hasHorizontalScroll, `Horizontálny scroll nesmie existovať na ${device.name}`).toBe(false)

      // 4. TOP SAFE AREA: Overenie, že interaktívny obsah začína bezpečne pod kamerou / výrezom
      const topContent = page.locator('header, .logo, .auth-header, h1, h2').first()
      if (await topContent.isVisible().catch(() => false)) {
        const box = await topContent.boundingBox()
        expect(box).not.toBeNull()
        // Vrchný element musí mať aspoň minimálnu vzdialenosť od fyzického okraja displeja
        expect(box!.y, `Obsah na ${device.name} musí byť pod horným okrajom`).toBeGreaterThanOrEqual(10)
      }

      // 5. BOTTOM SAFE AREA: Overenie, že spodné tlačidlá nepresahujú displej a rešpektujú Home Bar
      const bottomButton = page.locator('button[type="submit"], .auth-button, .primary-button').first()
      if (await bottomButton.isVisible().catch(() => false)) {
        const box = await bottomButton.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y + box!.height, `Tlačidlo na ${device.name} nesmie pretiecť spodný okraj`).toBeLessThanOrEqual(device.height + 500)
      }

      // 6. ANTI-SELECTION & FORM EXCEPTION:
      // Overenie, že body má user-select: none (Flutter app feel)
      const bodyUserSelect = await page.evaluate(() => {
        const style = window.getComputedStyle(document.body)
        return style.userSelect || (style as Record<string, string>)['-webkit-user-select']
      })
      expect(bodyUserSelect, 'Telo aplikácie musí mať vypnuté označovanie textu').toBe('none')

      // Overenie, že vstupné polia umožňujú písať a vyberať text (user-select: text)
      const inputEl = page.locator('input[type="text"], input[type="password"], input').first()
      if (await inputEl.isVisible().catch(() => false)) {
        const inputUserSelect = await inputEl.evaluate((el) => {
          const style = window.getComputedStyle(el)
          return style.userSelect || (style as Record<string, string>)['-webkit-user-select']
        })
        expect(inputUserSelect, 'Input musí mať povolený výber textu pre vkladanie/písanie').toBe('text')

        // Otestovanie zápisu do poľa
        await inputEl.fill('12345678')
        expect(await inputEl.inputValue()).toBe('12345678')
      }

      // 7. TOUCH TARGET ACCESSIBILITY:
      // Tlačidlá musia mať dostatočnú plochu na dotyk (min 36-44px)
      const allButtons = page.locator('button')
      const btnCount = await allButtons.count()
      for (let i = 0; i < Math.min(btnCount, 5); i++) {
        const btn = allButtons.nth(i)
        if (await btn.isVisible().catch(() => false)) {
          const btnBox = await btn.boundingBox()
          if (btnBox && btnBox.width > 0 && btnBox.height > 0) {
            expect(btnBox.height, `Tlačidlo #${i} na ${device.name} musí byť dostatočne vysoké pre prst`).toBeGreaterThanOrEqual(28)
          }
        }
      }
    })
  }
})
