export const APP_PIN_COOKIE = 'app_pin_verified'
export const APP_PIN_TOKEN = 'granted'

export function getAppPin(): string | null {
  const configured = process.env.APP_PIN?.trim()
  return configured || null
}

export function isAppPinConfigured(): boolean {
  return getAppPin() !== null
}

export function isValidAppPin(pin: string): boolean {
  const expected = getAppPin()
  if (!expected) {
    return false
  }
  return pin === expected
}
