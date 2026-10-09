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

  console.log('--- [6/7] Testovanie Blokovania Automatizovaných User-Agentov (Nápad 4) ---')

  const { isBlockedUserAgent, isKnownAppRoute } = await import('../proxy')

  const maliciousUserAgents = [
    'sqlmap/1.5#stable (https://sqlmap.org)',
    'Mozilla/5.0 (compatible; Nikto/2.1.6)',
    'WPScan v3.8.22',
    'DirBuster-1.0-RC1',
    'gobuster/3.5',
    'masscan/1.3.2',
    'python-requests/2.31.0',
    'Python-urllib/3.10',
    'Mozilla/5.0 (compatible; zgrab/0.x)',
    'nuclei v3.1.0',
    'Nmap Scripting Engine',
    'Acunetix-Product',
  ]

  for (const ua of maliciousUserAgents) {
    assert.strictEqual(
      isBlockedUserAgent(ua),
      true,
      `isBlockedUserAgent('${ua}') musí vrátiť true`
    )

    // Overenie, že aj pri požiadavke na legitímnu trasu (/welcome alebo /) je scanner s takýmto UA okamžite zahodený
    const req = new NextRequest('https://george.test/welcome', {
      headers: { 'user-agent': ua },
    })
    const res = proxy(req)
    assert.strictEqual(res.status, 404, `Požiadavka od scanner bota '${ua}' musí dostať HTTP 404`)
    const text = await res.text()
    assert.ok(text.includes('404 Not Found') && text.includes('nginx'), 'Scanner bot musí dostať iba generickú Nginx 404')
    assert.ok(!text.includes('George'), 'Scanner bot nesmie vidieť George banking')
  }

  // Legitímne User-Agenty (bežný prehliadač, Google health probe) NESMÚ byť blokované
  const legitimateUserAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'GoogleHC/1.0',
  ]

  for (const ua of legitimateUserAgents) {
    assert.strictEqual(
      isBlockedUserAgent(ua),
      false,
      `Legitímny User-Agent '${ua}' NESMIE byť blokovaný`
    )
  }

  console.log('--- [7/7] Testovanie Total Blank Stealth Fallback pre Neznáme Trasy (Nápad 5) ---')

  const unknownRoutes = [
    '/unknown-secret-target',
    '/admin-panel-2026',
    '/private-portal',
    '/api/v99/fake-endpoint',
    '/test-page-xyz',
  ]

  for (const unknownRoute of unknownRoutes) {
    assert.strictEqual(
      isKnownAppRoute(unknownRoute),
      false,
      `isKnownAppRoute('${unknownRoute}') musí vrátiť false`
    )

    const unknownReq = new NextRequest(`https://george.test${unknownRoute}`)
    const unknownRes = proxy(unknownReq)

    assert.strictEqual(unknownRes.status, 404, `Neznáma trasa '${unknownRoute}' musí vrátiť HTTP 404`)
    const body = await unknownRes.text()
    assert.ok(body.includes('404 Not Found') && body.includes('nginx'), 'Neznáma trasa musí vrátiť generický Nginx 404')
    assert.ok(!body.includes('George') && !body.includes('Internetbanking'), 'Neznáma trasa nesmie odhaliť identitu bankingu')
    assert.ok(!body.includes('Next.js'), 'Neznáma trasa nesmie odhaliť Next.js stack')
  }

  // Overenie existencie app/not-found.tsx
  const notFoundPath = path.join(process.cwd(), 'app', 'not-found.tsx')
  assert.ok(fs.existsSync(notFoundPath), 'app/not-found.tsx musí existovať pre čistý fallback')
  const notFoundContent = fs.readFileSync(notFoundPath, 'utf-8')
  assert.ok(!notFoundContent.includes('George'), 'app/not-found.tsx nesmie obsahovať slovo "George"')
  assert.ok(!notFoundContent.includes('Internetbanking'), 'app/not-found.tsx nesmie obsahovať "Internetbanking"')

  console.log('✅ [Security-Stealth-Test] Všetkých 5 opatrení pre Maximum Security: Invisible Stealth / No-Index úspešne prešlo!')
  return { success: true }
}

runSecurityStealthRegressionTest()

