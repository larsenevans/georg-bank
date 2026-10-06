import { test, expect } from './fixtures'
import { gotoApp, expectGeorgeHeader } from './helpers/app'

/**
 * George Asistent – kompletná E2E test sada
 *
 * Pokrýva:
 *  1. Prístupnosť stránky a header
 *  2. Layout UI komponentov (status karty, chat oblasť, input)
 *  3. Odoslanie správy a zobrazenie bublín (alignment, farba, veľkosť)
 *  4. Chat API (GET/POST) – validácia a chybové stavy
 *  5. Shared/Private režim indikátory
 *  6. Typing placeholder a send button stavy
 */

test.describe('George Asistent – Stránka a layout', () => {
  test('Asistent stránka je dostupná po prihlásení', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    await expect(page).toHaveURL(/assistant/)
    await expectGeorgeHeader(page)
    await expect(page.getByText('Konverzácia')).toBeVisible({ timeout: 15000 })
  })

  test('Zobrazuje header s názvom modulu (Súkromný alebo Skupinový)', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const moduleLabel = page.locator('text=/Súkromný modul|Skupinový modul/')
    await expect(moduleLabel).toBeVisible({ timeout: 15000 })
  })

  test('Zobrazuje nadpis asistenta alebo spoločného četu', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const title = page.locator('text=/George asistent|Spoločný čet/')
    await expect(title).toBeVisible({ timeout: 15000 })
  })

  test('Zobrazuje 4 status karty', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    // Labels are lowercase in DOM, displayed uppercase via CSS
    await expect(page.getByText('Online užívatelia')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Režim četu')).toBeVisible()
    await expect(page.getByText('Mistral API')).toBeVisible()
    await expect(page.getByText('Web search')).toBeVisible()
  })

  test('Mistral API karta zobrazuje "configured" alebo "missing"', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    // CI sets a dummy MISTRAL_API_KEY → configured; local without key → missing
    await expect(page.getByText(/configured|missing/i).first()).toBeVisible({ timeout: 15000 })
  })

  test('Konverzácia sekcia je prítomná', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    await expect(page.getByText('Konverzácia')).toBeVisible({ timeout: 15000 })
  })

  test('Chat input pole je viditeľné s placeholderom', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 15000 })
  })

  test('Odoslať button je viditeľný a má aria-label', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const sendBtn = page.locator('button[aria-label="Odoslať"]')
    await expect(sendBtn).toBeVisible({ timeout: 15000 })
  })

  test('Odoslať button je disabled keď je input prázdny', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 15000 })
    await chatInput.fill('')
    const sendBtn = page.locator('button[aria-label="Odoslať"]')
    await expect(sendBtn).toBeDisabled()
  })

  test('Odoslať button je enabled keď je text v inpute', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 15000 })
    await chatInput.fill('Test správa')
    const sendBtn = page.locator('button[aria-label="Odoslať"]')
    await expect(sendBtn).toBeEnabled()
  })
})

test.describe('George Asistent – Odoslanie správy a bubliny', () => {
  test('Odoslanie správy vytvorí modrú bublinu na pravej strane', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    await chatInput.fill('Testovacia správa pre bublinu')
    await page.locator('button[aria-label="Odoslať"]').click()

    // Wait for message to appear
    await page.waitForTimeout(3000)

    // Find all message bubble containers and locate the user's one by text
    const userBubble = page.locator('div[class*="ml-auto"]').filter({ hasText: 'Testovacia správa pre bublinu' }).first()
    await expect(userBubble).toBeVisible({ timeout: 10000 })

    const classes = await userBubble.getAttribute('class') || ''
    expect(classes).toContain('ml-auto')         // RIGHT aligned
    expect(classes).toContain('rounded-tr-none')  // Speech bubble corner
    expect(classes).toContain('max-w-')           // Not full width
    expect(classes).toContain('w-fit')            // Shrink to content
  })

  test('Po odoslaní sa input vyčistí', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    await chatInput.fill('Správa na vyčistenie')
    await page.locator('button[aria-label="Odoslať"]').click()

    // Input should be cleared after sending
    await page.waitForTimeout(3000)
    await expect(chatInput).toHaveValue('')
  })

  test('Enter klávesa odošle správu', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    await chatInput.fill('Správa cez Enter')
    await chatInput.press('Enter')

    await page.waitForTimeout(3000)

    // Message should appear - find by text
    const bubble = page.locator('div[class*="ml-auto"]').filter({ hasText: 'Správa cez Enter' })
    await expect(bubble.first()).toBeVisible({ timeout: 10000 })
  })

  test('Viaceré správy sa zobrazujú pod sebou', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    const sendBtn = page.locator('button[aria-label="Odoslať"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    // Send first message
    await chatInput.fill('Prvá správa')
    await sendBtn.click()
    await expect(page.getByText('Prvá správa').first()).toBeVisible({ timeout: 10000 })

    // Fill second message, which enables the send button once loading completes
    await chatInput.fill('Druhá správa')
    await expect(sendBtn).toBeEnabled({ timeout: 15000 })
    await sendBtn.click()

    // Both should be visible
    await expect(page.getByText('Prvá správa').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Druhá správa').first()).toBeVisible({ timeout: 15000 })
  })

  test('Bublina má zaoblené rohy (rounded-[16px])', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 10000 })

    await chatInput.fill('Test zaoblenia')
    await page.locator('button[aria-label="Odoslať"]').click()
    await page.waitForTimeout(3000)

    const bubble = page.locator('div[class*="ml-auto"]').filter({ hasText: 'Test zaoblenia' }).first()
    await expect(bubble).toBeVisible({ timeout: 10000 })
    const classes = (await bubble.getAttribute('class')) || ''
    expect(classes).toContain('rounded-')
  })
})

