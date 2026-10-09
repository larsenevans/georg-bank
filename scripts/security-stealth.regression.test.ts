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

  const proxyPath = path.join(process.cwd(), 'proxy.ts')
  const proxyContent = fs.readFileSync(proxyPath, 'utf-8')

  for (const dir of requiredDirectives) {
    assert.ok(
      proxyContent.includes(dir),
      `proxy.ts X-Robots-Tag musí obsahovať direktívu: ${dir}`
    )
  }

  console.log('✅ [Security-Stealth-Test] Všetky kontroly pre Anti-Fingerprinting a AI Bot Blokovanie úspešne prešli!')
  return { success: true }
}

runSecurityStealthRegressionTest()
