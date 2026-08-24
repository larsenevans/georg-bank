import { isDedicatedGuestEmail } from '../lib/guest-auth'

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(isDedicatedGuestEmail('admin@local.test'), 'admin@local.test is a dedicated guest email')
assert(isDedicatedGuestEmail('Peter@LOCAL.TEST'), 'case-insensitive @local.test suffix')
assert(!isDedicatedGuestEmail('peter@example.com'), 'real emails must not be guest inboxes')
assert(!isDedicatedGuestEmail('admin@internetbank.sk'), 'production admin is not a guest inbox')

console.log('guest-auth.test.ts: all assertions passed')
