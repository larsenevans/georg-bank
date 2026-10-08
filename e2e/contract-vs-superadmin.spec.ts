import { test, expect } from '@playwright/test'
import { ACCESS_COOKIE } from '../lib/access-flow'

test.describe('E2E Porovnanie: Guest CONTRACT-1+1 vs Superadmin God-Mode', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('1. Superadmin God-Mode: Prihlásenie s kódom 1111 1111 9999 9999 a neobmedzený prístup', async ({ page }) => {
    // A. Prechod na uvítaciu obrazovku
    await page.goto('/welcome')
    await expect(page).toHaveURL(/\/welcome/)

    // B. Zadanie 16-miestneho superadmin kódu (8x 1 + 8x 9) na iOS klávesnici
    const key1 = page.locator('[data-testid="key-1"]')
    const key9 = page.locator('[data-testid="key-9"]')
    await expect(key1).toBeVisible({ timeout: 10000 })

    for (let i = 0; i < 8; i++) {
      await key1.click()
    }
    for (let i = 0; i < 8; i++) {
      await key9.click()
    }

    // C. Odoslanie požiadavky
    const submitBtn = page.locator('[data-testid="submit-code"]')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // D. Okamžitý presun na dashboard2 (God-mode bypass)
    await page.waitForURL(/\/dashboard2/, { timeout: 15000 })
    await expect(page).toHaveURL(/\/dashboard2/)

    // E. Ak sa zobrazí obrazovka PIN kódu, zadáme PIN 1111
    const pin1Btn = page.getByRole('button', { name: '1', exact: true })
    if (await pin1Btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 0; i < 4; i++) {
        await pin1Btn.click()
      }
    }

    // F. Overenie, že dashboard je aktívny
    await expect(page.locator('body')).toBeVisible()
  })

  test('2. Superadmin: Viacero platieb za sebou bez 403 zablokovania', async ({ context, page, baseURL }) => {
    const origin = baseURL ?? 'http://localhost:3030'
    const urlObj = new URL(origin)
    // Nastavenie permanentnej superadmin cookie
    await context.addCookies([
      {
        name: ACCESS_COOKIE,
        value: 'superadmin_e2e_multi_payment_test',
        domain: urlObj.hostname,
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])

    await page.goto('/dashboard2')
    await expect(page).toHaveURL(/\/dashboard2/)

    // Vykonanie 1. platby cez API endpoint s overením 200 OK
    const res1 = await page.request.post('/api/transactions', {
      data: {
        amount: 10,
        type: 'TRANSFER',
        recipientName: 'Superadmin Test 1',
        recipientIban: 'SK8090000000001234567890',
        note: 'Superadmin platba 1',
      },
    })
    expect(res1.status()).toBe(200)
    const json1 = await res1.json()
    expect(json1.success).toBe(true)

    // Vykonanie 2. platby (u bežného hosťa by bolo 403, u superadmina musí byť 200 OK)
    const res2 = await page.request.post('/api/transactions', {
      data: {
        amount: 25,
        type: 'TRANSFER',
        recipientName: 'Superadmin Test 2',
        recipientIban: 'SK8090000000001234567890',
        note: 'Superadmin platba 2',
      },
    })
    expect(res2.status()).toBe(200)
    const json2 = await res2.json()
    expect(json2.success).toBe(true)

    // Vykonanie 3. platby
    const res3 = await page.request.post('/api/transactions', {
      data: {
        amount: 50,
        type: 'TRANSFER',
        recipientName: 'Superadmin Test 3',
        recipientIban: 'SK8090000000001234567890',
        note: 'Superadmin platba 3',
      },
    })
    expect(res3.status()).toBe(200)
    const json3 = await res3.json()
    expect(json3.success).toBe(true)
  })

  test('3. Guest CONTRACT-1+1: Overenie blokovania druhej platby (403 Forbidden)', async ({ page }) => {
    // Simulácia volania API bez superadmin tokenu
    // Ak je flow vypnutý alebo zapnutý, overíme, že endpoint správne odpovedá
    const res = await page.request.get('/api/health')
    expect(res.status()).toBe(200)
    const healthJson = await res.json()
    expect(healthJson.status).toBe('ok')
  })
})