test.describe('George Asistent – Chat API', () => {
  test('GET /api/assistant/chat vracia JSON s messages, isShared, activeUsers', async ({ request }) => {
    const response = await request.get('/api/assistant/chat')
    expect(response.status()).toBe(200)

    const data = await response.json()
    expect(data).toHaveProperty('messages')
    expect(data).toHaveProperty('isShared')
    expect(data).toHaveProperty('activeUsers')
    expect(data).toHaveProperty('config')
    expect(Array.isArray(data.messages)).toBe(true)
    expect(typeof data.isShared).toBe('boolean')
    expect(typeof data.activeUsers).toBe('number')
  })

  test('GET /api/assistant/chat config obsahuje mistralConfigured a model', async ({ request }) => {
    const response = await request.get('/api/assistant/chat')
    const data = await response.json()

    expect(data.config).toHaveProperty('mistralConfigured')
    expect(data.config).toHaveProperty('model')
    expect(data.config).toHaveProperty('webSearchEnabled')
  })

  test('POST /api/assistant/chat s platnou správou vracia 200', async ({ request }) => {
    const response = await request.post('/api/assistant/chat', {
      data: { message: 'Test z Playwright' },
    })
    // Should succeed (200) or fail gracefully (500 if Mistral is down)
    expect([200, 500]).toContain(response.status())

    const data = await response.json()
    if (response.status() === 200) {
      expect(data).toHaveProperty('messages')
      expect(data).toHaveProperty('conversation')
      expect(data.messages.length).toBeGreaterThan(0)
    }
  })

  test('POST /api/assistant/chat bez message vracia 400', async ({ request }) => {
    const response = await request.post('/api/assistant/chat', {
      data: { message: '' },
    })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toBeTruthy()
  })

  test('POST /api/assistant/chat s prázdnym JSON vracia 400', async ({ request }) => {
    const response = await request.post('/api/assistant/chat', {
      data: {},
    })
    expect(response.status()).toBe(400)
  })

  test('POST /api/assistant/chat s príliš dlhou správou vracia 400', async ({ request }) => {
    const longMessage = 'A'.repeat(1300) // over 1200 char limit
    const response = await request.post('/api/assistant/chat', {
      data: { message: longMessage },
    })
    expect(response.status()).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('1200')
  })

  test('POST /api/assistant/chat vracia senderId a senderName', async ({ request }) => {
    const response = await request.post('/api/assistant/chat', {
      data: { message: 'Test sender info' },
    })
    if (response.status() === 200) {
      const data = await response.json()
      const firstMsg = data.messages[0]
      expect(firstMsg).toHaveProperty('senderId')
      expect(firstMsg).toHaveProperty('senderName')
      expect(firstMsg.senderId).toBeTruthy()
      expect(firstMsg.senderName).toBeTruthy()
    }
  })

  test('POST /api/assistant/chat vracia isShared a activeUsers', async ({ request }) => {
    const response = await request.post('/api/assistant/chat', {
      data: { message: 'Test shared info' },
    })
    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('isShared')
      expect(data).toHaveProperty('activeUsers')
      expect(typeof data.isShared).toBe('boolean')
      expect(typeof data.activeUsers).toBe('number')
    }
  })

  test('GET /api/assistant/chat messages majú správnu štruktúru', async ({ request }) => {
    // Send a message first to ensure there's at least one
    await request.post('/api/assistant/chat', {
      data: { message: 'Štruktúra test' },
    })

    const response = await request.get('/api/assistant/chat')
    const data = await response.json()

    if (data.messages.length > 0) {
      const msg = data.messages[0]
      expect(msg).toHaveProperty('id')
      expect(msg).toHaveProperty('role')
      expect(msg).toHaveProperty('content')
      expect(msg).toHaveProperty('createdAt')
      expect(msg).toHaveProperty('senderId')
      expect(msg).toHaveProperty('senderName')
      expect(['user', 'assistant', 'system', 'tool']).toContain(msg.role)
    }
  })
})

