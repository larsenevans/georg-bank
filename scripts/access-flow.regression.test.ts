import {
  isValidAccessCode,
  generateSessionToken,
  hashIp,
  formatAccessCode,
  isAccessRequestExpired,
  ACCESS_REQUEST_MAX_PER_HOUR,
  isTrustedTestMode,
  getAccessRequestQuota,
} from '@/lib/access-flow'
import {
  shouldScheduleLogout,
  computeLogoutAt,
  buildEndSessionValues,
  getConsumedActionError,
} from '@/lib/access-session'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

// --- Contract: 16-digit regex -------------------------------------------------
assert(/^[0-9]{16}$/.test('1234567890123456') === true, '16-digit regex must match 16 digits')
assert(isValidAccessCode('1234567890123456') === true, '16 digits valid')
assert(isValidAccessCode('123456789012345') === false, '15 digits invalid')
assert(isValidAccessCode('abcdefghijklmnop') === false, 'letters invalid')

// --- Contract: test bypass is configured server-side and disabled in prod ----
const savedTestMode = process.env.E2E_TEST_MODE
const savedVercelEnv = process.env.VERCEL_ENV
const savedCi = process.env.CI
const savedDisableRateLimit = process.env.DISABLE_RATE_LIMIT
delete process.env.E2E_TEST_MODE
process.env.VERCEL_ENV = 'preview'
process.env.CI = 'true'
process.env.DISABLE_RATE_LIMIT = 'true'
assert(!isTrustedTestMode(), 'client-independent test flags do not enable bypass')
process.env.E2E_TEST_MODE = 'true'
assert(isTrustedTestMode(), 'server test configuration enables bypass')
process.env.VERCEL_ENV = 'production'
assert(!isTrustedTestMode(), 'production cannot enable the test bypass')
if (savedTestMode === undefined) delete process.env.E2E_TEST_MODE
else process.env.E2E_TEST_MODE = savedTestMode
if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
else process.env.VERCEL_ENV = savedVercelEnv
if (savedCi === undefined) delete process.env.CI
else process.env.CI = savedCi
if (savedDisableRateLimit === undefined) delete process.env.DISABLE_RATE_LIMIT
else process.env.DISABLE_RATE_LIMIT = savedDisableRateLimit
assert(ACCESS_REQUEST_MAX_PER_HOUR === 5, 'rate limit must be 5/h')
assert(getAccessRequestQuota(4).allowed, 'fifth request is allowed')
assert(!getAccessRequestQuota(5).allowed, 'sixth request is blocked')

// --- Contract: hashIp ---------------------------------------------------------
const hashed = hashIp('10.0.0.1')
assert(hashed.length === 32, 'hashIp returns 32 hex chars')
assert(!hashed.includes('10.0.0.1'), 'hashIp must not leak raw IP')
assert(hashIp('10.0.0.1') === hashed, 'hashIp stable')
assert(hashIp('') === '', 'empty IP hashes to empty')

// --- Contract: UUID token -----------------------------------------------------
const token = generateSessionToken()
assert(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token),
  'session token must be UUID',
)

// --- Contract: first protected action ends the session immediately -------------
const now = 1_700_000_000_000
const scheduled = computeLogoutAt(now)
assert(scheduled.getTime() === now, 'logoutAt is the action time')
assert(
  shouldScheduleLogout({
    transactionUsed: true,
    pdfGenerated: false,
    logoutAt: null,
  }) === true,
  'schedule immediately after a transaction',
)
assert(
  shouldScheduleLogout({
    transactionUsed: false,
    pdfGenerated: true,
    logoutAt: null,
  }) === true,
  'schedule immediately after a PDF',
)
assert(
  shouldScheduleLogout({
    transactionUsed: false,
    pdfGenerated: false,
    logoutAt: null,
  }) === false,
  'do not schedule without a consumed action',
)
assert(
  shouldScheduleLogout({
    transactionUsed: true,
    pdfGenerated: false,
    logoutAt: new Date(now),
  }) === false,
  'do not reschedule an ended session',
)
assert(
  getConsumedActionError(
    { transactionUsed: true, pdfGenerated: false },
    'transaction_already_used',
  ) === 'transaction_already_used',
  'a second payment is rejected after the first payment',
)
assert(
  getConsumedActionError(
    { transactionUsed: true, pdfGenerated: false },
    'pdf_already_generated',
  ) === 'pdf_already_generated',
  'a PDF is rejected after a payment consumed the session',
)
assert(
  getConsumedActionError(
    { transactionUsed: false, pdfGenerated: true },
    'transaction_already_used',
  ) === 'transaction_already_used',
  'a payment is rejected after a PDF consumed the session',
)
assert(
  getConsumedActionError(
    { transactionUsed: false, pdfGenerated: true },
    'pdf_already_generated',
  ) === 'pdf_already_generated',
  'a second PDF is rejected after the first PDF',
)
const first = computeLogoutAt(now)
const second = computeLogoutAt(now)
assert(first.getTime() === second.getTime(), 'computeLogoutAt deterministic for same now')

// --- Contract: isAccessRequestExpired 24h -------------------------------------
assert(isAccessRequestExpired(new Date()) === false, 'fresh not expired')
assert(
  isAccessRequestExpired(new Date(Date.now() - 25 * 60 * 60 * 1000)) === true,
  '25h expired',
)
assert(isAccessRequestExpired(null) === true, 'null expired')

// --- Contract: endSession values ----------------------------------------------
const ended = buildEndSessionValues(new Date(now))
assert(ended.status === 'ended', 'endSession sets status ended')
assert(ended.endedAt.getTime() === now, 'endSession sets endedAt')
assert(ended.logoutAt.getTime() === now, 'endSession sets logoutAt to the action time')

// --- Contract: formatAccessCode -----------------------------------------------
assert(formatAccessCode('1234567890123456') === '1234 5678 9012 3456', '4x4 format')

console.log('access-flow.regression.test.ts: all assertions passed')