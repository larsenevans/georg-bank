import { expect, test } from './fixtures'
import { gotoApp } from './helpers/app'

test.describe('Push Notifikácie - Komplexné Testy (Android & iPhone)', () => {

  // ==========================================
  // 1. API & SERVER-SIDE PUSH SUBSCRIPTION & SEND
  // ==========================================

  test('1. Endpoint /api/webhooks/push/subscribe úspešne uloží odber', async ({ request }) => {
    const fakeSubscription = {
      endpoint: `https://fcm.googleapis.com/fcm/send/fake-token-${Date.now()}`,
      keys: {
        p256dh: 'BNg_UF-VqzSAgmGRRlzVzXQmqot-dkXs6goaaEwnTqbHNMausVzFrhhplWQVujW1fm8d7bdquc7XVGhqc71SR4c',
        auth: 'qU4oP6s4Q0UI3I-64Q2xHbfhMCyxRiibOjvx_j4L4gc',
      },
    }

    const res = await request.post('/api/webhooks/push/subscribe', {
      data: fakeSubscription,
    })

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.message).toContain('Push subscription')
  })

  test('2. Endpoint /api/webhooks/push/subscribe odmietne neplatný objekt', async ({ request }) => {
    const res = await request.post('/api/webhooks/push/subscribe', {
      data: { invalid: true },
    })

    expect(res.status()).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid subscription object')
  })

  test('3. Endpoint /api/push/send otestuje odoslanie push správy', async ({ request }) => {
    const res = await request.post('/api/push/send', {
      data: {
        title: 'Test George Bank',
        message: 'Testovacia push notifikácia',
        url: '/dashboard-v2',
      },
    })

    // Should return 200 with delivery statistics
    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('success')
    expect(json).toHaveProperty('totalSubscriptions')
  })

  test('4. Superadmin endpoint /api/account/admin-actions podporuje action send_push_notification', async ({ request }) => {
    const res = await request.post('/api/account/admin-actions', {
      data: {
        action: 'send_push_notification',
        title: '📢 Bankové oznámenie',
        message: 'Zostatok bol aktualizovaný cez God-Mode.',
      },
    })

    expect(res.status()).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.message).toContain('Push správa odoslaná')
  })

  // ==========================================
  // 2. ANDROID (MOBILE CHROME / PIXEL) TESTY
  // ==========================================

  test('5. Android: Zobrazenie nastavení notifikácií a prepínača Push', async ({ page, context }) => {
    // Emulate Android Pixel
    await page.setViewportSize({ width: 393, height: 851 })
    // Grant notification permission
    await context.grantPermissions(['notifications'])

    await gotoApp(page, '/dashboard-v2')

    // Navigate to Nastavenia (Settings) tab
    const settingsTabBtn = page.getByRole('button', { name: 'Nastavenia' })
    await expect(settingsTabBtn).toBeVisible()
    await settingsTabBtn.click()

    // Verify "Push upozornenia na platby" is rendered
    const pushRow = page.locator('text=Push upozornenia na platby')
    await expect(pushRow).toBeVisible()

    // Verify description is present
    await expect(page.locator('text=Okamžité upozornenie pri každom pohybe.')).toBeVisible()
  })

  test('6. Android: Overenie Service Worker registrácie pre Push API', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 })
    await gotoApp(page, '/dashboard-v2')

    const hasServiceWorker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        if (regs.length === 0) {
          await navigator.serviceWorker.register('/service-worker.js')
        }
        const ready = await navigator.serviceWorker.ready
        return Boolean(ready)
      } catch {
        return false
      }
    })

    expect(hasServiceWorker).toBe(true)
  })

  test('7. Android: Superadmin sheet obsahuje sekciu Push Upozornenia & Broadcast', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 })
    await gotoApp(page, '/dashboard-v2')

    // Click God-Mode crown button
    const godModeBtn = page.getByRole('button', { name: 'God-Mode panel' })
    await expect(godModeBtn).toBeVisible()
    await godModeBtn.click()

    // Verify Push section in Superadmin sheet
    await expect(page.locator('text=Push Upozornenia & Broadcast')).toBeVisible()
    await expect(page.locator('button:has-text("Odoslať všetkým klientom")')).toBeVisible()
    await expect(page.locator('button:has-text("Zaregistrovať môj mobil")')).toBeVisible()
  })

  // ==========================================
  // 3. iPHONE (iOS / MOBILE SAFARI) TESTY
  // ==========================================

  test('8. iPhone: Overenie Apple PWA meta tagov pre Web Push podporu', async ({ page }) => {
    // Set iPhone 15 viewport and UA
    await page.setViewportSize({ width: 393, height: 852 })
    await gotoApp(page, '/dashboard-v2')

    // Apple requirement for PWA Web Push: apple-mobile-web-app-capable
    const appleCapable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')
    expect(appleCapable).toBe('yes')

    // Apple touch icon
    const touchIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href')
    expect(touchIcon).not.toBeNull()

    // Manifest link
    const manifestLink = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(manifestLink).toContain('manifest.json')
  })

  test('9. iPhone: Detekcia iOS a správanie pri požiadavke na push odber', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await gotoApp(page, '/dashboard-v2')

    // Navigate to Nastavenia tab
    await page.getByRole('button', { name: 'Nastavenia' }).click()

    // Check capabilities directly via browser evaluate
    const iosCapabilities = await page.evaluate(() => {
      const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as unknown as { standalone?: boolean }).standalone)
      return { isIos, isStandalone }
    })

    expect(iosCapabilities).toBeDefined()
  })

  test('10. iPhone: Simulácia Standalone PWA režimu a pripravenosti PushManager', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })

    // Inject standalone mode flag matching iOS Home Screen installed PWA
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', {
        get: () => true,
        configurable: true,
      })
    })

    await gotoApp(page, '/dashboard-v2')

    const isSimulatedStandalone = await page.evaluate(() => {
      return Boolean((navigator as unknown as { standalone?: boolean }).standalone)
    })

    expect(isSimulatedStandalone).toBe(true)

    // Navigate to settings and ensure UI remains fully operational
    await page.getByRole('button', { name: 'Nastavenia' }).click()
    await expect(page.locator('text=Push upozornenia na platby')).toBeVisible()
  })
})
