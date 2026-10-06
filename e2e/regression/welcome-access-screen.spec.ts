import { test, expect } from '@playwright/test'
import { getE2eAccessAdminSecret } from '../helpers/access-session'
import { E2E_APP_PIN } from '../helpers/app'

/**
 * Regresný test pre prihlásenie a zobrazenie obrazovky prístupu (WelcomeScreen s iOS klávesnicou).
 * Overuje 1:1 vizuálnu štruktúru, interaktivitu numerickej klávesnice a kompletný flow prihlásenia so schválením.
 */
test.describe('welcome access screen regression', () => {
  // Test beží bez uloženej session – simuluje nového/neprihláseného návštevníka
  test.use({ storageState: { cookies: [], origins: [] } })

  test('zobrazenie obrazovky prístupu (1:1 podľa šablóny)', async ({ page }) => {
    await page.goto('/welcome')

    // 1. Horná sekcia: Nadpisy
    const heading = page.locator('h1', { hasText: 'Prístup' })
    await expect(heading).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Zadaj 16-miestny kód').first()).toBeVisible()
    await expect(page.getByText('Kód schvaľuje správca aplikácie')).toBeVisible()

    // 2. Stred: Maroon hľadáčik (vínovočervený zaoblený štvorec)
    const maroonBox = page.locator('div.bg-\\[\\#5c0e0e\\]')
    await expect(maroonBox).toBeVisible()

    // 3. Spodná karta (bottom sheet): Zadať kód ručne
    await expect(page.getByRole('heading', { name: 'Zadať kód ručne' })).toBeVisible()

    // Krížik na vymazanie
    const clearButton = page.getByRole('button', { name: /Vymazať zadaný kód/i })
    await expect(clearButton).toBeVisible()

    // Input box s placeholderom
    const inputBox = page.getByTestId('code-input-box')
    await expect(inputBox).toBeVisible()
    await expect(inputBox).toContainText('Zadaj 16-miestny kód')

    // Tlačidlo "Požiadať o prístup" je spočiatku neaktívne (disabled)
    const submitBtn = page.getByTestId('submit-code')
    await expect(submitBtn).toBeVisible()
    await expect(submitBtn).toBeDisabled()
    await expect(submitBtn).toHaveText('Požiadať o prístup')

    // 4. iOS numerická klávesnica: čísla 1 až 9 s písmenami, 0 a backspace
    for (let i = 1; i <= 9; i++) {
      const key = page.getByTestId(`key-${i}`)
      await expect(key).toBeVisible()
    }
    await expect(page.getByTestId('key-0')).toBeVisible()
    await expect(page.getByTestId('key-backspace')).toBeVisible()

    // Overenie podtitulkov písmen na tlačidlách klávesnice (napr. 2 ABC, 3 DEF...)
    await expect(page.getByTestId('key-2')).toContainText('A B C')
    await expect(page.getByTestId('key-3')).toContainText('D E F')
    await expect(page.getByTestId('key-4')).toContainText('G H I')
    await expect(page.getByTestId('key-9')).toContainText('W X Y Z')
  })

  test('interaktivita klávesnice, formátovanie číslic a vymazanie', async ({ page }) => {
    await page.goto('/welcome')

    // Klikanie číslic na virtuálnej klávesnici: 1, 2, 3, 4, 5
    await page.getByTestId('key-1').click()
    await page.getByTestId('key-2').click()
    await page.getByTestId('key-3').click()
    await page.getByTestId('key-4').click()
    await page.getByTestId('key-5').click()

    // Číslice sú naformátované do skupín po 4: "1234 5"
    const digitsText = page.getByTestId('digits-text')
    await expect(digitsText).toHaveText('1234 5')

    // Kliknutie na backspace zmaže poslednú číslicu
    await page.getByTestId('key-backspace').click()
    await expect(digitsText).toHaveText('1234')

    // Kliknutie na krížik vymaže celý vstup
    await page.getByRole('button', { name: /Vymazať zadaný kód/i }).click()
    await expect(digitsText).toHaveText('')

    // Zadanie číslic cez fyzickú klávesnicu: 15 číslic -> tlačidlo stále neaktívne
    await page.keyboard.type('123456789012345')
    await expect(digitsText).toHaveText('1234 5678 9012 345')
    await expect(page.getByTestId('submit-code')).toBeDisabled()

    // Doplnenie 16. číslice -> tlačidlo "Požiadať o prístup" sa aktivuje
    await page.keyboard.type('6')
    await expect(digitsText).toHaveText('1234 5678 9012 3456')
    await expect(page.getByTestId('submit-code')).toBeEnabled()
  })

  test('prihlásenie: odoslanie kódu, pending stav, schválenie správcom a redirect do bankingu', async ({
    page,
    request,
    baseURL,
  }) => {
    await page.goto('/welcome')

    // Vygenerujeme náhodný 16-miestny kód pre test
    let testCode = ''
    for (let i = 0; i < 16; i++) testCode += Math.floor(Math.random() * 10).toString()

    // Zadáme 16 číslic klikaním na numerickú klávesnicu
    for (const char of testCode) {
      await page.getByTestId(`key-${char}`).click()
    }
    await expect(page.getByTestId('submit-code')).toBeEnabled()

    // Odchytíme volanie POST /api/access/request
    const requestPromise = page.waitForResponse(
      (res) => res.url().includes('/api/access/request') && res.request().method() === 'POST'
    )

    await page.getByTestId('submit-code').click()

    const response = await requestPromise
    expect(response.status()).toBe(200)
    const responseData = (await response.json()) as { requestId: string }
    expect(responseData.requestId).toBeTruthy()

    // 1. Overíme pending stav na obrazovke
    await expect(page.getByTestId('toast-message')).toContainText(/Žiadosť odoslaná/i)
    await expect(page.getByText('Čaká sa na schválenie')).toBeVisible()
    await expect(page.getByText('Správca overuje váš prístupový kód')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Žiadosť odoslaná' })).toBeVisible()
    await expect(page.getByTestId('cancel-request')).toBeVisible()

    // 2. Simulácia schválenia správcom cez GET /api/access/decide
    const secret = getE2eAccessAdminSecret() || 'playwright-e2e-access-admin-secret'
    const decideRes = await request.get('/api/access/decide', {
      params: {
        token: secret,
        requestId: responseData.requestId,
        decision: 'approved',
      },
      headers: {
        'user-agent': 'playwright-e2e',
        'x-e2e-test': '1',
      },
    })
    expect(decideRes.status()).toBe(200)

    // 3. WelcomeScreen polling automaticky zachytí schválenie a presmeruje do bankingu
    await page.waitForURL(/.*dashboard2/, { timeout: 20000 })
    expect(page.url()).toContain('/dashboard2')

    // 4. Overíme, že v bankingu sme prihlásení (zobrazí sa George kľúč PIN alebo priamo Prehľad)
    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i)
    const prehladHeading = page.getByRole('heading', { name: 'Prehľad', exact: true })
    await expect(pinHeading.or(prehladHeading).first()).toBeVisible({ timeout: 15000 })

    // Ak sa zobrazuje George kľúč PIN klávesnica, zadáme PIN a odomkneme prehľad
    if (await pinHeading.isVisible().catch(() => false)) {
      for (const digit of E2E_APP_PIN) {
        await page.getByRole('button', { name: digit, exact: true }).click()
      }
      await expect(prehladHeading).toBeVisible({ timeout: 15000 })
    }
  })
})
