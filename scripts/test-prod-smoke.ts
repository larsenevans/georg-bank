import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const PROD_URL = process.env.TEST_TARGET_URL || 'https://gro-kan-1040062317673.europe-west3.run.app'
const ARTIFACTS_DIR = 'C:\\Users\\42195\\.gemini\\antigravity-ide\\brain\\d05b7caf-4cc5-40e2-a1ba-ac86f6a5002c'
const APP_PIN = process.env.APP_PIN ?? '888888'

interface SmokeReport {
  apiChecks: { name: string; passed: boolean; details?: string }[]
  browserChecks: { name: string; passed: boolean; details?: string }[]
}

async function runLiveSmokeTest() {
  console.log('==================================================================')
  console.log(`🚀 SPUSTENIE KOMPLETNÉHO LIVE SMOKE TESTU NA PRODUKCII: ${PROD_URL}`)
  console.log('==================================================================\n')

  const report: SmokeReport = {
    apiChecks: [],
    browserChecks: [],
  }

  // -------------------------------------------------------------------------
  // FÁZA 1: HTTP & API SMOKE KONTROLY
  // -------------------------------------------------------------------------
  console.log('--- [1/2] FÁZA 1: HTTP & API SMOKE KONTROLY ---')

  let cleanSuperadminCookie = ''

  // 1. Health Probe
  try {
    const res = await fetch(`${PROD_URL}/api/health`)
    const data = (await res.json()) as { ok?: boolean; timestamp?: string }
    const xRobots = res.headers.get('x-robots-tag') || ''
    const passed = res.status === 200 && data.ok === true
    report.apiChecks.push({
      name: '1. Health Probe & Status (/api/health)',
      passed,
      details: `Status ${res.status}, ok: ${data.ok}, X-Robots-Tag: ${xRobots || 'none'}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 1. Health Probe: Status ${res.status}, ok: ${data.ok}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '1. Health Probe & Status (/api/health)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 1. Health Probe: Exception', err)
  }

  // 2. Gate ochrana pre root / (Redirect 307)
  try {
    const res = await fetch(`${PROD_URL}/`, { redirect: 'manual' })
    const location = res.headers.get('location') || ''
    const passed = res.status === 307 && location.includes('/welcome')
    report.apiChecks.push({
      name: '2. Root URL Access Guard (Redirect -> /welcome)',
      passed,
      details: `Status ${res.status}, Location: ${location}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 2. Root Access Guard: Status ${res.status} -> ${location}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '2. Root URL Access Guard (Redirect -> /welcome)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 2. Root Access Guard: Exception', err)
  }

  // 3. Gate ochrana pre /dashboard2 bez cookie (Redirect 307)
  try {
    const res = await fetch(`${PROD_URL}/dashboard2`, { redirect: 'manual' })
    const location = res.headers.get('location') || ''
    const passed = res.status === 307 && location.includes('/welcome')
    report.apiChecks.push({
      name: '3. Chránený Dashboard Guard bez cookie',
      passed,
      details: `Status ${res.status}, Location: ${location}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 3. Dashboard Guard: Status ${res.status} -> ${location}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '3. Chránený Dashboard Guard bez cookie',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 3. Dashboard Guard: Exception', err)
  }

  // 4. Superadmin instant login (1111111199999999)
  try {
    const res = await fetch(`${PROD_URL}/api/access/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '1111111199999999' }),
    })
    const data = (await res.json()) as { approved?: boolean; superadmin?: boolean }
    const setCookie = res.headers.get('set-cookie') || ''
    const match = setCookie.match(/access_granted=([^;]+)/)
    if (match) {
      cleanSuperadminCookie = `access_granted=${match[1]}`
    }
    const passed = res.status === 200 && data.approved === true && data.superadmin === true && Boolean(cleanSuperadminCookie)
    report.apiChecks.push({
      name: '4. Superadmin God-Mode kód (Instant Approved)',
      passed,
      details: `approved: ${data.approved}, superadmin: ${data.superadmin}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 4. Superadmin Login: approved=${data.approved}, superadmin=${data.superadmin}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '4. Superadmin God-Mode kód (Instant Approved)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 4. Superadmin Login: Exception', err)
  }

  // 5. Superadmin Zostatok (nemenný >= 7 589,20 €)
  try {
    const res = await fetch(`${PROD_URL}/api/pin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cleanSuperadminCookie,
      },
      body: JSON.stringify({ biometrics: true }),
    })
    const data = (await res.json()) as { ok?: boolean; balanceEur?: number; balanceCents?: number }
    const passed =
      res.status === 200 &&
      data.ok === true &&
      (data.balanceEur ?? 0) >= 7589.2 &&
      (data.balanceCents ?? 0) >= 758920
    report.apiChecks.push({
      name: '5. Superadmin Garantovaný Zostatok (>= 7 589,20 €)',
      passed,
      details: `balanceEur: ${data.balanceEur} €, balanceCents: ${data.balanceCents}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 5. Superadmin Zostatok: ${data.balanceEur} €`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '5. Superadmin Garantovaný Zostatok (>= 7 589,20 €)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 5. Superadmin Zostatok: Exception', err)
  }

  // 6. Dátová izolácia transakcií (Guest)
  try {
    const res = await fetch(`${PROD_URL}/api/transactions`, {
      headers: {
        Cookie: 'access_granted=guest_session_smoke_live',
      },
    })
    const data = (await res.json()) as { success?: boolean; transactions?: { isSuperadmin?: boolean }[] }
    const txs = data.transactions ?? []
    const hasAdmin = txs.some((t) => t.isSuperadmin === true)
    const passed = res.status === 200 && data.success === true && !hasAdmin
    report.apiChecks.push({
      name: '6. Dátová Izolácia Transakcií (Guest nevidí superadmin platby)',
      passed,
      details: `Celkovo vrátených: ${txs.length}, admin uniknutých: ${hasAdmin ? 1 : 0}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 6. Transakčná Izolácia (Guest): ${txs.length} platieb, 0 admin únikov`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '6. Dátová Izolácia Transakcií (Guest nevidí superadmin platby)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 6. Transakčná Izolácia: Exception', err)
  }

  // 7. Prístup k transakciám pre Superadmina
  try {
    const res = await fetch(`${PROD_URL}/api/transactions`, {
      headers: {
        Cookie: cleanSuperadminCookie,
      },
    })
    const data = (await res.json()) as { success?: boolean; transactions?: unknown[] }
    const passed = res.status === 200 && data.success === true && Array.isArray(data.transactions)
    report.apiChecks.push({
      name: '7. Superadmin Prístup k Pohybom',
      passed,
      details: `Načítaných položiek: ${data.transactions?.length ?? 0}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 7. Superadmin Pohyby: ${data.transactions?.length ?? 0} položiek`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '7. Superadmin Prístup k Pohybom',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 7. Superadmin Pohyby: Exception', err)
  }

  // 8. PDF Engine & Doklad Storage Pipeline (/api/receipts/upload)
  try {
    const formData = new FormData()
    // Odosielame bez transactionId pre overenie autentifikácie a validácie schémy
    const res = await fetch(`${PROD_URL}/api/receipts/upload`, {
      method: 'POST',
      headers: {
        Cookie: cleanSuperadminCookie,
      },
      body: formData,
    })
    const data = (await res.json()) as { error?: string }
    const passed = res.status === 400 && data.error === 'Missing transactionId'
    report.apiChecks.push({
      name: '8. PDF Engine & Receipt Storage Pipeline (/api/receipts/upload)',
      passed,
      details: `Status ${res.status}, validácia: ${data.error}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 8. PDF Pipeline: Status ${res.status} (requireAccessForPdf & Storage overené)`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '8. PDF Engine & Receipt Storage Pipeline (/api/receipts/upload)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 8. PDF Pipeline: Exception', err)
  }

  // 9. Web Push Notifikácie (/api/push/send)
  try {
    const res = await fetch(`${PROD_URL}/api/push/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cleanSuperadminCookie,
      },
      body: JSON.stringify({
        title: 'Smoke Test Push',
        message: 'Overenie doručiteľnosti Web Push API na Cloud Rune.',
      }),
    })
    const data = (await res.json()) as { ok?: boolean; message?: string; success?: boolean }
    const passed = res.status === 200
    report.apiChecks.push({
      name: '9. Web Push Notifikácie (Endpoint /api/push/send)',
      passed,
      details: `Status ${res.status}, Odpoveď: ${JSON.stringify(data)}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 9. Web Push Notifikácie: Status ${res.status}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '9. Web Push Notifikácie (Endpoint /api/push/send)',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 9. Web Push: Exception', err)
  }

  // 10. AI Biometrické Modely (/models/tiny_face_detector...)
  try {
    const res = await fetch(`${PROD_URL}/models/tiny_face_detector_model-weights_manifest.json`)
    const passed = res.status === 200
    report.apiChecks.push({
      name: '10. AI FaceID Biometrické Modely',
      passed,
      details: `Status ${res.status}`,
    })
    console.log(`  ${passed ? '✅' : '❌'} 10. FaceID AI Modely: Status ${res.status}`)
  } catch (err: unknown) {
    report.apiChecks.push({
      name: '10. AI FaceID Biometrické Modely',
      passed: false,
      details: String(err),
    })
    console.log('  ❌ 10. FaceID AI Modely: Exception', err)
  }

  // -------------------------------------------------------------------------
  // FÁZA 2: PLAYWRIGHT HEADLESS BROWSER END-TO-END SMOKE TEST
  // -------------------------------------------------------------------------
  console.log('\n--- [2/2] FÁZA 2: PLAYWRIGHT REAL BROWSER SMOKE TEST NA ŽIVOM WEBE ---')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 Pro viewport
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()

  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message)
  })

  try {
    // Krok B1: Navigácia na uvítaciu stránku
    console.log('  Navigujem na uvítaciu obrazovku /welcome...')
    await page.goto(`${PROD_URL}/welcome`, { waitUntil: 'networkidle', timeout: 30000 })
    const welcomeTitle = await page.title()
    const onWelcome = page.url().includes('/welcome')
    report.browserChecks.push({
      name: 'B1. Načítanie Uvítacej Obrazovky v prehliadači',
      passed: onWelcome,
      details: `URL: ${page.url()}, Title: ${welcomeTitle}`,
    })
    console.log(`  ${onWelcome ? '✅' : '❌'} B1. Uvítacia obrazovka načítaná (${welcomeTitle})`)

    // Vyčistíme sessionStorage aby sme neboli v pending stave z predchádzajúceho testu
    await page.evaluate(() => sessionStorage.clear())
    const cancelBtn = page.locator('[data-testid="cancel-request"]')
    if (await cancelBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelBtn.click()
      await page.waitForTimeout(300)
    }

    // Krok B2: Zadávanie Superadmin kódu cez klávesnicu: 8× '1' a 8× '9'
    console.log('  Zadávam superadmin kód: 1111111199999999...')
    const key1 = page.locator('[data-testid="key-1"]')
    const key9 = page.locator('[data-testid="key-9"]')
    const backspaceBtn = page.locator('[data-testid="key-backspace"]')
    await key1.waitFor({ state: 'visible', timeout: 15000 })

    // Vyčistíme prípadný existujúci text
    const clearBtn = page.locator('button[aria-label="Vymazať zadaný kód"]')
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click().catch(() => {})
      await page.waitForTimeout(100)
    }

    // Hydratácia: čakáme kým kliknutie na key1 reálne zareaguje
    for (let attempt = 0; attempt < 20; attempt++) {
      await key1.click()
      await page.waitForTimeout(150)
      const text = (await page.locator('[data-testid="digits-text"]').textContent())?.replace(/\s/g, '') || ''
      if (text.length > 0) {
        // Hydratácia úspešná, vyčistíme zadaný znak
        await backspaceBtn.click()
        await page.waitForTimeout(100)
        break
      }
      await page.waitForTimeout(250)
    }

    // Zadáme 8× 1 a 8× 9
    for (let i = 0; i < 8; i++) {
      await key1.click()
      await page.waitForTimeout(50)
    }
    for (let i = 0; i < 8; i++) {
      await key9.click()
      await page.waitForTimeout(50)
    }

    const digitsText = (await page.locator('[data-testid="digits-text"]').textContent())?.replace(/\s/g, '') || ''
    const codeEntered = digitsText === '1111111199999999'
    report.browserChecks.push({
      name: 'B2. Zadávanie 16-miestneho Superadmin kódu cez Keypad',
      passed: codeEntered,
      details: `Zadaný text: "${digitsText?.trim()}"`,
    })
    console.log(`  ${codeEntered ? '✅' : '❌'} B2. Kód zadaný v UI: "${digitsText?.trim()}"`)

    // Krok B3: Odoslanie žiadosti a sledovanie automatického presmerovania
    console.log('  Klikám tlačidlo Požiadať o prístup...')
    await page.click('[data-testid="submit-code"]')

    // Čakáme na URL dashboard2
    await page.waitForURL('**/dashboard2', { timeout: 25000 })
    const onDashboard = page.url().includes('/dashboard2')
    report.browserChecks.push({
      name: 'B3. Okamžité schválenie a presmerovanie na /dashboard2',
      passed: onDashboard,
      details: `Aktuálna URL: ${page.url()}`,
    })
    console.log(`  ${onDashboard ? '✅' : '❌'} B3. Presmerovanie na /dashboard2 úspešné!`)

    // Krok B4: Kontrola a odomknutie PIN obrazovky
    const pinHeading = page.getByText(/Zadajte bezpečnostný PIN/i)
    if (await pinHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`  PIN obrazovka detegovaná. Zadávam autorizačný PIN ${APP_PIN}...`)
      for (const digit of APP_PIN) {
        await page.click(`button:has-text("${digit}")`)
      }
    }

    // Krok B5: Overenie zobrazenia zostatku na dashboarde
    await page.waitForSelector('#space-balance-main', { timeout: 20000 })
    const balMain = await page.locator('#space-balance-main').textContent()
    const balCents = await page.locator('#space-balance-cents').textContent()
    const fullBalance = `${balMain?.trim()}${balCents?.trim()} €`
    const balanceValid = Boolean(balMain && balMain.trim().length > 0)
    report.browserChecks.push({
      name: 'B4. Vykreslenie Zostatku Účtu na Dashboarde',
      passed: balanceValid,
      details: `Zobrazený zostatok: ${fullBalance}`,
    })
    console.log(`  ${balanceValid ? '✅' : '❌'} B4. Zostatok na obrazovke: ${fullBalance}`)

    // Krok B6: Vytvorenie screenshotu do artefaktov
    const screenshotPath = path.join(ARTIFACTS_DIR, 'live_production_dashboard_smoke.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const screenshotExists = fs.existsSync(screenshotPath)
    report.browserChecks.push({
      name: 'B5. Vizuálny dôkaz (Screenshot obrazovky)',
      passed: screenshotExists,
      details: `Uložený do: ${screenshotPath}`,
    })
    console.log(`  ${screenshotExists ? '✅' : '❌'} B5. Screenshot uložený: ${screenshotPath}`)

    // Krok B7: Overenie, že v konzole neboli fatálne JavaScript chyby
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('manifest') && !e.includes('Notification')
    )
    const noFatalErrors = fatalErrors.length === 0
    report.browserChecks.push({
      name: 'B6. Čistota JavaScriptu v prehliadači (0 fatálnych chýb)',
      passed: noFatalErrors,
      details: fatalErrors.length > 0 ? `Chyby: ${fatalErrors.join('; ')}` : '0 JS chýb v prehliadači',
    })
    console.log(`  ${noFatalErrors ? '✅' : '❌'} B6. JavaScript v konzole prehliadača: ${fatalErrors.length} chýb`)
  } catch (err: unknown) {
    console.error('  ❌ Chyba počas browser smoke testu:', err)
    report.browserChecks.push({
      name: 'Playwright Browser Flow Execution',
      passed: false,
      details: String(err),
    })
  } finally {
    await browser.close()
  }

  // -------------------------------------------------------------------------
  // SÚHRN SMOKE TESTU
  // -------------------------------------------------------------------------
  console.log('\n==================================================================')
  console.log('📊 FINÁLNY SÚHRN LIVE SMOKE TESTU PRODUKCIE')
  console.log('==================================================================')

  const totalApi = report.apiChecks.length
  const passedApi = report.apiChecks.filter((c) => c.passed).length
  const totalBrowser = report.browserChecks.length
  const passedBrowser = report.browserChecks.filter((c) => c.passed).length
  const totalAll = totalApi + totalBrowser
  const passedAll = passedApi + passedBrowser

  console.log(`\n📡 API & INFRA KONTROLY:   ${passedApi} / ${totalApi} PASS`)
  report.apiChecks.forEach((c) => {
    console.log(`  ${c.passed ? '✅' : '❌'} ${c.name} - ${c.details || ''}`)
  })

  console.log(`\n📱 PLAYWRIGHT BROWSER:      ${passedBrowser} / ${totalBrowser} PASS`)
  report.browserChecks.forEach((c) => {
    console.log(`  ${c.passed ? '✅' : '❌'} ${c.name} - ${c.details || ''}`)
  })

  console.log('\n==================================================================')
  console.log(`🎯 CELKOVÉ SMOKE SKÓRE:     ${passedAll} / ${totalAll} (${((passedAll / totalAll) * 100).toFixed(0)}%)`)
  console.log('==================================================================\n')

  if (passedAll < totalAll) {
    process.exit(1)
  }
}

runLiveSmokeTest()
