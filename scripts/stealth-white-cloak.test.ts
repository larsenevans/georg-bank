/**
 * Unit & Static verification for Stealth White Cloak & Inactivity Screensaver
 * Run: node ./node_modules/tsx/dist/cli.mjs scripts/stealth-white-cloak.test.ts
 */
import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')
let failed = 0

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('✗', msg)
    failed++
  } else {
    console.log('✓', msg)
  }
}

console.log('=== [Stealth White Cloak & Screensaver Verification] ===')

// 1. Component existence & export
const componentPath = path.join(root, 'components/stealth-white-cloak.tsx')
assert(fs.existsSync(componentPath), 'components/stealth-white-cloak.tsx exists')

const componentSrc = fs.readFileSync(componentPath, 'utf8')
assert(
  /export function StealthWhiteCloak\(/.test(componentSrc),
  'exports StealthWhiteCloak component'
)

// 2. Pure white overlay with high z-index and transitions
assert(/bg-white/.test(componentSrc), 'uses 100% white camouflage background (bg-white)')
assert(/z-99999/.test(componentSrc), 'uses top-level overlay z-index (z-99999)')
assert(/transition-opacity/.test(componentSrc), 'has smooth opacity fade transition')

// 3. Triple-tap unlock logic (3 taps within 500ms)
assert(/tapCountRef\.current \+= 1/.test(componentSrc), 'tracks consecutive taps')
assert(/tapCountRef\.current >= 3/.test(componentSrc), 'unlocks strictly on triple-tap (>= 3)')
assert(/500/.test(componentSrc), 'uses 500ms max threshold between taps')

// 4. Inactivity screensaver (30 seconds default)
assert(/timeoutMs = 30000/.test(componentSrc), 'default inactivity timer is 30,000ms (30s)')
assert(/clearTimeout/.test(componentSrc), 'cleans up timers properly')
assert(
  /pointerdown/.test(componentSrc) && /keydown/.test(componentSrc) && /scroll/.test(componentSrc),
  'resets 30s timer on user activity (pointerdown, keydown, scroll, touchstart)'
)

// 5. Verification on /welcome route
const welcomePagePath = path.join(root, 'app/welcome/page.tsx')
assert(fs.existsSync(welcomePagePath), 'app/welcome/page.tsx exists')

const welcomeSrc = fs.readFileSync(welcomePagePath, 'utf8')
assert(
  /import { StealthWhiteCloak } from '@\/components\/stealth-white-cloak'/.test(welcomeSrc),
  'app/welcome/page.tsx imports StealthWhiteCloak'
)
assert(
  /<StealthWhiteCloak/.test(welcomeSrc),
  'app/welcome/page.tsx wraps screen with StealthWhiteCloak'
)
assert(
  /timeoutMs=\{30000\}/.test(welcomeSrc),
  'app/welcome/page.tsx configures 30s screensaver timeout'
)

if (failed > 0) {
  console.error(`\n❌ ${failed} checks failed.`)
  throw new Error(`${failed} checks failed in stealth-white-cloak.test.ts`)
} else {
  console.log('\n🎉 Všetky testy Stealth White Cloak úspešne prešli na 100%!')
}

