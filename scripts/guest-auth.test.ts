import { getGuestConfig, isDedicatedGuestEmail } from '../lib/guest-auth'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(isDedicatedGuestEmail('admin@local.test'), 'admin@local.test is a dedicated guest email')
assert(isDedicatedGuestEmail('Peter@LOCAL.TEST'), 'case-insensitive @local.test suffix')
assert(!isDedicatedGuestEmail('peter@example.com'), 'real emails must not be guest inboxes')
assert(!isDedicatedGuestEmail('admin@internetbank.sk'), 'production admin is not a guest inbox')

const savedEmail = process.env.GUEST_USER_EMAIL
const savedPassword = process.env.GUEST_USER_PASSWORD

delete process.env.GUEST_USER_EMAIL
delete process.env.GUEST_USER_PASSWORD

const missingConfig = getGuestConfig()
assert(!missingConfig.ok, 'guest config should fail when env is missing')
if (!missingConfig.ok) {
  assert(
    missingConfig.missingKeys.includes('GUEST_USER_EMAIL'),
    'should report missing GUEST_USER_EMAIL'
  )
  assert(
    missingConfig.missingKeys.includes('GUEST_USER_PASSWORD'),
    'should report missing GUEST_USER_PASSWORD'
  )
}

process.env.GUEST_USER_EMAIL = 'admin@internetbank.sk'
process.env.GUEST_USER_PASSWORD = 'secret'

const invalidConfig = getGuestConfig()
assert(!invalidConfig.ok, 'guest config should fail for non-local.test email')
if (!invalidConfig.ok) {
  assert(
    invalidConfig.invalidKeys.includes('GUEST_USER_EMAIL'),
    'should report invalid GUEST_USER_EMAIL'
  )
}

process.env.GUEST_USER_EMAIL = 'admin@local.test'
process.env.GUEST_USER_PASSWORD = 'admin1234'

const validConfig = getGuestConfig()
assert(validConfig.ok, 'guest config should succeed with valid env')
if (validConfig.ok) {
  assert(validConfig.email === 'admin@local.test', 'email should match env')
  assert(validConfig.password === 'admin1234', 'password should match env')
}

if (savedEmail === undefined) {
  delete process.env.GUEST_USER_EMAIL
} else {
  process.env.GUEST_USER_EMAIL = savedEmail
}

if (savedPassword === undefined) {
  delete process.env.GUEST_USER_PASSWORD
} else {
  process.env.GUEST_USER_PASSWORD = savedPassword
}

console.log('guest-auth.test.ts: all assertions passed')
