import {
  DAILY_PAYMENT_LIMIT_ENABLED,
  dailyLimitSnapshot,
  exceedsDailyPaymentLimit,
} from '../lib/daily-payment-limit'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(DAILY_PAYMENT_LIMIT_ENABLED === false, 'daily payment limit should be disabled')

const snapshot = dailyLimitSnapshot(500_000)
assert(snapshot.enabled === false, 'snapshot.enabled should be false')
assert(snapshot.limitEur === null, 'snapshot.limitEur should be null when disabled')
assert(snapshot.remainingEur === null, 'snapshot.remainingEur should be null when disabled')
assert(snapshot.usedEur === 5000, 'snapshot.usedEur should reflect used cents')

assert(
  exceedsDailyPaymentLimit(10_000_000, 5_000_000) === false,
  'disabled limit must not block outgoing payments'
)

console.log('daily-payment-limit.test.ts: all assertions passed')