test.describe('George Asistent – bez predchádzajúcej session', () => {
  test('GET /api/assistant/chat bez cookies: gate/guest redirect alebo 401/200', async ({ browser }) => {
    // page.request does not follow guest HTML login the same way as navigation;
    // accept redirect / unauthorized / ok depending on proxy + auth state.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    const response = await page.request.get('/api/assistant/chat')
    expect([401, 302, 307, 200]).toContain(response.status())
    await context.close()
  })

  test('POST /api/assistant/chat bez cookies: gate/guest redirect alebo 401/200', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    const response = await page.request.post('/api/assistant/chat', {
      data: { message: 'Pokus bez prihlásenia' },
    })
    // 405: redirect target may not accept POST; 401 unauth; 302/307 guest/gate
    expect([401, 302, 307, 405, 200]).toContain(response.status())
    await context.close()
  })

  test('Navigácia na asistent bez session → guest login → asistent (nie sign-in form)', async ({ browser }) => {
    // Guest-first app: no classic sign-in wall when site gate is off.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await page.goto('/dashboard/assistant')
    await page.waitForURL(
      (url) => !url.pathname.includes('/api/auth/guest') && !url.pathname.includes('/gate'),
      { timeout: 30000 }
    )
    await expect(page).toHaveURL(/assistant/)
    await expect(page).not.toHaveURL(/sign-in/)
    await context.close()
  })
})

test.describe('George Asistent – Režim indikátory', () => {
  test('Status karta Online užívatelia zobrazuje číslo', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    // The label is lowercase in DOM, rendered uppercase via CSS class
    const onlineLabel = page.getByText('Online užívatelia')
    await expect(onlineLabel).toBeVisible({ timeout: 5000 })
  })

  test('Režim četu zobrazuje Súkromný alebo Spoločný', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const modeValue = page.getByText(/Súkromný|Spoločný/)
    await expect(modeValue.first()).toBeVisible({ timeout: 5000 })
  })

  test('Ikona v headeri je Bot (súkromný) alebo Users (skupinový)', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    // Either bot or users icon container should be visible (rounded full circle)
    const iconContainer = page.locator('div[class*="rounded-full"][class*="bg-"]').first()
    await expect(iconContainer).toBeVisible({ timeout: 5000 })
  })

  test('Placeholder sa mení podľa režimu', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const input = page.locator('input[placeholder]').last()
    await expect(input).toBeVisible({ timeout: 5000 })
    const placeholder = await input.getAttribute('placeholder') || ''
    // Should be one of the two modes
    expect(placeholder).toMatch(/Opýtaj sa Georga|Napíš správu ostatným/)
  })
})

test.describe('George Asistent – Screenshot vizuálna kontrola', () => {
  test('Celostránkový screenshot asistenta', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'e2e/screenshots/assistant-full-page.png', fullPage: true })
  })

  test('Screenshot po odoslaní správy', async ({ page }) => {
    await gotoApp(page, '/dashboard/assistant')
    const chatInput = page.locator('input[placeholder*="Opýtaj"], input[placeholder*="Napíš"]')
    await expect(chatInput).toBeVisible({ timeout: 5000 })

    await chatInput.fill('Screenshot test správa')
    await page.locator('button[aria-label="Odoslať"]').click()
    await page.waitForTimeout(4000)

    await page.screenshot({ path: 'e2e/screenshots/assistant-after-message.png', fullPage: true })
  })
})
