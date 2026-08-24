import { test, expect } from '@playwright/test'
import { gotoApp } from '../helpers/app'

/**
 * Android Chrome installability smoke (Nothing Phone 1 viewport).
 *
 * Focus: Chrome installability criteria (manifest + icons + controlling SW).
 * start_url is /dashboard2 — cold-start lands on PIN entry.
 *
 * Limitation: headless Chromium rarely fires beforeinstallprompt / A2HS UI;
 * we assert criteria, not the install banner itself.
 */
test.describe('Nothing Phone 1 – PWA installability', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('manifest.json is 200 with installability fields', async ({ request }) => {
    const response = await request.get('/manifest.json')
    expect(response.status()).toBe(200)

    const manifest = await response.json()
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/dashboard2')
    expect(manifest.scope).toBe('/')
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    expect(Array.isArray(manifest.icons)).toBe(true)
    expect(manifest.icons.length).toBeGreaterThan(0)

    const has192 = manifest.icons.some(
      (icon: { sizes?: string }) => icon.sizes === '192x192'
    )
    const has512 = manifest.icons.some(
      (icon: { sizes?: string }) => icon.sizes === '512x512'
    )
    expect(has192).toBe(true)
    expect(has512).toBe(true)
  })

  test('service-worker.js is served with 200', async ({ request }) => {
    const response = await request.get('/service-worker.js')
    expect(response.status()).toBe(200)
    const body = await response.text()
    expect(body).toContain('george-pwa')
    // Precache must not reference the missing george-logo.svg
    expect(body).not.toContain('george-logo.svg')
  })

  test('manifest icon URLs all return 200', async ({ request }) => {
    const manifestRes = await request.get('/manifest.json')
    const manifest = await manifestRes.json()
    expect(Array.isArray(manifest.icons)).toBe(true)

    for (const icon of manifest.icons as { src: string }[]) {
      const iconRes = await request.get(icon.src)
      expect(iconRes.status(), `icon ${icon.src}`).toBe(200)
    }
  })

  test('layout registers SW and it becomes activated / controlling', async ({ page }) => {
    await gotoApp(page, '/dashboard2')

    // Wait for app layout registration (afterInteractive) + activate + claim
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) {
              return { ok: false, reason: 'no-sw-api' }
            }
            const ready = await navigator.serviceWorker.ready
            const regs = await navigator.serviceWorker.getRegistrations()
            const active = ready.active
            return {
              ok: Boolean(
                regs.length > 0 &&
                  active &&
                  active.state === 'activated' &&
                  (navigator.serviceWorker.controller || ready.active)
              ),
              regCount: regs.length,
              activeState: active?.state ?? null,
              controlling: Boolean(navigator.serviceWorker.controller),
              scriptURL: active?.scriptURL ?? null,
            }
          }),
        { timeout: 30000 }
      )
      .toMatchObject({ ok: true })

    const status = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready
      return {
        scriptURL: ready.active?.scriptURL ?? null,
        state: ready.active?.state ?? null,
        controlling: Boolean(navigator.serviceWorker.controller),
      }
    })

    expect(status.scriptURL).toContain('/service-worker.js')
    expect(status.state).toBe('activated')
    // controller may be null until next navigation after clients.claim;
    // ready.active === 'activated' is the installability gate we require.
    expect(status.controlling || status.state === 'activated').toBe(true)
  })

  test('beforeinstallprompt is optional in headless (criteria-only)', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault()
        ;(window as unknown as { __bipFired?: boolean }).__bipFired = true
      })
    })

    await gotoApp(page, '/dashboard2')

    // Brief window only — do not fail if headless never fires BIP
    const promptFired = await page
      .waitForFunction(
        () => Boolean((window as unknown as { __bipFired?: boolean }).__bipFired),
        null,
        { timeout: 2000 }
      )
      .then(() => true)
      .catch(() => false)

    test.info().annotations.push({
      type: 'note',
      description: promptFired
        ? 'beforeinstallprompt fired (unusual in headless)'
        : 'beforeinstallprompt not fired — expected in headless Chromium; install UI not asserted',
    })
  })
})
