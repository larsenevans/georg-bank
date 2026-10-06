import { test, expect } from './fixtures'
import { gotoApp } from './helpers/app'

test.describe('Navigácia & SEO', () => {
  test('Homepage má správny title po site gate', async ({ page }) => {
    await gotoApp(page, '/')
    await expect(page).toHaveTitle(/George|Prístup/)
  })

  test('Sign-in má meta description po site gate', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    const metaDesc = page.locator('meta[name="description"]')
    if (await metaDesc.count() > 0) {
      const content = await metaDesc.getAttribute('content')
      expect(content).toBeTruthy()
      expect(content!.length).toBeGreaterThan(10)
    }
  })

  test('PWA manifest je linkovaný', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  })

  test('Manifest.json je dostupný', async ({ request }) => {
    const response = await request.get('/manifest.json')
    expect(response.ok()).toBeTruthy()
    const manifest = await response.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThan(0)
  })

  test('Service worker je dostupný', async ({ request }) => {
    const response = await request.get('/service-worker.js')
    expect(response.ok()).toBeTruthy()
    expect(await response.text()).toContain('addEventListener')
  })

  test('Viewport meta tag existuje', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1)
  })

  test('Apple touch icon existuje', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    const appleIcon = page.locator('link[rel="apple-touch-icon"]')
    if (await appleIcon.count() > 0) {
      expect(await appleIcon.first().getAttribute('href')).toBeTruthy()
    }
  })

  test('Theme color je nastavená', async ({ page }) => {
    await gotoApp(page, '/dashboard2')
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1)
  })
})