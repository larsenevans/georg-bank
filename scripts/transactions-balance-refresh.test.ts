import {
  pickDemoBankAccount,
  resolveSpaceBalanceFromApi,
  DEMO_ACCOUNT_NUMBER,
} from '../lib/demo-user'
import {
  AUTO_REFILL_COOLDOWN_MS,
  canAutoRefillNow,
  msUntilAutoRefillAllowed,
} from '../lib/topup-rules'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

// --- demo account picker ---------------------------------------------------

const guestAccount = {
  accountNumber: 'SK3109000000005012345679',
  displayName: 'Business účet',
  productLabel: 'Business účet',
  accountType: 'checking',
  balance: 1_157_645_0,
}
const demoAccount = {
  accountNumber: DEMO_ACCOUNT_NUMBER,
  displayName: 'Osobný účet',
  accountType: 'checking',
  balance: 9_000,
}

const picked = pickDemoBankAccount([guestAccount, demoAccount])
assert(picked?.accountNumber === guestAccount.accountNumber, 'should pick Business-labeled guest account over demo IBAN')

const singleGuest = pickDemoBankAccount([guestAccount])
assert(singleGuest?.accountNumber === guestAccount.accountNumber, 'single returned account wins')

// --- balance resolution after payment --------------------------------------

const afterPayment = resolveSpaceBalanceFromApi(
  [{ accountNumber: DEMO_ACCOUNT_NUMBER, balance: 10_000 }],
  90
)
assert(afterPayment === 90, 'latest txn balanceAfter (90 €) should win over stale account row (100 €)')

const fromAccountOnly = resolveSpaceBalanceFromApi(
  [{ accountNumber: DEMO_ACCOUNT_NUMBER, balance: 8_850_00 }],
  undefined
)
assert(fromAccountOnly === 8_850, 'falls back to account balance when no txn ledger')

// --- auto-refill cooldown blocks after outgoing payment --------------------

const recentOutgoing = new Date(Date.now() - 60_000).toISOString()
const oldRefill = new Date(Date.now() - AUTO_REFILL_COOLDOWN_MS - 60_000).toISOString()

assert(
  canAutoRefillNow(oldRefill, recentOutgoing) === false,
  'recent outgoing payment must block auto-refill even when last refill was >24h ago'
)

assert(
  msUntilAutoRefillAllowed(oldRefill, recentOutgoing) > 0,
  'cooldown wait should be positive while outgoing payment is within 24h'
)

assert(
  canAutoRefillNow(null, null) === true,
  'no refill and no outgoing → refill allowed'
)

const ensureDb = readFileSync(resolve('scripts/ensure-db.ts'), 'utf8')
assert(
  !ensureDb.includes('GREATEST'),
  'ensure-db must not restore spent balances with GREATEST(balance, seed)'
)

console.log('transactions-balance-refresh.test.ts: all assertions passed')
