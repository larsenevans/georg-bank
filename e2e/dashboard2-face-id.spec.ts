import { test, expect } from '@playwright/test'
import {
  enterPin,
  expectPinOnlyScreen,
  installFaceIdMocks,
  openDashboard2Welcome,
  openPinScreen,
} from './helpers/dashboard2'
import { E2E_APP_PIN } from './helpers/app'

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
  permissions: ['camera'],
})

/**
 * Tests for agent work on /dashboard2:
 * - welcome layout + product cards
 * - PIN login (no success toast)
 * - Face ID only via keypad icon (not auto on Prihlásiť sa)
 * - face-api models + mocked detection loop
 * - proxy-era static assets still served
 */
test.describe('dashboard2 – Face ID + PIN (agent delivery)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('models: tiny face detector weights are publicly served', async ({ request }) => {
    const manifest = await request.get('/models/tiny_face_detector_model-weights_manifest.json')
    const text = await manifest.text()
    expect(manifest.status(), text.slice(0, 120)).toBe(200)
    expect(text.trim().startsWith('<')).toBe(false)
    const json = JSON.parse(text)
    expect(Array.isArray(json) || typeof json === 'object').toBeTruthy()

    const shard = await request.get('/models/tiny_face_detector_model-shard1')
    expect(shard.status()).toBe(200)
    const buf = await shard.body()
    expect(buf.byteLength).toBeGreaterThan(10_000)
  })

  test('lands on PIN; Späť shows welcome hero, login CTA and product cards', async ({ page }) => {
    await openDashboard2Welcome(page)

    // PIN-first entry (isPasscodeScreen defaults to true — no welcome CTA click needed)
    await expect(page.getByTestId('pin-screen')).toBeVisible()
    await expectPinOnlyScreen(page)
    await expect(page.getByRole('button', { name: 'Prihlásiť sa tvárou' })).toBeVisible()
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()

    // Späť (aria-label) → welcome screen is still reachable under PIN
    await page.getByRole('button', { name: 'Späť' }).click()
    await expect(page.getByTestId('pin-screen')).toHaveCount(0)

    const welcome = page.locator('.welcome-screen')
    await expect(welcome.getByRole('heading', { name: /Ahoj, som George/i })).toBeVisible()
    await expect(welcome.getByRole('button', { name: /^Prihlásiť sa/i })).toBeVisible()
    await expect(welcome.getByText('Zabudnuté prihlasovacie údaje')).toBeVisible()

    // Product cards sit below the fold in the phone frame — scroll before assert
    const products = welcome.locator('.welcome-products')
    await products.scrollIntoViewIfNeeded()
    await expect(products.getByText('Chcem sa stať klientom')).toBeVisible()
    await expect(products.getByText('Osobný účet')).toBeVisible()
    await expect(products.getByText('Podnikateľský účet')).toBeVisible()
    await expect(products.getByText('Investovanie')).toBeVisible()

    // Welcome CTA returns to PIN without auto-starting Face ID
    await welcome.getByRole('button', { name: /^Prihlásiť sa/i }).click()
    await expect(page.getByTestId('pin-screen')).toBeVisible()
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)

    // No fake iOS status bar (time / 5G) in app chrome
    await expect(page.getByText('5G')).toHaveCount(0)
  })

  test('PIN screen does not auto-start Face ID', async ({ page }) => {
    await openPinScreen(page)

    await expect(page.getByText(/George kľúč|bezpečnostný PIN|Zadajte/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prihlásiť sa tvárou' })).toBeVisible()
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
    await expect(page.locator('#face-api-script')).toHaveCount(0)
  })

  test('PIN unlock logs in without success toast', async ({ page }) => {
    await openPinScreen(page)
    await enterPin(page, E2E_APP_PIN)

    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({ timeout: 15000 })

    // Toast elements should not show login success message
    const toast = page.locator('#toast-welcome, #toast')
    await page.waitForTimeout(500)
    const visibleWithSuccess = await toast.evaluateAll((els) =>
      els.some((el) => {
        const style = getComputedStyle(el)
        const text = (el.textContent || '').toLowerCase()
        const shown = style.opacity !== '0' && style.visibility !== 'hidden'
        return shown && text.includes('úspešne prihlásený')
      })
    )
    expect(visibleWithSuccess).toBe(false)
  })

  test('wrong PIN shows error and stays on keypad', async ({ page }) => {
    await openPinScreen(page)
    await enterPin(page, '000000')

    await expect(page.getByText(/Nesprávny PIN/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toHaveCount(0)
  })
  test('Face ID button opens overlay; Zrušiť closes it', async ({ page }) => {
    await installFaceIdMocks(page, { detectFace: false })
    await openPinScreen(page)

    await page.getByRole('button', { name: 'Prihlásiť sa tvárou' }).click()
    await expect(page.locator('.face-id-backdrop')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.face-id-label')).toBeVisible()

    await page.getByRole('button', { name: 'Zrušiť' }).click()
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
    // Still on PIN screen
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()
  })

  test('Face ID with mocked face detection logs user in', async ({ page }) => {
    await installFaceIdMocks(page, { detectFace: true })
    await openPinScreen(page)

    await page.getByRole('button', { name: 'Prihlásiť sa tvárou' }).click()
    await expect(page.locator('.face-id-backdrop')).toBeVisible({ timeout: 15000 })

    // Detection loop: 3 hits × 300ms + success delay ~900ms
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
  })

  test('camera permission denied falls back with message', async ({ page }) => {
    await installFaceIdMocks(page, { detectFace: true, camera: 'deny' })
    await openPinScreen(page)

    await page.getByRole('button', { name: 'Prihlásiť sa tvárou' }).click()

    // Toast about camera / PIN fallback (may appear briefly)
    await expect(
      page.getByText(/Webkamera|kamery|PIN kód|zamietnut/i).first()
    ).toBeVisible({ timeout: 15000 })

    // Overlay should close after cancelBiometrics; keypad still usable
    await expect(page.locator('.face-id-backdrop')).toHaveCount(0, { timeout: 10000 })
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible({ timeout: 10000 })
  })
})
