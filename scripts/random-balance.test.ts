import assert from 'node:assert/strict'
import {
  generateRandomLoginBalanceCents,
  generateRandomLoginBalanceEur,
  MIN_LOGIN_BALANCE_EUR,
  MAX_LOGIN_BALANCE_EUR,
} from '../lib/random-balance'
import { DEMO_DEFAULT_USER_NAME } from '../lib/demo-user'
import { GUEST_USER_NAME } from '../lib/guest-auth'

assert.equal(DEMO_DEFAULT_USER_NAME, 'Business účet L', 'DEMO_DEFAULT_USER_NAME must be Business účet L')
assert.equal(GUEST_USER_NAME, 'Business účet L', 'GUEST_USER_NAME must be Business účet L')

for (let i = 0; i < 1000; i++) {
  const cents = generateRandomLoginBalanceCents()
  const eur = generateRandomLoginBalanceEur()

  assert.ok(cents >= 467545, `cents ${cents} >= 467545`)
  assert.ok(cents <= 1587320, `cents ${cents} <= 1587320`)

  assert.ok(eur >= MIN_LOGIN_BALANCE_EUR, `eur ${eur} >= ${MIN_LOGIN_BALANCE_EUR}`)
  assert.ok(eur <= MAX_LOGIN_BALANCE_EUR, `eur ${eur} <= ${MAX_LOGIN_BALANCE_EUR}`)

  // Check 2 decimal precision
  const decimals = (eur.toString().split('.')[1] || '').length
  assert.ok(decimals <= 2, `decimals ${decimals} <= 2`)
}

console.log('random-balance.test.ts: all 1000 random samples and names passed!')
