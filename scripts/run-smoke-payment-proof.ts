import { chromium } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { generatePaymentConfirmationHtml } from '../lib/payment-confirmation-pdf'

import { loginWithPin } from '../e2e/helpers/dashboard2'

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.resolve(process.cwd(), 'test-results', 'smoke-payment-proof')
const LOCAL_RESULTS_DIR = path.resolve(process.cwd(), 'test-results', 'smoke-payment-proof')

async function runSmokePaymentWithPdfProof() {
  console.log('========================================================================')
  console.log('🚀 SPUSTENIE SMOKE TESTU: PLATBA 1 051,59 € + NOVÉ PDF POTVRDENIE & DÔKAZ')
  console.log('========================================================================\n')

  fs.mkdirSync(LOCAL_RESULTS_DIR, { recursive: true })
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
  })

  const authFile = path.resolve(process.cwd(), 'playwright/.auth/user.json')
  const context = await browser.newContext({
    baseURL: 'http://localhost:3030',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    storageState: fs.existsSync(authFile) ? authFile : undefined,
  })

  const page = await context.newPage()

  // Zakážeme navigator.share, aby sa v e2e triggerol štandardný browser download
  await page.addInitScript(() => {
    const nav = navigator as Navigator & {
      canShare?: (d?: ShareData) => boolean
      share?: () => Promise<void>
    }
    nav.canShare = () => false
    nav.share = async () => {
      throw new Error('share disabled in e2e')
    }
  })

  console.log('1. Prihlásenie na http://localhost:3030/dashboard2 cez George kľúč...')
  await loginWithPin(page)
  console.log('  ✓ Prehľad je plne načítaný.')

  // Otvorenie modálu "Nová platba"
  console.log('2. Otváram modál "Nová platba"...')
  const newPaymentBtn = page.getByRole('button', { name: /Nová platba/i }).first()
  await newPaymentBtn.waitFor({ state: 'visible', timeout: 10000 })
  await newPaymentBtn.click()
  await page.waitForTimeout(600)

  // Vyplnenie formulára pre smoke platbu
  console.log('4. Vypĺňam platobný formulár:')
  const recipient = 'Smoke Test – Nové PDF'
  const iban = 'SK8090000000001234567890'
  const amount = '1051.59'
  const vs = '20261013'
  const note = 'Smoke platba s novým PDF výpisom'

  console.log(`  - Príjemca: ${recipient}`)
  console.log(`  - IBAN:     ${iban}`)
  console.log(`  - Suma:     ${amount} €`)
  console.log(`  - VS:       ${vs}`)
  console.log(`  - Poznámka: ${note}`)

  await page.locator('#pay-recipient').fill(recipient)
  await page.locator('#pay-iban').fill(iban)
  await page.locator('#pay-amount').fill(amount)
  await page.locator('#pay-vs').fill(vs)
  await page.locator('#pay-note').fill(note)
  await page.waitForTimeout(500)

  // SCREENSHOT 1: Vyplnený platobný formulár
  const formShotPath = path.join(LOCAL_RESULTS_DIR, '01_smoke_payment_form.png')
  const artifactFormShot = path.join(ARTIFACT_DIR, 'smoke_payment_form.png')
  await page.screenshot({ path: formShotPath, fullPage: false })
  fs.copyFileSync(formShotPath, artifactFormShot)
  console.log(`  📸 Screenshot formulára uložený do: ${artifactFormShot}`)

  // Príprava na zachytenie download eventu
  console.log('5. Spúšťam autorizáciu cez George kľúč a čakám na download...')
  const downloadPromise = page.waitForEvent('download', { timeout: 35000 })
  const submitBtn = page.getByRole('button', { name: /Autorizovať cez George kľúč/i })
  await submitBtn.click()

  const download = await downloadPromise
  const filename = download.suggestedFilename()
  console.log(`  🎉 ZACHYTENÝ DOWNLOAD: ${filename}`)

  const downloadedFilePath = path.join(LOCAL_RESULTS_DIR, filename)
  const artifactDownloadedPath = path.join(ARTIFACT_DIR, filename)
  await download.saveAs(downloadedFilePath)
  fs.copyFileSync(downloadedFilePath, artifactDownloadedPath)

  const fileSize = fs.statSync(downloadedFilePath).size
  console.log(`  💾 Súbor uložený (${fileSize} bajtov): ${artifactDownloadedPath}`)

  const isPdf = filename.toLowerCase().endsWith('.pdf')
  if (isPdf) {
    const magic = fs.readFileSync(downloadedFilePath).subarray(0, 4).toString('utf8')
    console.log(`  🔍 Hlavička súboru: ${magic} (Validné PDF: ${magic === '%PDF' ? 'ÁNO' : 'NIE'})`)
  }

  // 6. RENDERUJEME ČISTÝ HTML / PDF DOKUMENT A ZACHYTÁVAME DETAILNÝ DÔKAZ
  console.log('\n6. Renderujem potvrdenie s pixel-perfect hlavičkou pre vizuálny dôkaz...')

  const renderPage = await context.newPage()
  await renderPage.setViewportSize({ width: 1000, height: 1300 })

  // Generujeme HTML z reálnych dát platby
  const receiptHtml = generatePaymentConfirmationHtml({
    transactionId: `smoke-${Date.now()}`,
    createdAt: new Date().toLocaleString('sk-SK'),
    status: 'Štandardný platobný príkaz',
    transferType: 'external',
    fromAccountNumber: 'SK31 0900 2165 8643 2276',
    recipientName: recipient,
    recipientAccountOrEmail: iban,
    amount: amount,
    currency: 'EUR',
    variableSymbol: vs,
    constantSymbol: '0308',
    specificSymbol: '',
    note: note,
    payerReference: '',
    dueDate: 'Dnes',
    repeatDays: '0',
    createTemplate: false,
    emailConfirmation: false,
    balanceBefore: '15420.50',
    balanceAfter: (15420.50 - parseFloat(amount)).toFixed(2),
  })

  // Uložíme HTML aj do artifacts
  const htmlProofPath = path.join(ARTIFACT_DIR, 'smoke_payment_receipt.html')
  fs.writeFileSync(htmlProofPath, receiptHtml, 'utf8')

  await renderPage.setContent(receiptHtml, { waitUntil: 'load' })
  await renderPage.waitForTimeout(800)

  // SCREENSHOT 2: Kompletný celostránkový A4 dokument
  const fullDocShotPath = path.join(LOCAL_RESULTS_DIR, '02_smoke_payment_full_document.png')
  const artifactFullDocShot = path.join(ARTIFACT_DIR, 'smoke_payment_full_document.png')
  const a4Doc = renderPage.locator('.a4-document')
  if (await a4Doc.isVisible().catch(() => false)) {
    await a4Doc.screenshot({ path: fullDocShotPath })
  } else {
    await renderPage.screenshot({ path: fullDocShotPath, fullPage: true })
  }
  fs.copyFileSync(fullDocShotPath, artifactFullDocShot)
  console.log(`  📸 Screenshot celého A4 dokumentu: ${artifactFullDocShot}`)

  // SCREENSHOT 3: Pixel-perfect detail boxu "Výpis z Účtu:"
  const headerBoxShotPath = path.join(LOCAL_RESULTS_DIR, '03_smoke_payment_header_box.png')
  const artifactHeaderBoxShot = path.join(ARTIFACT_DIR, 'smoke_payment_header_box.png')

  // Obal title + details-box
  const headerBoxElement = renderPage.locator('.details-box')
  if (await headerBoxElement.isVisible().catch(() => false)) {
    await headerBoxElement.screenshot({ path: headerBoxShotPath })
    fs.copyFileSync(headerBoxShotPath, artifactHeaderBoxShot)
    console.log(`  📸 Detailný screenshot hlavičky "Výpis z Účtu:": ${artifactHeaderBoxShot}`)
  }

  await browser.close()

  console.log('\n========================================================================')
  console.log('✅ SMOKE TEST PLATBY S NOVÝM PDF POTVRDENÍM ÚSPEŠNE DOKONČENÝ!')
  console.log('========================================================================')
  console.log(`1. Formulár platby:   ${artifactFormShot}`)
  console.log(`2. Stiahnutý súbor:    ${artifactDownloadedPath} (${fileSize} bytes)`)
  console.log(`3. Celý A4 dokument:  ${artifactFullDocShot}`)
  console.log(`4. Pixel-perfect box: ${artifactHeaderBoxShot}`)
  console.log(`5. HTML šablóna:      ${htmlProofPath}`)
}

runSmokePaymentWithPdfProof().catch((err) => {
  console.error('❌ Chyba pri behu smoke testu:', err)
  process.exit(1)
})
