import {
  isValidAccessCode,
  generateSessionToken,
  checkAccessRequestRateLimit,
  getRemainingAccessRequests,
  hashIp,
  simplifyUserAgent,
  formatAccessCode,
  isAccessRequestExpired,
  ACCESS_REQUEST_MAX_PER_HOUR,
  ACCESS_AUTO_LOGOUT_SECONDS,
} from '@/lib/access-flow'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

// --- Contract: exactly 16 digits, nothing else ------------------------------
assert(isValidAccessCode('1234567890123456') === true, '16 digits should be valid')
assert(isValidAccessCode('123456789012345') === false, '15 digits should be invalid')
assert(isValidAccessCode('12345678901234567') === false, '17 digits should be invalid')
assert(isValidAccessCode('123456789012345a') === false, 'letters should be invalid')
assert(isValidAccessCode('1234 5678 9012 345') === false, 'spaces should be invalid')
assert(isValidAccessCode('') === false, 'empty should be invalid')
assert(isValidAccessCode('1234567890123456 ') === false, 'trailing space should be invalid')

// --- Contract: rate limit max 5 per hour ------------------------------------
const rateKey = `test-rate-${Date.now()}`
const savedDisable = process.env.DISABLE_RATE_LIMIT
delete process.env.DISABLE_RATE_LIMIT
for (let i = 0; i < ACCESS_REQUEST_MAX_PER_HOUR; i++) {
  assert(
    checkAccessRequestRateLimit(rateKey) === true,
    `request ${i + 1} should be allowed within limit`,
  )
}
assert(
  checkAccessRequestRateLimit(rateKey) === false,
  'request 6 should be rate limited',
)
assert(
  getRemainingAccessRequests(rateKey) === 0,
  'remaining requests should be 0 after limit',
)
const freshKey = `test-fresh-${Date.now()}`
assert(
  getRemainingAccessRequests(freshKey) === ACCESS_REQUEST_MAX_PER_HOUR,
  'fresh key should have full quota',
)
if (savedDisable === undefined) {
  delete process.env.DISABLE_RATE_LIMIT
} else {
  process.env.DISABLE_RATE_LIMIT = savedDisable
}

// --- Contract: session token is a UUID ----------------------------------------
const token = generateSessionToken()
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
assert(uuidRegex.test(token), 'session token should be a UUID')
assert(token !== generateSessionToken(), 'session tokens should be unique')

// --- Contract: IP hashing never exposes raw IP --------------------------------
const hashed = hashIp('192.168.1.100')
assert(hashed.length > 0, 'hash should not be empty')
assert(!hashed.includes('192.168.1.100'), 'hash must not contain raw IP')
assert(hashed === hashIp('192.168.1.100'), 'same IP should hash identically')
assert(hashIp('192.168.1.101') !== hashed, 'different IP should hash differently')

// --- Contract: user agent simplification --------------------------------------
const ua = simplifyUserAgent(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
)
assert(ua !== null && ua.includes('iPhone'), 'device hint should contain iPhone')
assert(ua !== null && ua.includes('Chrome'), 'device hint should contain Chrome')
assert(simplifyUserAgent(null) === null, 'null UA should return null')

// --- Contract: code formatting 4x4 --------------------------------------------
assert(formatAccessCode('1234567890123456') === '1234 5678 9012 3456', 'code should format as 4x4')

// --- Contract: 24h request expiry ----------------------------------------------
const now = new Date()
assert(isAccessRequestExpired(now) === false, 'fresh request should not be expired')
const old = new Date(now.getTime() - 25 * 60 * 60 * 1000)
assert(isAccessRequestExpired(old) === true, '25h old request should be expired')
const boundary = new Date(now.getTime() - (24 * 60 * 60 * 1000 - 60000))
assert(isAccessRequestExpired(boundary) === false, '23h59m old request should not be expired')
assert(isAccessRequestExpired(null) === true, 'null createdAt should count as expired')

// --- Contract: auto-logout is exactly 60 seconds -------------------------------
assert(ACCESS_AUTO_LOGOUT_SECONDS === 60, 'auto-logout must be exactly 60 seconds')

console.log('access-flow.test.ts: all assertions passed')
