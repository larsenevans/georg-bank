import {
  isValidAccessCode,
  generateSessionToken,
  hashIp,
  getClientIp,
  simplifyUserAgent,
  formatAccessCode,
  isAccessRequestExpired,
  ACCESS_REQUEST_MAX_PER_HOUR,
  getAccessRequestQuota,
  isTrustedTestMode,
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

// --- Contract: test-only bypass requires server configuration ---------------
const savedTestMode = process.env.E2E_TEST_MODE
const savedVercelEnv = process.env.VERCEL_ENV
const savedCi = process.env.CI
const savedDisableRateLimit = process.env.DISABLE_RATE_LIMIT
delete process.env.E2E_TEST_MODE
process.env.CI = 'true'
process.env.DISABLE_RATE_LIMIT = 'true'
process.env.VERCEL_ENV = 'preview'
assert(!isTrustedTestMode(), 'CI and rate-limit env flags do not enable bypass')
process.env.E2E_TEST_MODE = 'true'
assert(isTrustedTestMode(), 'bypass is enabled by trusted test configuration')
process.env.VERCEL_ENV = 'production'
assert(!isTrustedTestMode(), 'bypass remains disabled in production')
if (savedTestMode === undefined) delete process.env.E2E_TEST_MODE
else process.env.E2E_TEST_MODE = savedTestMode
if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV
else process.env.VERCEL_ENV = savedVercelEnv
if (savedCi === undefined) delete process.env.CI
else process.env.CI = savedCi
if (savedDisableRateLimit === undefined) delete process.env.DISABLE_RATE_LIMIT
else process.env.DISABLE_RATE_LIMIT = savedDisableRateLimit
assert(ACCESS_REQUEST_MAX_PER_HOUR === 5, 'access request limit is 5 per hour')
assert(getAccessRequestQuota(0).remainingRequests === 4, 'first request leaves 4')
assert(getAccessRequestQuota(4).allowed, 'fifth request is allowed')
assert(getAccessRequestQuota(4).remainingRequests === 0, 'fifth request leaves 0')
assert(!getAccessRequestQuota(5).allowed, 'sixth request is blocked')

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

// --- Contract: buildAdminEmailHtml with email & green/red buttons --------------
import { buildAdminEmailHtml } from '@/lib/access-flow'
const emailHtml = buildAdminEmailHtml({
  email: 'test@example.com',
  deviceHint: 'Windows · Chrome',
  createdAt: new Date(),
  decideBaseUrl: 'http://localhost:3000',
  requestId: 'req-123',
  token: 'tok-456',
})
assert(emailHtml.includes('SCHVÁLIŤ PRÍSTUP'), 'must contain green approve button')
assert(emailHtml.includes('ZAMIETNUŤ'), 'must contain red reject button')
assert(emailHtml.includes('test@example.com'), 'must contain email')

// --- Contract: spoofed X-Forwarded-For rate-limit bypass prevention -----------
const realClientIp = '198.51.100.42'
const spoofedHeader1 = `1.2.3.4, ${realClientIp}`
const spoofedHeader2 = `5.6.7.8, 9.10.11.12, ${realClientIp}`
const headers1 = new Headers({ 'x-forwarded-for': spoofedHeader1 })
const headers2 = new Headers({ 'x-forwarded-for': spoofedHeader2 })

const extractedIp1 = getClientIp(headers1)
const extractedIp2 = getClientIp(headers2)

assert(extractedIp1 === realClientIp, 'must extract trusted rightmost client IP from x-forwarded-for')
assert(extractedIp2 === realClientIp, 'must extract trusted rightmost client IP regardless of prepended spoofed IPs')
assert(hashIp(extractedIp1) === hashIp(extractedIp2), 'spoofed X-Forwarded-For must map to same IP hash and share same rate-limit budget')

console.log('access-flow.test.ts: all assertions passed')
