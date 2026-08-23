import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers/app'

test.describe('PWA Funkcionalita - 20x Komplexné Testy', () => {

  // --- 1. SERVICE WORKER ---
  test('1. Service Worker sa úspešne zaregistruje a aktivuje', async ({ page }) => {
    await gotoApp(page, '/sign-in')

    // Prefer layout registration; fall back to explicit register for isolation
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return false
            try {
              const regs = await navigator.serviceWorker.getRegistrations()
              if (regs.length === 0) {
                await navigator.serviceWorker.register('/service-worker.js')
              }
              const ready = await navigator.serviceWorker.ready
              return ready.active?.state === 'activated'
            } catch {
              return false
            }
          }),
        { timeout: 30000 }
      )
      .toBe(true)
  })

  // --- MANIFEST.JSON TESTY ---
  test('2. manifest.json je dostupný a vracia 200 OK', async ({ request }) => {
    const response = await request.get('/manifest.json')
    expect(response.ok()).toBeTruthy()
  })

  test('3. manifest.json je platný JSON', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json).toBeDefined()
  })

  test('4. manifest.json obsahuje správne name', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.name).toBe('George – Slovenská sporiteľňa')
  })

  test('5. manifest.json obsahuje short_name', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.short_name).toBe('George')
  })

  test('6. manifest.json obsahuje start_url', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.start_url).toBe('/sign-in')
  })

  test('7. manifest.json definuje display ako standalone', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.display).toBe('standalone')
  })

  test('8. manifest.json obsahuje theme_color', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.theme_color).toMatch(/^#([0-9a-fA-F]{3}){1,2}$/) // Hex color
  })

  test('9. manifest.json obsahuje background_color', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(json.background_color).toMatch(/^#([0-9a-fA-F]{3}){1,2}$/)
  })

  test('10. manifest.json obsahuje array ikoniek', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    expect(Array.isArray(json.icons)).toBe(true)
    expect(json.icons.length).toBeGreaterThan(0)
  })

  test('11. manifest.json obsahuje ikonu veľkosti 192x192', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    const has192 = json.icons.some((i: { sizes?: string }) => i.sizes === '192x192')
    expect(has192).toBe(true)
  })

  test('12. manifest.json obsahuje ikonu veľkosti 512x512', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    const has512 = json.icons.some((i: { sizes?: string }) => i.sizes === '512x512')
    expect(has512).toBe(true)
  })

  test('13. manifest.json obsahuje ikonu s účelom maskable', async ({ request }) => {
    const response = await request.get('/manifest.json')
    const json = await response.json()
    const hasMaskable = json.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')
    expect(hasMaskable).toBe(true)
  })

  // --- META TAGY V HTML ---
  test('14. HTML obsahuje tag link rel="manifest"', async ({ page }) => {
    await gotoApp(page, '/sign-in')
    const manifestLink = await page.getAttribute('link[rel="manifest"]', 'href')
    expect(manifestLink).toContain('manifest.json')
  })

  test('15. HTML obsahuje meta tag theme-color', async ({ page }) => {
    await gotoApp(page, '/sign-in')
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content')
    expect(themeColor).not.toBeNull()
  })

  test('16. HTML obsahuje meta tag pre apple-mobile-web-app-capable', async ({ page }) => {
    await gotoApp(page, '/sign-in')
    const appleCapable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')
    expect(appleCapable).toBe('yes')
  })

  // --- SÚBORY A ASSETY ---
  test('17. apple-touch-icon.png je dostupný (iOS)', async ({ request }) => {
    const response = await request.get('/apple-touch-icon.png')
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('image/png')
  })

  test('18. favicon.ico je dostupný', async ({ request }) => {
    const response = await request.get('/favicon.ico')
    expect(response.ok()).toBeTruthy()
  })

  // --- OFFLINE FUNKCIONALITA ---
  test('19. Offline stránka sa načíta a má správny nadpis', async ({ page, context }) => {
    await page.goto('/offline.html')
    await context.setOffline(true)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.locator('h1')).toHaveText('Ste offline')
  })

  test('20. Offline stránka obsahuje tlačidlo Skúsiť znova', async ({ page, context }) => {
    await page.goto('/offline.html')
    await context.setOffline(true)
    const refreshBtn = page.locator('button')
    await expect(refreshBtn).toBeVisible()
    await expect(refreshBtn).toContainText('Skúsiť znova')
  })
})
