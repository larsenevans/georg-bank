import { test, expect, type Page } from './fixtures'
import { login, E2E_APP_PIN } from './helpers/app'
import { resolve } from 'node:path'

/**
 * Generátor matematicky platných náhodných IBANov (ISO 7064 MOD 97-10)
 */
function generateRandomValidIban(country: 'SK' | 'CZ'): string {
  const bankCode = country === 'SK' ? '0900' : '0800'
  let randomAccNum = ''
  for (let i = 0; i < 16; i++) {
    randomAccNum += Math.floor(Math.random() * 10).toString()
  }

  const bban = bankCode + randomAccNum
  const countryNumeric = country === 'SK' ? '2820' : '1235'
  const rearranged = bban + countryNumeric + '00'

  let remainder = 0
  for (let i = 0; i < rearranged.length; i++) {
    remainder = (remainder * 10 + parseInt(rearranged[i], 10)) % 97
  }

  const checksum = 98 - remainder
  const checksumStr = checksum < 10 ? '0' + checksum : checksum.toString()
  return `${country}${checksumStr}${bban}`
}

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
  permissions: ['camera'],
})

async function unlockPinIfNeeded(page: Page) {
  const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i)
  if (await pinHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    for (const digit of E2E_APP_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.waitForTimeout(500)
  }
}

test.describe('E2E Flow: Nová platba -> QR sken -> Odoslanie v EUR aj CZK na náhodné IBANy', () => {

  test('Plná flow: Odoslanie EUR platby na random SK IBAN a CZK platby s FX kurzom na random CZ IBAN', async ({ page }) => {
    // 1. Prihlásenie na dashboard2
    await login(page)
    await unlockPinIfNeeded(page)

    // Overenie, že sme na prehľade
    await expect(page.getByRole('heading', { name: 'Prehľad', exact: true }).or(page.getByText(/Business účet|SPACE účet/i).first())).toBeVisible({
      timeout: 15000,
    })

    // 2. Vygenerovanie 2 odlišných náhodných validných IBANov
    const randomIban1_Eur = generateRandomValidIban('SK')
    const randomIban2_Czk = generateRandomValidIban('CZ')
    expect(randomIban1_Eur).not.toBe(randomIban2_Czk)
    expect(randomIban1_Eur.startsWith('SK')).toBe(true)
    expect(randomIban2_Czk.startsWith('CZ')).toBe(true)

    // =========================================================================
    // KROK 1: PLATBA V EUR (Slovenský IBAN)
    // =========================================================================
    // 1.1 Otvorenie "Nová platba"
    const newPaymentBtn = page.getByRole('button', { name: /Nová platba/i }).first()
    await expect(newPaymentBtn).toBeVisible({ timeout: 10000 })
    await newPaymentBtn.click()

    // 1.2 Otvorenie QR skenera
    const scanQrBtn = page.getByRole('button', { name: /Skenovať QR kód/i }).first()
    await expect(scanQrBtn).toBeVisible({ timeout: 10000 })
    await scanQrBtn.click()

    // 1.3 Nahratie obrázku slovenského PAY by square QR kódu
    const fileInput = page.locator('input[type="file"]')
    const pbsFixturePath = resolve(process.cwd(), 'tests/fixtures/qr/valid-pbs-5fields.png')
    await fileInput.setInputFiles(pbsFixturePath)

    // 1.4 Overenie, že sa formulár automaticky predvyplnil z QR kódu
    const recipientInput = page.locator('#pay-recipient')
    const ibanInput = page.locator('#pay-iban')
    const amountInput = page.locator('#pay-amount')
    const vsInput = page.locator('#pay-vs')

    await expect(recipientInput).toBeVisible({ timeout: 10000 })
    await expect(recipientInput).toHaveValue(/Miroslav Polacek/i)
    await expect(amountInput).toHaveValue('125.50')
    await expect(vsInput).toHaveValue('0000123456')

    // Nastavenie presnej sumy 149.90 € podľa požiadavky promptu
    await amountInput.fill('149.90')
    await expect(amountInput).toHaveValue('149.90')

    // 1.5 Prepísanie IBANu za 1. náhodný platný slovenský IBAN
    await ibanInput.fill(randomIban1_Eur)
    await expect(ibanInput).toHaveValue(randomIban1_Eur)

    // 1.6 Overenie zeleného statusu platnosti IBANu
    const ibanStatus = page.locator('#iban-validation-status')
    await expect(ibanStatus).toBeVisible({ timeout: 5000 })
    await expect(ibanStatus).toContainText(/Platný overený IBAN/i)

    // 1.7 Odoslanie platby v EUR
    const authorizeBtn1 = page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).first()
    await expect(authorizeBtn1).toBeVisible()
    await authorizeBtn1.click()

    // 1.8 Overenie úspechu: platobný formulár sa zatvoril a zobrazil sa toast
    await expect(page.locator('#pay-recipient')).not.toBeVisible({ timeout: 10000 })

    // Počkáme na dokončenie zápisu
    await page.waitForTimeout(1000)

    // =========================================================================
    // KROK 2: PLATBA V CZK (Český IBAN s FX konverziou)
    // =========================================================================
    // 2.1 Znovu otvorenie "Nová platba"
    await newPaymentBtn.click()
    await expect(scanQrBtn).toBeVisible({ timeout: 10000 })
    await scanQrBtn.click()

    // 2.2 Nahratie českého SPAYD QR kódu
    const spaydFixturePath = resolve(process.cwd(), 'tests/fixtures/qr/valid-spayd-5fields.png')
    await fileInput.setInputFiles(spaydFixturePath)

    // 2.3 Overenie načítania údajov
    await expect(recipientInput).toBeVisible({ timeout: 10000 })

    // 2.4 Nastavenie cieľovej sumy 5040 CZK a prepnutie na menu CZK
    await amountInput.fill('5040')
    const czkCurrencyBtn = page.getByRole('button', { name: /CZK/i }).first()
    if (await czkCurrencyBtn.isVisible().catch(() => false)) {
      await czkCurrencyBtn.click()
    }

    // 2.5 Overenie, že sa zobrazuje indikátor kurzu a ekvivalentu v EUR
    const fxRateText = page.getByText(/Kurz: 1 EUR = 25.20 CZK/i)
    await expect(fxRateText).toBeVisible({ timeout: 5000 })

    const eurEquivalentText = page.getByText(/≈ 200.00 €/i)
    await expect(eurEquivalentText).toBeVisible({ timeout: 5000 })

    // 2.6 Prepísanie IBANu za 2. iný náhodný český IBAN
    await ibanInput.fill(randomIban2_Czk)
    await expect(ibanInput).toHaveValue(randomIban2_Czk)

    // 2.7 Overenie zeleného statusu platnosti a odvodeného národného účtu ČR
    await expect(ibanStatus).toBeVisible({ timeout: 5000 })
    await expect(ibanStatus).toContainText(/Platný overený IBAN/i)

    const czechNationalBadge = page.locator('#czech-national-account-badge')
    await expect(czechNationalBadge).toBeVisible({ timeout: 5000 })
    await expect(czechNationalBadge).toContainText(/Účet ČR:/i)

    // 2.8 Odoslanie platby v CZK
    const authorizeBtn2 = page.getByRole('button', { name: /Autorizovať cez George kľúč/i }).first()
    await expect(authorizeBtn2).toBeVisible()
    await authorizeBtn2.click()

    // 2.9 Overenie, že platba prebehla a formulár sa úspešne uzavrel
    await expect(page.locator('#pay-recipient')).not.toBeVisible({ timeout: 10000 })
  })
})
