import { expect, type Page } from '@playwright/test'
import { gotoApp, E2E_APP_PIN } from './app'

type Dashboard2Options = {
  /** Absolute origin (e.g. https://george-….vercel.app) or omit for baseURL. */
  origin?: string
}

/** PIN-only screen: no email/password login or password fallback. */
export async function expectPinOnlyScreen(page: Page) {
  await expect(page.getByText(/Zadajte bezpečnostný PIN/i)).toBeVisible()
  await expect(page.getByText(/Použiť heslo/i)).toHaveCount(0)
  await expect(page.locator('input[type="email"]')).toHaveCount(0)
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
}

/**
 * Open dashboard2. App lands on the PIN/George kľúč screen first
 * (isPasscodeScreen defaults to true). Site gate + guest handled by gotoApp.
 */
export async function openDashboard2Welcome(page: Page, options?: Dashboard2Options) {
  const path = options?.origin ? `${options.origin.replace(/\/$/, '')}/dashboard2` : '/dashboard2'
  await gotoApp(page, path)
  await expectPinOnlyScreen(page)
}

export async function openPinScreen(page: Page, options?: Dashboard2Options) {
  await openDashboard2Welcome(page, options)
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible({ timeout: 10000 })
  // Face ID overlay must NOT auto-open
  await expect(page.locator('.face-id-backdrop')).toHaveCount(0)
}

export async function enterPin(page: Page, pin: string) {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
}

/** PIN login into Prehľad (no welcome CTA click — PIN is the entry screen). */
export async function loginWithPin(page: Page, pin = E2E_APP_PIN, options?: Dashboard2Options) {
  await openPinScreen(page, options)
  await enterPin(page, pin)
  await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({
    timeout: 15000,
  })
}

/**
 * Mock face-api (+ optional camera deny) before navigation.
 * Injects window.faceapi via addInitScript so initFaceApi never hits CDN in CI.
 */
export async function installFaceIdMocks(
  page: Page,
  options?: { detectFace?: boolean; camera?: 'fake' | 'deny' | 'none' }
) {
  const detectFace = options?.detectFace !== false
  const camera = options?.camera ?? 'fake'

  await page.addInitScript((detect: boolean) => {
    const net = {
      isLoaded: false,
      loadFromUri: function loadFromUri() {
        net.isLoaded = true
        return Promise.resolve()
      },
    }
    ;(window as unknown as { faceapi: unknown }).faceapi = {
      tf: {
        setBackend: function setBackend() {
          return Promise.resolve()
        },
        ready: function ready() {
          return Promise.resolve()
        },
      },
      nets: { tinyFaceDetector: net },
      TinyFaceDetectorOptions: function TinyFaceDetectorOptions() {},
      detectSingleFace: function detectSingleFace() {
        return Promise.resolve(
          detect ? { score: 0.95, box: { x: 0, y: 0, width: 100, height: 100 } } : undefined
        )
      },
    }
  }, detectFace)

  if (camera === 'deny') {
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) return
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }
    })
  }
  // camera === 'fake': use Chromium --use-fake-device-for-media-stream from test.use
}
