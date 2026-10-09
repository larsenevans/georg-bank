import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import robotsDynamic from '../app/robots'

export async function runSecurityStealthRegressionTest() {
  console.log('--- [1/4] Testovanie Anti-Fingerprinting (Nápad 2) ---')

  const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx')
  const layoutContent = fs.readFileSync(layoutPath, 'utf-8')
  assert.ok(!layoutContent.includes('v0.app'), 'app/layout.tsx nesmie obsahovať reťazec "v0.app"')
  assert.ok(!layoutContent.includes('generator:'), 'app/layout.tsx nesmie definovať generator meta tag')

  const nextConfigPath = path.join(process.cwd(), 'next.config.mjs')
  const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf-8')
  assert.ok(
    nextConfigContent.includes('poweredByHeader: false'),
    'next.config.mjs musí obsahovať "poweredByHeader: false" pre vypnutie X-Powered-By'
  )

  console.log('--- [2/4] Testovanie public/robots.txt & Blokovanie AI Botov (Nápad 1) ---')

  const robotsPath = path.join(process.cwd(), 'public', 'robots.txt')
  const robotsContent = fs.readFileSync(robotsPath, 'utf-8')

  const requiredAiBots = [
    '*',
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-Web',
    'CCBot',
    'Bytespider',
    'Google-Extended',
    'PerplexityBot',
  ]

  for (const bot of requiredAiBots) {
    const userAgentRegex = new RegExp(`User-agent:\\s*${bot.replace('*', '\\*')}`, 'i')
    assert.ok(userAgentRegex.test(robotsContent), `public/robots.txt musí blokovať bota: ${bot}`)
  }
  assert.ok(robotsContent.includes('Disallow: /'), 'public/robots.txt musí obsahovať "Disallow: /"')

  console.log('--- [3/4] Testovanie Dynamického app/robots.ts (Nápad 1) ---')

  const dynamicRobots = robotsDynamic()
  const rules = Array.isArray(dynamicRobots.rules) ? dynamicRobots.rules : [dynamicRobots.rules]

  for (const bot of requiredAiBots) {
    const rule = rules.find((r) => r && r.userAgent === bot)
    assert.ok(rule, `app/robots.ts musí generovať pravidlo pre: ${bot}`)
    assert.strictEqual(rule?.disallow, '/', `Pravidlo pre ${bot} musí mať disallow: '/'`)
  }

  console.log('--- [4/4] Testovanie X-Robots-Tag Direktív v next.config.mjs a proxy.ts (Nápad 1) ---')

  const requiredDirectives = [
    'noindex',
    'nofollow',
    'noarchive',
    'nosnippet',
    'noimageindex',
    'notranslate',
    'noodp',
    'noydir',
  ]

  for (const dir of requiredDirectives) {
    assert.ok(
      nextConfigContent.includes(dir),
      `next.config.mjs X-Robots-Tag musí obsahovať direktívu: ${dir}`
    )
  }

  console.log('--- [5/5] Testovanie Scanner Trap & Silent Drop pre Probes (Nápad 3) ---')

  const { isScannerProbe, proxy } = await import('../proxy')
  const { NextRequest } = await import('next/server')

  const sampleProbes = [
    '/wp-admin',
    '/wp-admin/index.php',
    '/wp-login.php',
    '/.env',
    '/.env.local',
    '/.env.production',
    '/phpmyadmin',
    '/phpMyAdmin/index.php',
    '/.git',
    '/.git/config',
    '/.git/HEAD',
    '/xmlrpc.php',
    '/actuator/health',
    '/.aws/credentials',
    '/.ssh/id_rsa',
    '/exploit.php',
    '/test.asp',
    '/dump.sql',
    '/backup.tar.gz',
    '/welcome/../.env',
    '/%2e%2e/etc/passwd',
  ]

  for (const probe of sampleProbes) {
    assert.strictEqual(
      isScannerProbe(probe),
      true,
      `isScannerProbe('${probe}') musí vrátiť true`
    )

    const probeReq = new NextRequest(`https://george.test${probe}`)
    const probeRes = proxy(probeReq)

    assert.strictEqual(probeRes.status, 404, `Sonda '${probe}' musí dostať HTTP 404 (nie redirect ani 200)`)
    
    const bodyText = await probeRes.text()
    assert.ok(bodyText.includes('404 Not Found'), `Odpoveď pre '${probe}' musí obsahovať '404 Not Found'`)
    assert.ok(bodyText.includes('nginx'), `Odpoveď pre '${probe}' musí obsahovať anonymné 'nginx' maskovanie`)
    assert.ok(!bodyText.includes('George'), `Odpoveď pre '${probe}' nesmie prezradiť brand 'George'`)
    assert.ok(!bodyText.includes('Internetbanking'), `Odpoveď pre '${probe}' nesmie prezradiť 'Internetbanking'`)
    assert.ok(!bodyText.includes('Next.js'), `Odpoveď pre '${probe}' nesmie prezradiť 'Next.js'`)

    const robotsHeader = probeRes.headers.get('X-Robots-Tag')
    assert.ok(robotsHeader?.includes('noindex'), `Odpoveď pre '${probe}' musí mať X-Robots-Tag noindex`)
  }

  // Overenie, že legitímne trasy George bankingu NIE SÚ blokované
  const legitimateRoutes = [
    '/',
    '/welcome',
    '/gate',
    '/dashboard2',
    '/dashboard3',
    '/pohyby',
    '/api/access/status',
    '/api/auth/guest',
    '/api/transactions',
    '/api/receipts',
    '/api/export/pdf',
    '/api/health',
    '/robots.txt',
  ]

  for (const route of legitimateRoutes) {
    assert.strictEqual(
      isScannerProbe(route),
      false,
      `Legitímna trasa '${route}' NESMIE byť vyhodnotená ako scanner probe`
    )
  }

  console.log('✅ [Security-Stealth-Test] Všetky kontroly pre Anti-Fingerprinting, AI Bot Blokovanie aj Scanner Trap úspešne prešli!')
  return { success: true }
}

runSecurityStealthRegressionTest()
