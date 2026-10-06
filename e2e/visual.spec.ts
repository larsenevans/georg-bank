import { test, expect } from './fixtures'
import { gotoApp } from './helpers/app'

test.describe('Vizuálna integrita', () => {
  test('Sign-in stránka sa renderuje bez JS chýb', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await gotoApp(page, '/dashboard2')
    await page.waitForLoadState('networkidle')

    // Žiadne JS errory na stránke
    expect(errors).toHaveLength(0)
  })

  test('Favicon je dostupný', async ({ request }) => {
    const response = await request.get('/favicon.ico')
    expect(response.ok()).toBeTruthy()
  })

  test('Slovenská sporiteľňa logo je dostupné', async ({ request }) => {
    const response = await request.get('/assets/slvnsk.png')
    expect(response.ok()).toBeTruthy()
  })

  test('Android Chrome icon 192x192 je dostupný', async ({ request }) => {
    const response = await request.get('/android-chrome-192x192.png')
    expect(response.ok()).toBeTruthy()
  })

  test('Android Chrome icon 512x512 je dostupný', async ({ request }) => {
    const response = await request.get('/android-chrome-512x512.png')
    expect(response.ok()).toBeTruthy()
  })

  test('Apple Touch Icon je dostupný', async ({ request }) => {
    const response = await request.get('/apple-touch-icon.png')
    expect(response.ok()).toBeTruthy()
  })

  test('Offline HTML fallback je dostupný', async ({ request }) => {
    const response = await request.get('/offline.html')
    expect(response.ok()).toBeTruthy()
    const html = await response.text()
    expect(html).toContain('<!DOCTYPE html>')
  })
})
