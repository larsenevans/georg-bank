import path from 'path'
import { spawnSync } from 'child_process'

interface TestItem {
  id: string
  name: string
  category: 'Auth & Security' | 'Access & Session Contract' | 'Banking & Limits' | 'Receipts & PDFs' | 'System & Health' | 'E2E Integration'
  file: string
  isE2e?: boolean
}

const allTests: TestItem[] = [
  // 1. Auth & Security
  { id: 'guest-auth', name: 'Guest Auth Token Contract & Expiry', category: 'Auth & Security', file: './guest-auth.test.ts' },
  { id: 'app-pin', name: 'App PIN & Biometrics FaceID State', category: 'Auth & Security', file: './app-pin.test.ts' },

  // 2. Access & Session Contract
  { id: 'access-flow', name: 'Access Flow Logic, Token & Quotas', category: 'Access & Session Contract', file: './access-flow.test.ts' },
  { id: 'access-regression', name: 'CONTRACT-1+1 Regression Lock (1 Platba + 1 PDF = End)', category: 'Access & Session Contract', file: './access-flow.regression.test.ts' },

  // 3. Banking & Limits
  { id: 'daily-limit', name: 'Daily Payment Limit & Velocity Rules', category: 'Banking & Limits', file: './daily-payment-limit.test.ts' },
  { id: 'topup-rules', name: 'Topup & Account Deposit Rules', category: 'Banking & Limits', file: './topup-rules.test.ts' },
  { id: 'transactions-balance', name: 'Transactions & Balance Refresh Stream', category: 'Banking & Limits', file: './transactions-balance-refresh.test.ts' },
  { id: 'random-balance', name: 'Random Balance & Slovak Names Generator (1000 vzoriek)', category: 'Banking & Limits', file: './random-balance.test.ts' },

  // 4. Receipts & PDFs
  { id: 'statement-generator', name: 'Monthly Statement Generator Engine', category: 'Receipts & PDFs', file: './statement-generator.test.ts' },
  { id: 'pdf-generator', name: 'PDF Generator & Storage Sync Pipeline', category: 'Receipts & PDFs', file: './pdf-generator.test.ts' },
  { id: 'payment-html', name: 'Payment HTML Receipt Validation & Metadata', category: 'Receipts & PDFs', file: './payment-html.test.ts' },

  // 5. System & Health
  { id: 'health-readiness', name: 'Health & Readiness Cloud Run Probe', category: 'System & Health', file: './health-readiness.test.ts' },
  { id: 'dashboard2-assets', name: 'Dashboard Assets, Proxy & Route Guards', category: 'System & Health', file: './dashboard2-assets.test.ts' },
]

interface Result {
  name: string
  category: string
  success: boolean
  durationMs: number
  errorOutput?: string
}

async function runAll() {
  const args = process.argv.slice(2)
  const runE2e = args.includes('--e2e') || args.includes('-e')
  const showHelp = args.includes('--help') || args.includes('-h')

  if (showHelp) {
    console.log(`
Použitie:
  npm run test:all           Spustí všetky Unit, Regresné, Bezpečnostné a Bankové testy (13 testov)
  npm run test:all -- --e2e  Spustí unit testy + Playwright E2E testy
  npm run test:unit          Spustí samotné unit testy
    `)
    process.exit(0)
  }

  console.log('========================================================================')
  console.log('🚀 SPUSTENIE KOMPLETNEJ SADY TESTOV (GRO-KAN BANKING SUITE)')
  console.log('========================================================================\n')

  const startTime = Date.now()
  const results: Result[] = []
  let failedCount = 0

  // 1. In-process Unit & Regression runner
  console.log(`📦 Spúšťam kompletnú sadu Unit a Regresných testov (${allTests.length} testov)...`)
  for (const test of allTests) {
    const t0 = Date.now()
    try {
      // Execute the test module
      await import(test.file)
      const durationMs = Date.now() - t0
      console.log(`  ✅ PASS [${test.category.padEnd(25)}] ${test.name} (${durationMs}ms)`)
      results.push({ name: test.name, category: test.category, success: true, durationMs })
    } catch (err: unknown) {
      const durationMs = Date.now() - t0
      const msg = err instanceof Error ? err.stack || err.message : String(err)
      console.log(`  ❌ FAIL [${test.category.padEnd(25)}] ${test.name} (${durationMs}ms)`)
      results.push({ name: test.name, category: test.category, success: false, durationMs, errorOutput: msg })
      failedCount++
    }
  }

  // 2. Voliteľné E2E testy
  if (runE2e) {
    console.log('\n🌐 [E2E] Spúšťam Playwright E2E testy...')
    const t0 = Date.now()
    const isWindows = process.platform === 'win32'
    const cmd = isWindows ? 'npx.cmd' : 'npx'
    const e2eRes = spawnSync(cmd, ['playwright', 'test'], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
      shell: isWindows,
      env: { ...process.env },
    })
    const e2eDuration = Date.now() - t0
    if (e2eRes.status === 0) {
      results.push({ name: 'Playwright E2E Tests', category: 'E2E Integration', success: true, durationMs: e2eDuration })
    } else {
      results.push({ name: 'Playwright E2E Tests', category: 'E2E Integration', success: false, durationMs: e2eDuration, errorOutput: `Playwright exit code: ${e2eRes.status}` })
      failedCount++
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n========================================================================')
  console.log('📊 SÚHRNNÝ VÝSLEDOK VŠETKÝCH TESTOV')
  console.log('========================================================================')
  console.log(`⏱️  Celkový čas: ${totalTime}s`)
  console.log(`✅ Úspešné: ${results.length - failedCount} / ${results.length}`)
  console.log(`❌ Neúspešné: ${failedCount}`)
  console.log('------------------------------------------------------------------------')

  for (const r of results) {
    const icon = r.success ? '✅' : '❌'
    console.log(`${icon} [${r.category.padEnd(25)}] ${r.name.padEnd(55)} (${r.durationMs}ms)`)
    if (!r.success && r.errorOutput) {
      console.log(`   ⚠️ Chyba:\n${r.errorOutput.split('\n').map(l => '      ' + l).join('\n')}`)
    }
  }

  console.log('========================================================================\n')

  if (failedCount > 0) {
    console.error(`❌ Celkový výsledok: NIEKTORÉ TESTY ZLYHALI (${failedCount} chýb).`)
    process.exit(1)
  } else {
    console.log('🎉 VŠETKY TESTY A PRAVIDLÁ ÚSPEŠNE PREŠLI NA 100%!')
    process.exit(0)
  }
}

runAll().catch((err) => {
  console.error('Fatal error during test run:', err)
  process.exit(1)
})
