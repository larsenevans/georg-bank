import { getAppPin, isValidAppPin, isAppPinConfigured } from '@/lib/app-pin'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const savedAppPin = process.env.APP_PIN
delete process.env.APP_PIN

assert(getAppPin() === null, 'APP_PIN should be null when unset')
assert(!isAppPinConfigured(), 'APP_PIN should not be configured when unset')
assert(!isValidAppPin('666666'), 'any pin invalid when APP_PIN unset')
assert(!isValidAppPin('123456'), 'any pin invalid when APP_PIN unset')

process.env.APP_PIN = '999999'
assert(getAppPin() === '999999', 'APP_PIN env override should work')
assert(isAppPinConfigured(), 'APP_PIN should be configured when set')
assert(isValidAppPin('999999'), 'custom PIN should be valid')
assert(!isValidAppPin('666666'), 'other PIN should be invalid')

if (savedAppPin === undefined) {
  delete process.env.APP_PIN
} else {
  process.env.APP_PIN = savedAppPin
}

console.log('app-pin.test.ts: all assertions passed')
