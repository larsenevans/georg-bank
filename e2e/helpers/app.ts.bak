import { expect, type Page } from '@playwright/test'

export const SITE_GATE_PASSWORD = process.env.SITE_GATE_PASSWORD ?? 'heslo'
export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? 'anton-karton-007@proton.me'
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'admin@admin.com'

export const SWAPPED_CARD_ENDINGS = ['1234', '4321', '4444'] as const

/** Routes that use classic DashboardHeader (Menu / Odhlásenie). */
export const PROTECTED_DASHBOARD_ROUTES = [
  '/dashboard2',
  '/dashboard/payment-orders',
  '/dashboard/assistant',
] as const

/** Full-bleed dashboard2 (or legacy /dashboard redirect target) — no outer Menu chrome. */
function isDashboard2FullBleed(pathname: string) {
  return (
    pathname === '/dashboard2' ||
    pathname.startsWith('/dashboard2?') ||
    pathname === '/dashboard' ||
    pathname === '/dashboard/'
  )
}

/** Prejde site gate ak je aktívny (produkcia / lokálny dev s gate). */
export async function passSiteGate(page: Page) {
  if (!page.url().includes('/gate')) return

  const questionMark = page.getByTestId('red-question-mark')
  if (await questionMark.isVisible().catch(() => false)) {
    await questionMark.click()
  }

  // Password form (when Tailscale header does not auto-authorize)
  const passwordInput = page.locator('input[type="password"]')
  if (await passwordInput.isVisible().catch(() => false)) {
    await passwordInput.fill(SITE_GATE_PASSWORD)
    await passwordInput.press('Enter')
  }

  await page.waitForURL((url) => !url.pathname.includes('/gate'), { timeout: 20000 })
}

/**
 * Navigácia s automatickým prejdením site gate + guest session.
 * App uses middleware → /api/auth/guest for session when unauthenticated.
 * `path` may be absolute (https://…) or relative (/dashboard2).
 */
export async function gotoApp(page: Page, path: string) {
  await page.goto(path, { timeout: 45000, waitUntil: 'domcontentloaded' })
  await passSiteGate(page)

  // Guest auth: middleware may redirect to /api/auth/guest then back.
  await page.waitForURL(
    (url) => !url.pathname.includes('/gate') && !url.pathname.includes('/api/auth/guest'),
    { timeout: 30000 }
  )
}

/** Absolute URL navigation with site gate + guest handling. */
export async function gotoAbsolute(page: Page, url: string) {
  await gotoApp(page, url)
}

/**
 * Zabezpečí prihlásenú session (site gate + guest auto-login).
 * Lands on /dashboard2 (legacy /dashboard redirects there).
 */
export async function login(page: Page) {
  await gotoApp(page, '/dashboard2')
  await page.waitForURL(/dashboard2/, { timeout: 30000 })
  await expect(page.getByText(/Zadajte bezpečnostný PIN|Prehľad|SPACE účet/i).first()).toBeVisible({
    timeout: 20000,
  })
}

export async function expectGeorgeHeader(page: Page) {
  const path = new URL(page.url()).pathname

  // dashboard2 full-bleed: no outer Menu/Odhlásenie chrome
  if (isDashboard2FullBleed(path)) {
    const pin = page.getByText(/Zadajte bezpečnostný PIN/i)
    const prehlad = page.getByRole('heading', { name: 'Prehľad', exact: true })
    await expect(pin.or(prehlad).first()).toBeVisible({ timeout: 20000 })
    return
  }

  const header = page.locator('header').first()
  await expect(header).toBeVisible()
  await expect(header.getByRole('button', { name: /^Menu$/i })).toBeVisible()
  await expect(header.getByRole('button', { name: /Odhlás/i })).toBeVisible()
}

export async function openDashboardMenu(page: Page) {
  const path = new URL(page.url()).pathname

  if (isDashboard2FullBleed(path)) {
    throw new Error(
      'openDashboardMenu is unavailable on dashboard2 full-bleed. Use page.goto or in-page CTAs.',
    )
  }

  await page.locator('header').getByRole('button', { name: /^Menu$/i }).click()
  await expect(page.getByRole('button', { name: /^História$/i }).first()).toBeVisible({
    timeout: 10000,
  })
}

export async function openNewPaymentFromMenu(page: Page) {
  const path = new URL(page.url()).pathname

  // On dashboard2 full-bleed: unlock PIN if needed, then use in-page CTA
  if (isDashboard2FullBleed(path)) {
    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i)
    if (await pinHeading.isVisible().catch(() => false)) {
      for (const digit of '666666') {
        await page.getByRole('button', { name: digit, exact: true }).click()
      }
      await expect(page.getByRole('heading', { name: 'Prehľad', exact: true })).toBeVisible({
        timeout: 15000,
      })
    }
    const newPaymentBtn = page.getByRole('button', { name: /^Nová platba$/i }).first()
    await expect(newPaymentBtn).toBeVisible({ timeout: 10000 })
    await newPaymentBtn.click()
    await expect(page.getByRole('heading', { name: 'Nová platba' }).or(page.locator('form').first())).toBeVisible({
      timeout: 10000,
    })
    return
  }

  await openDashboardMenu(page)
  const newPaymentBtn = page.getByRole('button', { name: /^Nová platba$/i }).first()
  await expect(newPaymentBtn).toBeVisible({ timeout: 10000 })
  await newPaymentBtn.click()
  await expect(page.locator('form').first()).toBeVisible({ timeout: 10000 })
}
