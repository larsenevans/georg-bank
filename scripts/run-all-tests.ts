import path from 'path'
import { spawnSync } from 'child_process'
import { ESLint } from 'eslint'

interface TestItem {
  id: string
  name: string
  category: 'Auth & Security' | 'Access & Session Contract' | 'Banking & Limits' | 'Receipts & PDFs' | 'System & Health' | 'Code Quality & Lint' | 'E2E Integration'
  file?: string
}

const allUnitTests: TestItem[] = [
  // 1. Auth & Security
  { id: 'guest-auth', name: 'Guest Auth Token Contract & Expiry', category: 'Auth & Security', file: './guest-auth.test.ts' },
  { id: 'app-pin', name: 'App PIN & Biometrics FaceID State', category: 'Auth & Security', file: './app-pin.test.ts' },

  // 2. Access & Session Contract
  { id: 'access-flow', name: 'Access Flow Logic, Token & Quotas', category: 'Access & Session Contract', file: './access-flow.test.ts' },
  { id: 'access-regression', name: 'CONTRACT-1+1 Regression Lock (1 Platba + 1 PDF = End)', category: 'Access & Session Contract', file: './access-flow.regression.test.ts' },
  { id: 'superadmin-regression', name: 'Superadmin God-Mode Bypass (1111111199999999)', category: 'Access & Session Contract', file: './superadmin.regression.test.ts' },
  { id: 'cron-gcs-retention', name: 'Cron Cleanup (6h vs 30d) & GCS PDF Retention', category: 'Access & Session Contract', file: './cron-cleanup-gcs-upload.test.ts' },
  { id: 'logout-redirect', name: 'Logout Redirection to Homepage (/) & Cookie Reset', category: 'Access & Session Contract', file: './logout-redirect.test.ts' },
  { id: 'push-notifications', name: 'Web Push Notifications & VAPID Regression (Android & iOS)', category: 'Access & Session Contract', file: './push-notifications.regression.test.ts' },

  // 3. Banking & Limits
  { id: 'daily-limit', name: 'Daily Payment Limit & Velocity Rules', category: 'Banking & Limits', file: './daily-payment-limit.test.ts' },
  { id: 'topup-rules', name: 'Topup & Account Deposit Rules', category: 'Banking & Limits', file: './topup-rules.test.ts' },
  { id: 'transactions-balance', name: 'Transactions & Balance Refresh Stream', category: 'Banking & Limits', file: './transactions-balance-refresh.test.ts' },
  { id: 'random-balance', name: 'Random Balance & Slovak Names Generator (1000 vzoriek)', category: 'Banking & Limits', file: './random-balance.test.ts' },
  { id: 'qr-50-scenarios', name: 'QR Scanner & Decoders (58 Scenárov SPAYD, EPC, PayBySquare)', category: 'Banking & Limits', file: './qr-50-scenarios.test.ts' },

  // 4. Receipts & PDFs
  { id: 'statement-generator', name: 'Monthly Statement Generator Engine', category: 'Receipts & PDFs', file: './statement-generator.test.ts' },
  { id: 'pdf-generator', name: 'PDF Generator & Storage Sync Pipeline', category: 'Receipts & PDFs', file: './pdf-generator.test.ts' },
  { id: 'payment-html', name: 'Payment HTML Receipt Validation & Metadata', category: 'Receipts & PDFs', file: './payment-html.test.ts' },
  { id: 'receipt-format', name: 'Receipt Format Preference & PDF Switch (PDF vs HTML)', category: 'Receipts & PDFs', file: './receipt-format.test.ts' },

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
  const skipLint = args.includes('--skip-lint')
  const showHelp = args.includes('--help') || args.includes('-h')

  if (showHelp) {
    console.log(`
Použitie:
  npm run test:all              Spustí všetky Unit (13 testov) a za tým Lint testy kódu
  npm run test:all -- --e2e     Spustí unit testy + lint + Playwright E2E testy
  npm run test:all -- --skip-lint Spustí iba unit testy bez lintu
    `)
    process.exit(0)
  }

  console.log('========================================================================')
  console.log('🚀 SPUSTENIE KOMPLETNEJ SADY TESTOV: UNIT + LINT (GRO-KAN BANKING)')
  console.log('========================================================================\n')

  const startTime = Date.now()
  const results: Result[] = []
  let failedCount = 0

  // 1. In-process Unit & Regression runner
  console.log(`📦 [1/2] Spúšťam kompletnú sadu Unit a Regresných testov (${allUnitTests.length} testov)...`)
  for (const test of allUnitTests) {
    const t0 = Date.now()
    try {
      if (test.file) {
        await import(test.file)
      }
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

  // 2. ESLint In-process Code Quality Check
  if (!skipLint) {
    console.log('\n🔍 [2/2] Spúšťam ESLint kontrolu kvality a syntaxe...')
    const t0 = Date.now()
    try {
      const eslint = new ESLint()
      const lintResults = await eslint.lintFiles(['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'scripts/**/*.ts'])
      
      let totalErrors = 0
      let totalWarnings = 0
      const errorLines: string[] = []

      for (const res of lintResults) {
        if (res.errorCount > 0 || res.warningCount > 0) {
          totalErrors += res.errorCount
          totalWarnings += res.warningCount
          for (const m of res.messages) {
            const relPath = path.relative(process.cwd(), res.filePath)
            errorLines.push(`${relPath}:${m.line}:${m.column} [${m.severity === 2 ? 'ERROR' : 'WARN'}] ${m.message} (${m.ruleId})`)
          }
        }
      }

      const durationMs = Date.now() - t0
      const isSuccess = totalErrors === 0

      if (isSuccess) {
        console.log(`  ✅ PASS [Code Quality & Lint     ] ESLint (0 errors, ${totalWarnings} warnings) (${durationMs}ms)`)
        results.push({
          name: `ESLint Code Quality (0 errors, ${totalWarnings} warnings)`,
          category: 'Code Quality & Lint',
          success: true,
          durationMs,
        })
      } else {
        console.log(`  ❌ FAIL [Code Quality & Lint     ] ESLint (${totalErrors} errors, ${totalWarnings} warnings) (${durationMs}ms)`)
        results.push({
          name: `ESLint Code Quality (${totalErrors} errors)`,
          category: 'Code Quality & Lint',
          success: false,
          durationMs,
          errorOutput: errorLines.join('\n'),
        })
        failedCount++
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - t0
      const msg = err instanceof Error ? err.stack || err.message : String(err)
      console.log(`  ❌ FAIL [Code Quality & Lint     ] ESLint Runner Error (${durationMs}ms)`)
      results.push({ name: 'ESLint Execution', category: 'Code Quality & Lint', success: false, durationMs, errorOutput: msg })
      failedCount++
    }
  }

  // 3. Voliteľné E2E testy
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
  console.log('📊 SÚHRNNÝ VÝSLEDOK VŠETKÝCH TESTOV (UNIT + LINT)')
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
    console.log('🎉 VŠETKY UNIT AJ LINT TESTY ÚSPEŠNE PREŠLI NA 100%!')
    process.exit(0)
  }
}

runAll().catch((err) => {
  console.error('Fatal error during test run:', err)
  process.exit(1)
})
