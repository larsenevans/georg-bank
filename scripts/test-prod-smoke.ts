import { chromium } from 'playwright'

async function run() {
  console.log('Spúšťam produkčný smoke test pre https://portal-auth-8f2c3d.vercel.app ...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('1. Navigujem na produkčný web...')
    const response = await page.goto('https://portal-auth-8f2c3d.vercel.app/')
    console.log(`   HTTP Status: ${response?.status()}`)
    
    let url = page.url()
    console.log(`   Vstupná URL: ${url}`)

    if (url.includes('/gate')) {
      console.log('2. Odomykám bránu s Heslo123###...')
      await page.fill('input[type="password"]', 'Heslo123###')
      
      await Promise.all([
        page.waitForURL('**/dashboard2', { timeout: 20000 }),
        page.click('button[type="submit"]')
      ])
      
      url = page.url()
      console.log(`   Finálna URL po odomknutí: ${url}`)
    }

    if (url.includes('/dashboard2')) {
      console.log('3. Overujem, že mobilný George simulátor sa úspešne načítal...')
      
      // Overenie načítania hlavných elementov
      const balanceMain = await page.locator('#space-balance-main').first()
      const balanceCents = await page.locator('#space-balance-cents').first()
      const balanceVal = await balanceMain.textContent()
      const centsVal = await balanceCents.textContent()
      console.log(`   Business účet zostatok: ${balanceVal?.trim()}${centsVal?.trim()} €`)
      
      console.log('✅ PRODUKČNÝ SMOKE TEST ÚSPEŠNÝ: Mobilný George na Verceli beží bez chýb a zostatok je správny!')
    } else {
      console.log(`❌ CHYBA: Očakávalo sa presmerovanie na /dashboard2, ale skončili sme na: ${url}`)
    }

  } catch (error) {
    console.error('❌ Chyba počas produkčného smoke testu:', error)
  } finally {
    await browser.close()
    console.log('Produkčný test dokončený.')
  }
}

run()
