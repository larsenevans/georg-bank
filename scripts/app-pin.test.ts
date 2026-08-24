import { getAppPin, isValidAppPin } from '@/lib/app-pin'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(getAppPin() === '666666', 'default APP_PIN should be 666666')
assert(isValidAppPin('666666'), '666666 should be valid')
assert(!isValidAppPin('123456'), '123456 should be invalid')

process.env.APP_PIN = '999999'
assert(getAppPin() === '999999', 'APP_PIN env override should work')
assert(isValidAppPin('999999'), 'custom PIN should be valid')
assert(!isValidAppPin('666666'), 'old default should be invalid after override')

console.log('app-pin.test.ts: all assertions passed')
