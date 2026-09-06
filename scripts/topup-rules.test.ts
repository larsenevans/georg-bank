import {
  MANUAL_TOPUP_BLOCKED_MESSAGE,
  MANUAL_TOPUP_DISABLED,
  MANUAL_TOPUP_ENABLED_MESSAGE,
  canAutoRefillNow,
  isManualTopupType,
} from '../lib/topup-rules'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(MANUAL_TOPUP_DISABLED === false, 'manual top-up should be unlocked by default')
assert(
  MANUAL_TOPUP_BLOCKED_MESSAGE.includes('zakázané'),
  'blocked message should describe disabled state'
)
assert(
  MANUAL_TOPUP_ENABLED_MESSAGE.includes('povolené'),
  'enabled message should describe sandbox unlock'
)

for (const type of ['deposit', 'incoming', 'topup', 'top-up', 'DEPOSIT']) {
  assert(isManualTopupType(type), `isManualTopupType should match ${type}`)
}

assert(isManualTopupType('outgoing') === false, 'outgoing is not manual top-up')
assert(isManualTopupType('transfer') === false, 'transfer is not manual top-up')

const recentOutgoing = new Date(Date.now() - 60_000).toISOString()
const oldRefill = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
assert(
  canAutoRefillNow(oldRefill, recentOutgoing) === false,
  'outgoing payment within 24h blocks auto-refill'
)

console.log('topup-rules.test.ts: all assertions passed')
